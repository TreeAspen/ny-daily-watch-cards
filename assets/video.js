/* NY Daily Watch — slideshow encoder for Reels/TikTok.
   Composites stills and clips onto a 1080x1920 canvas and records it through
   MediaRecorder. Recording is wall-clock bound: a 30s video takes 30s to
   make. That is the price of the only encoder every browser ships — and it is
   also what lets a video clip play at its own speed inside the cut. */

import { SAFE } from './render.js';

export const V = { W: 1080, H: 1920, fps: 30 };

/* MP4 first — Instagram's web uploader rejects WebM. Chrome and Safari can
   record MP4 directly; Firefox cannot, and falls through to WebM. */
const MIMES = [
  'video/mp4;codecs=avc1.4d002a',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

export const extFor = (mime) => (mime && mime.startsWith('video/mp4') ? 'mp4' : 'webm');

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---- the slide model --------------------------------------------------- */
/* A slide is { el, kind, sub } — el is an <img> or a <video>. Callers may also
   pass a bare element, which is wrapped here, so older call sites (and the
   guide's illustrations) keep working. */
export function asSlide(x) {
  if (!x) return null;
  if (x.el) return x;
  return { el: x, kind: isVideo(x) ? 'video' : 'image', sub: '' };
}

export const isVideo = (el) =>
  typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement;

/* A <video> reports its frame size on videoWidth/videoHeight; width/height are
   the layout attributes and are usually zero. */
const dims = (el) => ({
  w: el.videoWidth || el.naturalWidth || el.width,
  h: el.videoHeight || el.naturalHeight || el.height,
});

/* ---- motion and transitions ------------------------------------------ */
export const MOTIONS = ['none', 'in', 'out', 'alternate', 'drift'];
export const TRANSITIONS = ['crossfade', 'cut', 'black', 'push'];

const TRAVEL = 0.055;   // how far a push/pull moves, as a fraction of size

/* The transform for slide `i` at progress `k` (0→1 across its own time). */
function motionAt(kind, i, k) {
  const e = ease(Math.max(0, Math.min(1, k)));
  switch (kind) {
    case 'in': return { zoom: 1 + TRAVEL * e, dy: 0 };
    case 'out': return { zoom: 1 + TRAVEL * (1 - e), dy: 0 };
    // Alternating keeps a long reel from feeling like one repeated move.
    case 'alternate': return i % 2
      ? { zoom: 1 + TRAVEL * (1 - e), dy: 0 }
      : { zoom: 1 + TRAVEL * e, dy: 0 };
    // A little zoom is held back so the drift never exposes an edge.
    case 'drift': return { zoom: 1 + TRAVEL * 0.7, dy: (0.5 - e) * 30 };
    default: return { zoom: 1, dy: 0 };
  }
}

/* Every slide runs the full width of the frame — no side bars, ever. A still
   tall enough to fill the height is simply cropped to it; a shorter one (a 4:5
   card above all) keeps its full width and leaves blurred bands above and
   below. Those bands are not centred on the frame but on the safe strip, which
   lifts the picture clear of the app's own caption without narrowing it. */
function drawSlide(ctx, slide, m, alpha) {
  const el = slide.el;
  const { w: sw, h: sh } = dims(el);
  if (!sw || !sh) return;            // a clip whose metadata has not landed yet

  ctx.save();
  ctx.globalAlpha = alpha;
  const { zoom, dy } = m;
  const fullH = (sh / sw) * V.W;

  if (fullH >= V.H - 2) {
    ctx.save();
    ctx.translate(0, dy);
    cover(ctx, el, 0, 0, V.W, V.H, zoom);
    ctx.restore();
  } else {
    ctx.save();
    ctx.filter = 'blur(48px) brightness(0.42)';
    cover(ctx, el, -60, -60, V.W + 120, V.H + 120, 1.06);
    ctx.restore();

    const w = V.W * zoom, h = fullH * zoom;
    const safeH = V.H - SAFE.top - SAFE.bottom;
    const y = Math.max(0, Math.min(V.H - h, SAFE.top + (safeH - h) / 2)) + dy;
    ctx.drawImage(el, (V.W - w) / 2, y, w, h);
  }
  ctx.restore();
}

function cover(ctx, el, x, y, w, h, zoom = 1) {
  const { w: sw, h: sh } = dims(el);
  const scale = Math.max(w / sw, h / sh) * zoom;
  const dw = sw * scale, dh = sh * scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/* ---- title cards ----------------------------------------------------- */
const INK = '#121212', GOLD = '#EFC050', CREAM = '#EADFC2', WHITE = '#FFFFFF';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const stage = (p, a, b) => ease(clamp01((p - a) / (b - a)));

function circle(ctx, img, x, y, s, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); ctx.clip();
  const scale = Math.min(s / img.width, s / img.height);
  ctx.drawImage(img, x + (s - img.width * scale) / 2, y + (s - img.height * scale) / 2,
    img.width * scale, img.height * scale);
  ctx.restore();
}

/* Fades up and drifts a few px into place — enough motion to read as video
   rather than a still someone forgot to cut. */
function rise(ctx, k, draw) {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.translate(0, (1 - k) * 18);
  draw();
  ctx.restore();
}

function rule(ctx, cx, y, w, h, k) {
  if (k <= 0) return;
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - (w * k) / 2, y, w * k, h);
}

export function drawIntro(ctx, p, brand = {}, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK; ctx.fillRect(0, 0, V.W, V.H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const cx = V.W / 2;
  const L = { logo: 200, g1: 46, mark: 62, g2: 34, rule: 7, g3: 30, date: 34 };
  const total = L.logo + L.g1 + L.mark + L.g2 + L.rule + L.g3 + L.date;
  let y = SAFE.top + (V.H - SAFE.top - SAFE.bottom - total) / 2;

  const kLogo = stage(p, 0, 0.28);
  if (brand.logo && kLogo > 0) {
    const s = L.logo * (0.9 + 0.1 * kLogo);
    ctx.save(); ctx.globalAlpha *= kLogo;
    circle(ctx, brand.logo, cx - s / 2, y + (L.logo - s) / 2, s, 1);
    ctx.restore();
  }
  y += L.logo + L.g1;

  rise(ctx, stage(p, 0.34, 0.62), () => {
    ctx.fillStyle = GOLD;
    ctx.font = `700 ${L.mark}px "Playfair Display"`;
    ctx.letterSpacing = '0.06em';
    ctx.fillText(brand.wordmark || 'NY DAILY WATCH', cx, y + L.mark * 0.8);
    ctx.letterSpacing = '0px';
  });
  y += L.mark + L.g2;

  rule(ctx, cx, y, 170, L.rule, stage(p, 0.22, 0.5));
  y += L.rule + L.g3;

  if (brand.date) {
    rise(ctx, stage(p, 0.5, 0.78), () => {
      ctx.fillStyle = CREAM;
      ctx.font = `300 ${L.date}px "Montserrat"`;
      ctx.letterSpacing = '0.16em';
      ctx.fillText(String(brand.date).toUpperCase(), cx, y + L.date * 0.8);
      ctx.letterSpacing = '0px';
    });
  }
  ctx.restore();
}

export function drawOutro(ctx, p, brand = {}, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK; ctx.fillRect(0, 0, V.W, V.H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const cx = V.W / 2;
  const L = { logo: 170, g1: 44, rule: 7, g2: 36, kicker: 30, g3: 28, handle: 74, g4: 24, tail: 30 };
  const total = L.logo + L.g1 + L.rule + L.g2 + L.kicker + L.g3 + L.handle + L.g4 + L.tail;
  let y = SAFE.top + (V.H - SAFE.top - SAFE.bottom - total) / 2;

  const kLogo = stage(p, 0, 0.22);
  if (brand.logo && kLogo > 0) circle(ctx, brand.logo, cx - L.logo / 2, y, L.logo, kLogo);
  y += L.logo + L.g1;

  rule(ctx, cx, y, 140, L.rule, stage(p, 0.18, 0.42));
  y += L.rule + L.g2;

  rise(ctx, stage(p, 0.3, 0.5), () => {
    ctx.fillStyle = CREAM;
    ctx.font = `600 ${L.kicker}px "Montserrat"`;
    ctx.letterSpacing = '0.2em';
    ctx.fillText('READ MORE AT', cx, y + L.kicker * 0.8);
    ctx.letterSpacing = '0px';
  });
  y += L.kicker + L.g3;

  rise(ctx, stage(p, 0.4, 0.65), () => {
    ctx.fillStyle = GOLD;
    ctx.font = `700 ${L.handle}px "Playfair Display"`;
    ctx.fillText(brand.handle || '@theNYdailywatch', cx, y + L.handle * 0.8);
  });
  y += L.handle + L.g4;

  rise(ctx, stage(p, 0.55, 0.8), () => {
    ctx.fillStyle = WHITE;
    ctx.font = `300 ${L.tail}px "Montserrat"`;
    ctx.letterSpacing = '0.12em';
    ctx.fillText(brand.tail || 'LINK IN BIO', cx, y + L.tail * 0.8);
    ctx.letterSpacing = '0px';
  });
  ctx.restore();
}

/* ---- subtitles --------------------------------------------------------- */
/* Burned in, because a Reel is watched with the sound off and the platform's
   own caption is somewhere else entirely. Each line gets its own backing pill:
   over footage nobody controls, a scrim is a guess and a pill is a guarantee. */
const SUB = { size: 56, min: 34, lh: 1.26, maxLines: 3, side: 84, lift: 30, pad: 22, radius: 12 };

function wrapWords(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawSubtitle(ctx, text, alpha = 1) {
  const t = String(text || '').trim();
  if (!t || alpha <= 0) return;

  const colW = V.W - 2 * SUB.side;
  const fit = (size) => {
    ctx.font = `700 ${size}px "Montserrat"`;
    return wrapWords(ctx, t, colW);
  };
  let size = SUB.size;
  while (size > SUB.min && fit(size).length > SUB.maxLines) size -= 2;
  const lines = fit(size);
  const lineH = size * SUB.lh;

  // The block sits on the floor of the safe box, above whatever the app draws.
  let y = V.H - SAFE.bottom - SUB.lift - lines.length * lineH;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    ctx.font = `700 ${size}px "Montserrat"`;
    const w = ctx.measureText(line).width;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    roundRect(ctx, (V.W - w) / 2 - SUB.pad, y + lineH * 0.08,
      w + SUB.pad * 2, lineH * 0.92, SUB.radius);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.fillText(line, V.W / 2, y + lineH * 0.76);
    y += lineH;
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

/* ---- the timeline ------------------------------------------------------ */
/* Short footage is cut to a rhythm you choose: the running time is yours and
   every slide gets an equal share of it. But a clip a minute or longer is not
   an illustration of the story, it IS the story — cutting it to fit a 30s
   setting would throw most of it away. So once any clip runs a minute or more
   the plan flips: every clip plays in full, stills take a fixed beat, and the
   running time is whatever that adds up to, plus the titles. */
export const LONG_CLIP = 60;      // seconds: at or past this, the cut fits the footage
export const STILL_SECS = 5;      // what a still is worth when the footage leads

const durOf = (slide) => (slide.kind === 'video' && slide.el.duration > 0
  ? slide.el.duration : 0);

export function planTimeline(slides, opts = {}) {
  const intro = opts.intro || 0;
  const outro = opts.outro || 0;
  const fitted = slides.some((s) => durOf(s) >= LONG_CLIP);

  let spans;
  if (fitted) {
    const still = opts.stillSecs || STILL_SECS;
    spans = slides.map((s) => durOf(s) || still);
  } else {
    const room = Math.max(0.2, (opts.total || 30) - intro - outro);
    spans = slides.map(() => room / (slides.length || 1));
  }

  const body = spans.reduce((a, b) => a + b, 0) || 0.2;
  const starts = [];
  let at = 0;
  for (const span of spans) { starts.push(at); at += span; }   // measured from the body's start

  return { fitted, spans, starts, body, intro, outro, total: intro + body + outro };
}

/* Which slide is on screen `st` seconds into the body, and how far into it. */
function slideAt(plan, st) {
  const n = plan.spans.length;
  for (let i = 0; i < n; i++) {
    if (st < plan.starts[i] + plan.spans[i]) return { i, local: st - plan.starts[i] };
  }
  return { i: n - 1, local: plan.spans[n - 1] };
}

/* ---- cues -------------------------------------------------------------- */
/* A slide's subtitle is one cue per line. The slot is shared out by length,
   because a long line needs longer to read than a short one, with a floor so a
   short cue never flashes past. Cues hard-cut into each other: two pill-backed
   lines crossfading would just stack two dark boxes. */
export const MIN_CUE = 1.2;

export const cuesOf = (slide) =>
  String((slide && slide.sub) || '').split('\n').map((l) => l.trim()).filter(Boolean);

export function cueSpans(cues, per) {
  if (cues.length < 2) return cues.map(() => per);
  // Every cue is given the floor first; only what is left over is shared out by
  // length. Weighting first and clamping after would put a cue back under it.
  const floor = Math.min(MIN_CUE, per / cues.length);
  const spare = per - floor * cues.length;
  if (spare <= 0) return cues.map(() => per / cues.length);
  const lens = cues.map((c) => Math.max(1, c.length));
  const sum = lens.reduce((a, b) => a + b, 0);
  return lens.map((l) => floor + (spare * l) / sum);
}

/* The cue showing `local` seconds into a slide whose slot is `per` long. */
export function cueAt(slide, local, per) {
  const cues = cuesOf(slide);
  if (!cues.length) return '';
  if (cues.length === 1) return cues[0];
  const spans = cueSpans(cues, per);
  let t = 0;
  for (let i = 0; i < cues.length; i++) {
    t += spans[i];
    if (local < t) return cues[i];
  }
  return cues[cues.length - 1];
}

/* ---- clip playback ----------------------------------------------------- */
/* drawFrame only ever paints; who is playing is decided here, so the recorder
   (real time, let it run) and the scrub preview (seek to the exact frame) can
   ask for the same moment in two different ways. */
export function syncClips(slides, t, opts, { live = false, gains = null } = {}) {
  const intro = opts.intro || 0;
  const fade = opts.transition === 'cut' ? 0 : (opts.fade ?? 0.6);
  const plan = planTimeline(slides, opts);
  const st = t - intro;
  const active = st < 0 ? -1 : slideAt(plan, Math.min(st, plan.body)).i;

  slides.forEach((slide, i) => {
    if (slide.kind !== 'video') return;
    const el = slide.el;
    const per = plan.spans[i];
    const local = st - plan.starts[i];
    // A clip that fills its own slot has nothing to loop back for; a short one
    // repeats rather than freezing on its last frame.
    el.loop = per > (el.duration || 0) + 0.05;
    // A clip is already on screen while the previous slide fades out of it.
    const onScreen = i === active ||
      (i === active + 1 && fade > 0 && active >= 0 &&
        st - plan.starts[active] > plan.spans[active] - fade);

    if (gains) gains.get(slide) && (gains.get(slide).gain.value = i === active ? 1 : 0);

    if (live) {
      if (onScreen && el.paused) el.play().catch(() => {});
      else if (!onScreen && !el.paused) el.pause();
      // Restart at the top of its own slot rather than carrying on from a
      // previous pass through the timeline.
      if (i === active && local >= 0 && local < 0.14 && el.currentTime > 0.4) el.currentTime = 0;
    } else {
      if (!el.paused) el.pause();
      const d = el.duration || 1;
      const at = local <= 0 ? 0 : ((local % d) + d) % d;
      if (Math.abs(el.currentTime - at) > 0.05) el.currentTime = clampN(at, 0, Math.max(0, d - 0.05));
    }
  });
}

export function resetClips(slides) {
  for (const slide of slides) {
    if (slide.kind !== 'video') continue;
    slide.el.pause();
    try { slide.el.currentTime = 0; } catch (_) { /* not seekable yet */ }
  }
}

/* ---- clip audio -------------------------------------------------------- */
/* One AudioContext for the page, and one source node per element, both cached:
   a media element can only be tapped once, and only by one context, so a second
   recording has to reuse the first one's graph. */
let AUDIO_CTX = null;

function buildAudio(slides) {
  const clips = slides.filter((s) => s.kind === 'video');
  if (!clips.length) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    AUDIO_CTX = AUDIO_CTX || new AC();
    if (AUDIO_CTX.state === 'suspended') AUDIO_CTX.resume();
    const dest = AUDIO_CTX.createMediaStreamDestination();
    const gains = new Map();
    for (const slide of clips) {
      const el = slide.el;
      el.muted = false;
      if (!el.__ndwTap) el.__ndwTap = AUDIO_CTX.createMediaElementSource(el);
      const g = AUDIO_CTX.createGain();
      g.gain.value = 0;
      el.__ndwTap.connect(g);
      g.connect(dest);
      gains.set(slide, g);
    }
    return { dest, gains };
  } catch (_) {
    // No audio is a worse video, but a failed recording is worse still.
    return null;
  }
}

function teardownAudio(audio, slides) {
  if (!audio) return;
  for (const g of audio.gains.values()) { try { g.disconnect(); } catch (_) {} }
  for (const slide of slides) if (slide.kind === 'video') slide.el.muted = true;
}

/* Paints the frame at time `t` seconds. Exported so the page can scrub a
   preview through the same code the recorder runs. */
export function drawFrame(ctx, rawSlides, t, opts) {
  const slides = rawSlides.length && rawSlides[0].el ? rawSlides : rawSlides.map(asSlide);
  const { intro = 0, outro = 0, brand } = opts;
  const subs = opts.subtitles !== false;
  const motion = opts.motion ?? (opts.zoom === false ? 'none' : 'in');
  const transition = opts.transition || 'crossfade';
  // A cut is a crossfade with no time in it, so the boundaries fall out free.
  const fade = transition === 'cut' ? 0 : (opts.fade ?? 0.6);

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, V.W, V.H);

  if (!slides.length) {
    if (intro) drawIntro(ctx, clamp01(t / intro), brand);
    return;
  }

  const plan = planTimeline(slides, opts);
  const body = plan.body;
  const m = (i, local) => motionAt(motion, i, local / plan.spans[i]);

  // The outro's own clock starts while the last slide is still fading out, so
  // the animation does not restart when the crossfade finishes.
  const outroAt = intro + body - fade;
  const outroP = outro ? clamp01((t - outroAt) / (outro + fade)) : 0;

  if (t < intro) {
    drawIntro(ctx, clamp01(t / intro), brand);
    const rem = intro - t;
    if (rem < fade) {
      drawSlide(ctx, slides[0], m(0, 0), 1 - rem / fade);
      if (subs) drawSubtitle(ctx, cueAt(slides[0], 0, plan.spans[0]), 1 - rem / fade);
    }
    return;
  }

  const st = Math.min(t - intro, body);
  const { i, local } = slideAt(plan, st);
  const per = plan.spans[i];
  const next = slides[i + 1];
  const turning = next && fade > 0 && local > per - fade;
  const u = turning ? (local - (per - fade)) / fade : 0;

  if (turning && transition === 'black') {
    // Out to black, then in from black — one half of the window each.
    if (u < 0.5) {
      drawSlide(ctx, slides[i], m(i, local), 1);
      ctx.save();
      ctx.globalAlpha = u * 2;
      ctx.fillStyle = INK; ctx.fillRect(0, 0, V.W, V.H);
      ctx.restore();
      if (subs) drawSubtitle(ctx, cueAt(slides[i], local, per), 1 - u * 2);
    } else {
      drawSlide(ctx, next, m(i + 1, 0), (u - 0.5) * 2);
      if (subs) drawSubtitle(ctx, cueAt(next, 0, plan.spans[i + 1]), (u - 0.5) * 2);
    }
  } else if (turning && transition === 'push') {
    const e = ease(u);
    ctx.save(); ctx.translate(0, -V.H * e);
    drawSlide(ctx, slides[i], m(i, local), 1);
    if (subs) drawSubtitle(ctx, cueAt(slides[i], local, per), 1);
    ctx.restore();
    ctx.save(); ctx.translate(0, V.H * (1 - e));
    drawSlide(ctx, next, m(i + 1, 0), 1);
    if (subs) drawSubtitle(ctx, cueAt(next, 0, plan.spans[i + 1]), 1);
    ctx.restore();
  } else {
    drawSlide(ctx, slides[i], m(i, local), 1);
    if (turning) drawSlide(ctx, next, m(i + 1, 0), u);
    if (subs) {
      const here = cueAt(slides[i], local, per);
      const there = turning ? cueAt(next, 0, plan.spans[i + 1]) : '';
      // The subtitle crossfades with its own slide, unless the words do not
      // change — then it simply stays put rather than blinking.
      const same = turning && there === here;
      drawSubtitle(ctx, here, same ? 1 : (turning ? 1 - u : 1));
      if (turning && !same) drawSubtitle(ctx, there, u);
    }
  }

  if (outro) {
    const a = clamp01((t - outroAt) / fade);
    if (a > 0) drawOutro(ctx, outroP, brand, a);
  }
}

export async function recordVideo(canvas, rawSlides, opts, onProgress, shouldStop) {
  const mime = pickMime();
  if (!mime) throw new Error('no-recorder');
  const slides = rawSlides.map(asSlide);
  const ctx = canvas.getContext('2d');
  canvas.width = V.W; canvas.height = V.H;

  resetClips(slides);
  const audio = opts.audio === false ? null : buildAudio(slides);
  const stream = canvas.captureStream(V.fps);
  const tracks = [...stream.getVideoTracks(),
    ...(audio ? audio.dest.stream.getAudioTracks() : [])];
  const rec = new MediaRecorder(new MediaStream(tracks),
    { mimeType: mime, videoBitsPerSecond: 12e6, audioBitsPerSecond: 128e3 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime })); });

  drawFrame(ctx, slides, 0, opts);
  rec.start(200);
  const started = performance.now();

  // The plan decides the running time, so a cut fitted to a long clip records
  // for as long as the footage actually runs.
  const runFor = planTimeline(slides, opts).total;
  let cancelled = false;
  await new Promise((res) => {
    const tick = () => {
      if (shouldStop?.()) { cancelled = true; res(); return; }
      const t = (performance.now() - started) / 1000;
      if (t >= runFor) { res(); return; }
      syncClips(slides, t, opts, { live: true, gains: audio ? audio.gains : null });
      drawFrame(ctx, slides, t, opts);
      onProgress?.(t / runFor);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  if (cancelled) {
    rec.stop();
    tracks.forEach((tr) => tr.stop());
    resetClips(slides);
    teardownAudio(audio, slides);
    await done;                      // let the recorder release before returning
    return { cancelled: true };
  }

  // Hold the last frame briefly so the final slide is not cut mid-fade.
  drawFrame(ctx, slides, Math.max(0, runFor - 0.01), opts);
  await new Promise((r) => setTimeout(r, 260));
  rec.stop();
  tracks.forEach((tr) => tr.stop());
  resetClips(slides);
  teardownAudio(audio, slides);
  onProgress?.(1);
  return { blob: await done, mime, ext: extFor(mime), cancelled: false, audio: !!audio };
}

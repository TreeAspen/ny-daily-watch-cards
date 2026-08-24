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
  w: el.videoWidth || el.naturalWidth || el.displayWidth || el.codedWidth || el.width,
  h: el.videoHeight || el.naturalHeight || el.displayHeight || el.codedHeight || el.height,
});

/* ---- motion and transitions ------------------------------------------ */
export const MOTIONS = ['none', 'in', 'out', 'alternate', 'drift'];
export const TRANSITIONS = ['crossfade', 'cut', 'black', 'push'];

/* Motion is a rate, not a distance. Giving every slide the same 5.5% of travel
   however long it lasts meant a long slide crawled: 0.2px a frame, under what
   8-bit pixels can even represent, so frames came out identical and the picture
   read as juddering. A fixed rate moves the same amount per frame whatever the
   slide's length; the cap keeps a long one from wandering too far. */
const PUSH_RATE = 0.018;   // zoom per second — about 0.65px a frame at 1080 wide
const PUSH_CAP = 0.16;
const DRIFT_RATE = 12;     // px per second
const DRIFT_CAP = 90;
const DRIFT_ZOOM = 1.06;   // headroom, so the drift never exposes an edge

/* The transform for slide `i` at progress `k` (0→1 across its own time).

   Deliberately linear. An eased push spends its first and last moments moving
   so slowly that consecutive frames land on identical pixels — the picture
   sticks, then goes, and that reads as dropped frames even though every frame
   is there. A camera pushing at a constant rate does not do that, and it is
   what a real one does anyway. Easing stays where it belongs: transitions. */
function motionAt(kind, i, k, span = 8, footage = false) {
  // Footage already moves. A slow zoom laid over it fights the shot and, on a
  // long clip, crawls slowly enough to judder.
  if (footage) return { zoom: 1, dy: 0, peak: 1 };
  const e = Math.max(0, Math.min(1, k));
  const travel = Math.min(PUSH_CAP, PUSH_RATE * span);
  // `peak` is the largest this motion ever scales to. A picture that overflows
  // the frame can be pushed past 1 and only loses overflow; a card sitting
  // inside the frame would lose its own margins, so drawSlide divides by peak
  // and the same move lands as a push up to full width instead of past it.
  switch (kind) {
    case 'in': return { zoom: 1 + travel * e, dy: 0, peak: 1 + travel };
    case 'out': return { zoom: 1 + travel * (1 - e), dy: 0, peak: 1 + travel };
    // Alternating keeps a long reel from feeling like one repeated move.
    case 'alternate': return i % 2
      ? { zoom: 1 + travel * (1 - e), dy: 0, peak: 1 + travel }
      : { zoom: 1 + travel * e, dy: 0, peak: 1 + travel };
    case 'drift': return {
      zoom: DRIFT_ZOOM,
      dy: (0.5 - e) * Math.min(DRIFT_CAP, DRIFT_RATE * span),
      peak: DRIFT_ZOOM,
    };
    default: return { zoom: 1, dy: 0, peak: 1 };
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
    backdrop(ctx, slide);

    // Normalised against the motion's peak: a boxed slide ends at full width
    // rather than being scaled past it and losing its own margins.
    const k = zoom / (m.peak || 1);
    const w = V.W * k, h = fullH * k;
    const safeH = V.H - SAFE.top - SAFE.bottom;
    const y = Math.max(0, Math.min(V.H - h, SAFE.top + (safeH - h) / 2)) + dy;
    ctx.drawImage(el, (V.W - w) / 2, y, w, h);
  }
  ctx.restore();
}

/* The bands above and below a short slide are a wash, not a picture, so they
   are blurred small and blown back up: a 48px blur over the full frame costs
   tens of milliseconds and had been recomputed for every single frame. A still
   never changes, so its wash is kept; a clip's is redrawn, but cheaply. */
const BLUR_W = 136;
const BLUR_H = Math.round((BLUR_W * V.H) / V.W);
const washes = new WeakMap();
let scratch = null;

function backdrop(ctx, slide) {
  const live = slide.kind === 'video';
  let wash = live ? null : washes.get(slide.el);

  if (!wash) {
    if (!scratch) {
      scratch = document.createElement('canvas');
      scratch.width = BLUR_W; scratch.height = BLUR_H;
    }
    const s = scratch.getContext('2d');
    s.clearRect(0, 0, BLUR_W, BLUR_H);
    s.filter = 'blur(6px) brightness(0.42)';       // 48px at full size, scaled down
    cover(s, slide.el, -8, -8, BLUR_W + 16, BLUR_H + 16, 1.06);
    s.filter = 'none';
    if (live) { ctx.drawImage(scratch, 0, 0, V.W, V.H); return; }
    // Keep the still's wash: it cannot change, and it is the same every frame.
    wash = document.createElement('canvas');
    wash.width = BLUR_W; wash.height = BLUR_H;
    wash.getContext('2d').drawImage(scratch, 0, 0);
    washes.set(slide.el, wash);
  }
  ctx.drawImage(wash, 0, 0, V.W, V.H);
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

/* ---- frame rate -------------------------------------------------------- */
/* Resampling footage onto a different grid repeats frames on a fixed cycle —
   24 into 30 duplicates one frame in five, and the eye reads that cycle as
   judder however faithfully every frame was written. So the cut takes its rate
   from the footage instead: the longest clip sets it, and a still-only reel
   keeps the default. */
export function fpsFor(slides, fallback = V.fps) {
  const clips = slides.filter((s) => s.kind === 'video' && s.fps > 0);
  if (!clips.length) return fallback;
  const lead = clips.reduce((a, b) => ((b.el.duration || 0) > (a.el.duration || 0) ? b : a));
  return Math.max(12, Math.min(60, Math.round(lead.fps) || fallback));
}

/* Plays a moment of a clip and reads the spacing its own frames arrive at.
   There is no property that reports this; rVFC's mediaTime is the only honest
   source, and the median of a couple of dozen gaps is stable. */
export function measureFps(el, samples = 20) {
  return new Promise((resolve) => {
    if (typeof el.requestVideoFrameCallback !== 'function') { resolve(0); return; }
    const times = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { el.pause(); el.currentTime = 0; } catch (_) {}
      const gaps = [];
      for (let i = 1; i < times.length; i++) {
        const d = times[i] - times[i - 1];
        if (d > 0.0005) gaps.push(d);
      }
      if (gaps.length < 4) { resolve(0); return; }
      gaps.sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      resolve(median > 0 ? 1 / median : 0);
    };
    const onFrame = (now, meta) => {
      times.push(meta.mediaTime);
      if (times.length >= samples) { finish(); return; }
      el.requestVideoFrameCallback(onFrame);
    };
    el.muted = true;
    el.requestVideoFrameCallback(onFrame);
    Promise.resolve(el.play()).catch(finish);
    setTimeout(finish, 3000);
  });
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

/* Which slides are on screen at time `t`, and how far into each — the same
   predicate drawFrame paints by, exported so the offline exporter can put every
   clip on its exact frame before drawing. */
export function framesOnScreen(slides, opts, t) {
  const plan = planTimeline(slides, opts);
  if (!slides.length) return [];
  const fade = opts.transition === 'cut' ? 0 : (opts.fade ?? 0.6);
  const st = Math.max(0, Math.min(t - plan.intro, plan.body));
  const { i, local } = slideAt(plan, st);
  const out = [{ i, local }];
  if (slides[i + 1] && fade > 0 && local > plan.spans[i] - fade) out.push({ i: i + 1, local: 0 });
  return out;
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
  // A slide's motion clock starts the moment it appears — which is when its
  // fade-in begins, not when the fade ends. Holding it at zero through the
  // crossfade froze every entrance for the length of the fade.
  const m = (i, since) => motionAt(motion, i, since / (plan.spans[i] + fade),
    plan.spans[i], slides[i] && slides[i].kind === 'video');

  // The outro's own clock starts while the last slide is still fading out, so
  // the animation does not restart when the crossfade finishes.
  const outroAt = intro + body - fade;
  const outroP = outro ? clamp01((t - outroAt) / (outro + fade)) : 0;

  if (t < intro) {
    drawIntro(ctx, clamp01(t / intro), brand);
    const rem = intro - t;
    if (rem < fade) {
      drawSlide(ctx, slides[0], m(0, fade - rem), 1 - rem / fade);
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
      drawSlide(ctx, slides[i], m(i, local + fade), 1);
      ctx.save();
      ctx.globalAlpha = u * 2;
      ctx.fillStyle = INK; ctx.fillRect(0, 0, V.W, V.H);
      ctx.restore();
      if (subs) drawSubtitle(ctx, cueAt(slides[i], local, per), 1 - u * 2);
    } else {
      drawSlide(ctx, next, m(i + 1, (u - 0.5) * 2 * fade), (u - 0.5) * 2);
      if (subs) drawSubtitle(ctx, cueAt(next, 0, plan.spans[i + 1]), (u - 0.5) * 2);
    }
  } else if (turning && transition === 'push') {
    const e = ease(u);
    ctx.save(); ctx.translate(0, -V.H * e);
    drawSlide(ctx, slides[i], m(i, local + fade), 1);
    if (subs) drawSubtitle(ctx, cueAt(slides[i], local, per), 1);
    ctx.restore();
    ctx.save(); ctx.translate(0, V.H * (1 - e));
    drawSlide(ctx, next, m(i + 1, e * fade), 1);
    if (subs) drawSubtitle(ctx, cueAt(next, 0, plan.spans[i + 1]), 1);
    ctx.restore();
  } else {
    drawSlide(ctx, slides[i], m(i, local + fade), 1);
    if (turning) drawSlide(ctx, next, m(i + 1, u * fade), u);
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
    // With no fade the outro simply starts; dividing by zero would make the
    // alpha NaN and let one frame of the last slide through.
    const a = fade > 0 ? clamp01((t - outroAt) / fade) : (t >= outroAt ? 1 : 0);
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
      onProgress?.(t / runFor, { done: t, total: runFor, kind: 'seconds' });
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
  onProgress?.(1, { done: runFor, total: runFor, kind: 'seconds' });
  return { blob: await done, mime, ext: extFor(mime), cancelled: false, audio: !!audio };
}

/* NY Daily Watch — slideshow encoder for Reels/TikTok.
   Composites stills onto a 1080x1920 canvas and records it through
   MediaRecorder. Recording is wall-clock bound: a 30s video takes 30s to
   make. That is the price of the only encoder every browser ships. */

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
const PORTRAIT = V.W / V.H;

/* A 9:16 still is already framed for the format, so it fills the frame. Any
   other shape — a 4:5 card above all — sits inside the safe box over a blurred
   copy of itself, which beats black bars and keeps its text clear of the UI. */
function drawSlide(ctx, img, zoom, alpha) {
  const aspect = img.width / img.height;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (Math.abs(aspect - PORTRAIT) < 0.02) {
    cover(ctx, img, 0, 0, V.W, V.H, zoom);
  } else {
    ctx.save();
    ctx.filter = 'blur(48px) brightness(0.42)';
    cover(ctx, img, -60, -60, V.W + 120, V.H + 120, 1.06);
    ctx.restore();

    const boxW = V.W - 2 * 60;
    const boxH = V.H - SAFE.top - SAFE.bottom;
    const scale = Math.min(boxW / img.width, boxH / img.height) * zoom;
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (V.W - w) / 2, SAFE.top + (boxH - h) / 2, w, h);
  }
  ctx.restore();
}

function cover(ctx, img, x, y, w, h, zoom = 1) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale, dh = img.height * scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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

/* Paints the frame at time `t` seconds. Exported so the page can scrub a
   preview through the same code the recorder runs. */
export function drawFrame(ctx, slides, t, opts) {
  const { total, fade = 0.6, zoom = true, intro = 0, outro = 0, brand } = opts;
  const body = Math.max(0.2, total - intro - outro);

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, V.W, V.H);

  if (!slides.length) {
    if (intro) drawIntro(ctx, clamp01(t / intro), brand);
    return;
  }

  const per = body / slides.length;
  const grow = (k) => (zoom ? 1 + 0.055 * ease(Math.min(1, k / per)) : 1);

  // The outro's own clock starts while the last slide is still fading out, so
  // the animation does not restart when the crossfade finishes.
  const outroAt = intro + body - fade;
  const outroP = outro ? clamp01((t - outroAt) / (outro + fade)) : 0;

  if (t < intro) {
    drawIntro(ctx, clamp01(t / intro), brand);
    const rem = intro - t;
    if (rem < fade) drawSlide(ctx, slides[0], grow(0), 1 - rem / fade);
    return;
  }

  const st = Math.min(t - intro, body);
  const i = Math.min(slides.length - 1, Math.floor(st / per));
  const local = st - i * per;
  drawSlide(ctx, slides[i], grow(local), 1);

  const next = slides[i + 1];
  if (next && fade > 0 && local > per - fade) {
    drawSlide(ctx, next, grow(0), (local - (per - fade)) / fade);
  }
  if (outro) {
    const a = clamp01((t - outroAt) / fade);
    if (a > 0) drawOutro(ctx, outroP, brand, a);
  }
}

export async function recordVideo(canvas, slides, opts, onProgress, shouldStop) {
  const mime = pickMime();
  if (!mime) throw new Error('no-recorder');
  const ctx = canvas.getContext('2d');
  canvas.width = V.W; canvas.height = V.H;

  const stream = canvas.captureStream(V.fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime })); });

  drawFrame(ctx, slides, 0, opts);
  rec.start(200);
  const started = performance.now();

  await new Promise((res) => {
    const tick = () => {
      const t = (performance.now() - started) / 1000;
      if (t >= opts.total || shouldStop?.()) { res(); return; }
      drawFrame(ctx, slides, t, opts);
      onProgress?.(t / opts.total);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Hold the last frame briefly so the final slide is not cut mid-fade.
  drawFrame(ctx, slides, Math.max(0, opts.total - 0.01), opts);
  await new Promise((r) => setTimeout(r, 260));
  rec.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  onProgress?.(1);
  return { blob: await done, mime, ext: extFor(mime) };
}

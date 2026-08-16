/* NY Daily Watch — Instagram card renderer (canvas port of cards.py).
   Layout tokens and auto-fit rules mirror the Python/Playwright version so
   output is interchangeable with cards already published. */

const T = {
  W: 1080, H: 1350,
  margin: 92,
  ink: '#121212',
  gold: '#EFC050',
  white: '#FFFFFF',
  cream: '#EADFC2',
  eyebrowInk: '#EFEAE0',
  photo_h: 600,
  photo_gap: 36,
  date_size: 34,
  bullet_ratio: 0.82,
  logo: 107,
  // card one
  tag_size: 21, tag_h: 50, tag_top: 38, tag_pad_r: 28,
  hed_size: 84, hed_lh: 1.30, hed_min: 52,
  sub_size: 46, sub_lh: 1.34, sub_min: 30, sub_gap: 34,
  // card two
  eyebrow_size: 28, eyebrow_track: '0.02em', wrap_top: 69,
  head_size: 78, head_lh: 1.12, head_min: 52, head_max_h: 190, head_top_gap: 22,
  bullet_lh: 1.33, bullet_min: 38, bullet_gap: 40, bullet_gap_min: 28,
  head_gap: 64, max_lines: 4, bullet_dot: 24, bullet_indent: 16,
  list_bottom: 1350 - 215,
};
T.bullet_size = Math.round(T.head_size * T.bullet_ratio);

const font = (weight, size, family) => `${weight} ${size}px "${family}"`;

/* CSS line boxes are built from the font's ascent/descent plus half-leading,
   so read those rather than guessing at 0.8em. */
function vmetrics(ctx) {
  const m = ctx.measureText('Hxg');
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  return { ascent, descent };
}

function firstBaseline(ctx, size, lh) {
  const { ascent, descent } = vmetrics(ctx);
  return (size * lh - (ascent + descent)) / 2 + ascent;
}

function wrap(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        // A single word wider than the column still has to break somewhere.
        if (!line && ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
              out.push(chunk); chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else line = next;
      } else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

function drawLines(ctx, lines, x, top, size, lh) {
  const base = firstBaseline(ctx, size, lh);
  lines.forEach((l, i) => ctx.fillText(l, x, top + base + i * size * lh));
  return lines.length * size * lh;
}

/* Largest size below `start` that costs fewer lines, searched no further than
   `window` px so the text never shrinks dramatically for a cosmetic gain. */
function tighten(start, min, window, linesOf, fits) {
  const base = linesOf(start);
  for (let s = start - 1; s >= Math.max(min, start - window); s--) {
    if (fits(s) && linesOf(s) < base) return s;
  }
  return start;
}

function coverDraw(ctx, img, x, y, w, h, focus = 0.5) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * focus, dw, dh);
  ctx.restore();
}

function drawFooter(ctx, d, logo) {
  const date = d.date || d.footer;
  if (date) {
    ctx.fillStyle = T.cream;
    ctx.font = font(400, T.date_size, 'Playfair Display');
    const top = T.H - 66 - T.date_size;
    ctx.fillText(String(date), T.margin, top + firstBaseline(ctx, T.date_size, 1));
  }
  if (logo) {
    const s = T.logo, x = T.W - 34 - s, y = T.H - 44 - s;
    ctx.save();
    ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); ctx.clip();
    // object-fit: contain
    const scale = Math.min(s / logo.width, s / logo.height);
    const dw = logo.width * scale, dh = logo.height * scale;
    ctx.drawImage(logo, x + (s - dw) / 2, y + (s - dh) / 2, dw, dh);
    ctx.restore();
  }
}

/* ---- card one : photo ---------------------------------------------- */
export function renderPhotoCard(canvas, d, { photo, logo, focus = 0.5 } = {}) {
  const ctx = canvas.getContext('2d');
  canvas.width = T.W; canvas.height = T.H;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = T.ink; ctx.fillRect(0, 0, T.W, T.H);

  if (photo) coverDraw(ctx, photo, 0, 0, T.W, T.photo_h, focus);
  else { ctx.fillStyle = '#D7D7D7'; ctx.fillRect(0, 0, T.W, T.photo_h); }

  const category = (d.category || '').trim();
  if (category) {
    ctx.font = font(700, T.tag_size, 'Montserrat');
    ctx.letterSpacing = '0.02em';
    const w = T.margin + ctx.measureText(category).width + T.tag_pad_r;
    ctx.fillStyle = T.gold;
    ctx.fillRect(0, T.tag_top, w, T.tag_h);
    const { ascent, descent } = vmetrics(ctx);
    ctx.fillStyle = '#fff';
    ctx.fillText(category, T.margin, T.tag_top + (T.tag_h + ascent - descent) / 2);
    ctx.letterSpacing = '0px';
  }

  const colW = T.W - 2 * T.margin;
  const bodyTop = T.photo_h + T.photo_gap;
  const box = T.H - T.photo_h - T.photo_gap - 160;

  const measure = (hs, ss) => {
    ctx.font = font(700, hs, 'Playfair Display');
    const hed = wrap(ctx, d.headline, colW);
    ctx.font = font(400, ss, 'Montserrat');
    const sub = d.subtitle ? wrap(ctx, d.subtitle, colW) : [];
    const h = hed.length * hs * T.hed_lh +
      (sub.length ? T.sub_gap + sub.length * ss * T.sub_lh : 0);
    return { hed, sub, h };
  };

  let hs = T.hed_size, ss = T.sub_size;
  while (hs > T.hed_min && measure(hs, ss).h > box) hs -= 1;
  while (ss > T.sub_min && measure(hs, ss).h > box) ss -= 1;
  // The largest size that fits often leaves one orphan word on a last line;
  // a couple of px less usually buys back a whole line.
  hs = tighten(hs, T.hed_min, 10, (s) => measure(s, ss).hed.length, (s) => measure(s, ss).h <= box);
  ss = tighten(ss, T.sub_min, 6, (s) => measure(hs, s).sub.length, (s) => measure(hs, s).h <= box);
  const { hed, sub, h } = measure(hs, ss);

  ctx.fillStyle = T.gold;
  ctx.font = font(700, hs, 'Playfair Display');
  const hedH = drawLines(ctx, hed, T.margin, bodyTop, hs, T.hed_lh);
  if (sub.length) {
    ctx.fillStyle = T.white;
    ctx.font = font(400, ss, 'Montserrat');
    drawLines(ctx, sub, T.margin, bodyTop + hedH + T.sub_gap, ss, T.sub_lh);
  }

  drawFooter(ctx, d, logo);
  return { headline: hs, subtitle: ss, overflow: h > box, used: Math.round(h), box };
}

/* ---- card two : dark ----------------------------------------------- */
export function renderDarkCard(canvas, d, { logo } = {}) {
  const ctx = canvas.getContext('2d');
  canvas.width = T.W; canvas.height = T.H;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = T.ink; ctx.fillRect(0, 0, T.W, T.H);

  const colW = T.W - 2 * T.margin;
  let y = T.wrap_top;

  const eyebrow = (d.eyebrow || '').trim();
  if (eyebrow) {
    ctx.fillStyle = T.eyebrowInk;
    ctx.font = font(400, T.eyebrow_size, 'Montserrat');
    ctx.letterSpacing = T.eyebrow_track;
    ctx.fillText(eyebrow, T.margin, y + firstBaseline(ctx, T.eyebrow_size, 1));
    ctx.letterSpacing = '0px';
  }
  y += (eyebrow ? T.eyebrow_size : 0) + T.head_top_gap;

  const headText = d.heading || 'Three things to know';
  let hs = T.head_size, headLines;
  const headH = (size) => {
    ctx.font = font(700, size, 'Playfair Display');
    headLines = wrap(ctx, headText, colW);
    return headLines.length * size * T.head_lh;
  };
  while (hs > T.head_min && headH(hs) > T.head_max_h) hs -= 1;
  const hH = headH(hs);
  ctx.fillStyle = T.gold;
  drawLines(ctx, headLines, T.margin, y, hs, T.head_lh);

  const listTop = y + hH + T.head_gap;
  const avail = T.list_bottom - listTop;
  const textX = T.margin + T.bullet_dot + T.bullet_indent;
  const textW = colW - T.bullet_dot - T.bullet_indent;
  const bullets = (d.bullets || []).filter((b) => String(b).trim());

  const layout = (bs) => {
    ctx.font = font(300, bs, 'Montserrat');
    const items = bullets.map((b) => wrap(ctx, b, textW));
    const heights = items.map((l) => l.length * bs * T.bullet_lh);
    const content = heights.reduce((a, b) => a + b, 0);
    const longest = items.reduce((a, l) => Math.max(a, l.length), 0);
    const withGaps = content + Math.max(0, items.length - 1) * T.bullet_gap;
    return { items, heights, content, longest, bad: withGaps > avail || longest > T.max_lines };
  };

  let bs = T.bullet_size;
  while (bs > T.bullet_min && layout(bs).bad) bs -= 1;
  const L = layout(bs);

  const gap = L.items.length > 1
    ? Math.min(T.bullet_gap, Math.max(T.bullet_gap_min, (avail - L.content) / (L.items.length - 1)))
    : 0;

  ctx.font = font(300, bs, 'Montserrat');
  let ty = listTop;
  L.items.forEach((lines, i) => {
    ctx.fillStyle = T.gold;
    ctx.beginPath();
    ctx.arc(T.margin + T.bullet_dot / 2, ty + (bs * T.bullet_lh) / 2, T.bullet_dot / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.white;
    ctx.font = font(300, bs, 'Montserrat');
    drawLines(ctx, lines, textX, ty, bs, T.bullet_lh);
    ty += L.heights[i] + (i < L.items.length - 1 ? gap : 0);
  });

  drawFooter(ctx, d, logo);
  return { heading: hs, bullets: bs, overflow: L.bad, longest: L.longest, gap: Math.round(gap) };
}

export const TOKENS = T;

export const FONT_SPECS = [
  '400 34px "Playfair Display"', '700 84px "Playfair Display"',
  '300 64px "Montserrat"', '400 46px "Montserrat"',
  '600 21px "Montserrat"', '700 21px "Montserrat"',
];

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

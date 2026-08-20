/* NY Daily Watch — chart renderer.

   Static PNGs for a feed, so there is no hover layer to fall back on: every
   value a reader needs has to be on the image, through the axis or a direct
   label. That is the one place this departs from the usual chart rules, and it
   is why value labels default to on.

   Mark specs are written for a ~360px screen chart; this canvas is 1080 wide,
   so they are scaled by MARK below rather than reinterpreted. */

import { SAFE } from './render.js';

export const RATIOS = {
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
};

export const CHART_TYPES = ['bar', 'hbar', 'line', 'area', 'scatter', 'donut', 'stat'];

/* Validated on the brand ink surface (#121212, dark band) with the skill's
   validator: worst adjacent CVD ΔE 14.8, worst adjacent normal-vision ΔE 19.7,
   all six inside the lightness band and over 3:1 contrast. The first three also
   clear the all-pairs gate, which is what scatter needs. Slot order is the
   safety mechanism — reorder only by re-running the validator. */
export const BRAND_PALETTE = ['#B58C22', '#4C8FD8', '#D55181', '#9085E9', '#D8503C', '#2F9BB5'];

/* Scatter and other all-pairs forms cap here; past it, fold the tail. */
export const ALL_PAIRS_CAP = 3;

const INK = {
  surface: '#121212',
  title: '#EFC050',        // brand headline gold — a text token, never a mark
  primary: '#FFFFFF',
  secondary: '#EADFC2',
  muted: '#918D84',
  grid: '#2C2C2A',
  axis: '#3C3B38',
  quiet: '#55534E',        // the de-emphasis gray
};

const MARK = 3;            // 1080 / 360: the spec's px, scaled to this canvas

const font = (w, s, f) => `${w} ${s}px "${f}"`;
const isNum = (v) => typeof v === 'number' && isFinite(v);

/* ---- number formatting ---------------------------------------------- */
export function fmt(v, unit = '') {
  if (!isNum(v)) return '';
  const a = Math.abs(v);
  let s;
  if (a >= 1e9) s = (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  else if (a >= 1e6) s = (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  else if (a >= 1e4) s = (v / 1e3).toFixed(0) + 'k';
  else if (a >= 1000) s = v.toLocaleString('en-US');
  else if (Number.isInteger(v)) s = String(v);
  else s = String(Math.round(v * 100) / 100);
  return unit === '%' || unit === '¢' ? s + unit : unit ? unit + s : s;
}

/* Axis ticks on 1/2/2.5/5 x 10^n steps, so labels read as round numbers. */
function ticks(min, max, count = 5) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
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

/* ---- shapes ---------------------------------------------------------- */
/* A bar is square where it meets the baseline and rounded at the data end —
   the rounding marks which end carries the value. */
function barPath(ctx, x, y, w, h, r, dir) {
  const rr = Math.max(0, Math.min(r, Math.abs(dir === 'up' || dir === 'down' ? w : h) / 2,
    Math.abs(dir === 'up' || dir === 'down' ? h : w)));
  ctx.beginPath();
  if (dir === 'up') {
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h);
  } else {                       // 'right'
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x, y + h);
  }
  ctx.closePath();
}

function dot(ctx, x, y, r, fill) {
  // 2px surface ring, so overlapping points stay countable without an outline.
  ctx.beginPath(); ctx.arc(x, y, r + 2 * MARK, 0, Math.PI * 2);
  ctx.fillStyle = INK.surface; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
}

/* ---- normalise the story ---------------------------------------------- */
export function normalizeChart(raw) {
  const d = { ...raw };
  d.type = CHART_TYPES.includes(d.type) ? d.type : 'bar';
  d.categories = Array.isArray(d.categories) ? d.categories.map(String) : [];

  let series = d.series;
  if (!Array.isArray(series)) {
    // A bare {values:[…]} or {data:[…]} is the common shorthand.
    const v = d.values || d.data;
    series = Array.isArray(v) ? [{ name: d.seriesName || d.title || '', values: v }] : [];
  }
  d.series = series.map((s, i) => ({
    name: String(s?.name ?? `Series ${i + 1}`),
    values: (Array.isArray(s?.values) ? s.values : []).map((v) => (isNum(+v) ? +v : null)),
  })).filter((s) => s.values.length);

  d.points = Array.isArray(d.points)
    ? d.points.map((p) => ({ x: +p.x, y: +p.y, name: p.name == null ? '' : String(p.name) }))
      .filter((p) => isNum(p.x) && isNum(p.y))
    : [];

  d.unit = d.unit == null ? '' : String(d.unit);
  d.emphasis = isNum(+d.emphasis) ? +d.emphasis : null;
  d.valueLabels = d.valueLabels !== false;
  return d;
}

/* ---- the frame -------------------------------------------------------- */
function frame(ctx, d, W, H, ratio, logo) {
  const wide = W > H;
  const m = wide ? 104 : 92;
  const top = ratio === '9:16' ? SAFE.top : (wide ? 74 : 92);
  const floor = ratio === '9:16' ? H - SAFE.bottom : H - (wide ? 74 : 96);

  ctx.fillStyle = INK.surface; ctx.fillRect(0, 0, W, H);

  const colW = W - 2 * m;
  let y = top;

  const titleSize = wide ? 62 : 66;
  ctx.font = font(700, titleSize, 'Playfair Display');
  const title = wrapText(ctx, d.title || '', colW);
  ctx.fillStyle = INK.title;
  for (const line of title) { y += titleSize; ctx.fillText(line, m, y); y += titleSize * 0.22; }

  if (d.subtitle) {
    const ss = wide ? 30 : 32;
    ctx.font = font(400, ss, 'Montserrat');
    const sub = wrapText(ctx, d.subtitle, colW);
    ctx.fillStyle = INK.primary;
    y += 14;
    for (const line of sub) { y += ss; ctx.fillText(line, m, y); y += ss * 0.34; }
  }

  // Source line and logo sit on the floor of the frame (or the safe box).
  let bottom = floor;
  if (d.source) {
    ctx.font = font(400, 26, 'Montserrat');
    ctx.fillStyle = INK.muted;
    ctx.fillText(String(d.source), m, bottom);
    bottom -= 42;
  }
  if (logo) {
    const s = wide ? 76 : 88;
    const x = W - m - s, ly = floor - s + (d.source ? 0 : 8);
    ctx.save();
    ctx.beginPath(); ctx.arc(x + s / 2, ly + s / 2, s / 2, 0, Math.PI * 2); ctx.clip();
    const k = Math.min(s / logo.width, s / logo.height);
    ctx.drawImage(logo, x + (s - logo.width * k) / 2, ly + (s - logo.height * k) / 2,
      logo.width * k, logo.height * k);
    ctx.restore();
    bottom = Math.min(bottom, floor - s - 20);
  }

  return { m, colW, plotTop: y + (wide ? 40 : 54), plotBottom: bottom - 30, W, H, wide };
}

/* ---- legend ----------------------------------------------------------- */
/* Always present for two or more series: identity must never be colour alone. */
function legend(ctx, names, colors, x, y, maxW) {
  const size = 28, gap = 34, box = 22;
  ctx.font = font(600, size, 'Montserrat');
  let cx = x, cy = y, rows = 1;
  for (let i = 0; i < names.length; i++) {
    const w = box + 12 + ctx.measureText(names[i]).width;
    if (cx + w > x + maxW && cx > x) { cx = x; cy += size + 20; rows++; }
    ctx.fillStyle = colors[i];
    ctx.fillRect(cx, cy - box + 4, box, box);
    ctx.fillStyle = INK.secondary;         // text wears a text token, not the series colour
    ctx.fillText(names[i], cx + box + 12, cy);
    cx += w + gap;
  }
  return rows * (size + 20);
}

/* ---- the renderer ----------------------------------------------------- */
export function renderChart(canvas, raw, { palette, ratio = '4:5', logo } = {}) {
  const d = normalizeChart(raw);
  const [W, H] = RATIOS[ratio] || RATIOS['4:5'];
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  const pal = (Array.isArray(palette) && palette.length ? palette : BRAND_PALETTE);
  const warnings = [];
  const F = frame(ctx, d, W, H, ratio, logo);

  const colorOf = (i) => {
    // Emphasis: one series in colour, the rest quiet. The honest form when the
    // story is "this one", not "these eight".
    if (d.emphasis != null) return i === d.emphasis ? pal[0] : INK.quiet;
    // Past the last slot the tail goes quiet rather than reusing a hue: a
    // repeated colour would claim two series are the same one.
    return i < pal.length ? pal[i] : INK.quiet;
  };

  const n = d.series.length;
  if (n > pal.length) warnings.push({ code: 'tooManySeries', n, cap: pal.length });
  if (d.type === 'scatter' && n > ALL_PAIRS_CAP) warnings.push({ code: 'scatterCap', cap: ALL_PAIRS_CAP });
  if (d.type === 'donut' && (d.series[0]?.values.length || 0) > 6) warnings.push({ code: 'donutCap' });
  if (d.type === 'bar' && n === 1 && d.series[0].values.length === 1) warnings.push({ code: 'useStat' });

  let plotTop = F.plotTop;
  if (n > 1 && d.type !== 'stat' && d.type !== 'donut') {
    plotTop += legend(ctx, d.series.map((s) => s.name), d.series.map((_, i) => colorOf(i)),
      F.m, F.plotTop, F.colW) + 24;
  }
  const area = { x: F.m, y: plotTop, w: F.colW, h: Math.max(120, F.plotBottom - plotTop) };

  const draw = {
    bar: drawColumns, hbar: drawBars, line: drawLine, area: drawLine,
    scatter: drawScatter, donut: drawDonut, stat: drawStat,
  }[d.type];
  draw(ctx, d, area, colorOf, pal, warnings);

  return { warnings, W, H, series: n, palette: pal };
}

/* ---- axes ------------------------------------------------------------- */
function valueRange(d) {
  const all = d.series.flatMap((s) => s.values).filter(isNum);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  return ticks(min, max);
}

function yAxis(ctx, area, t, unit, labelW) {
  ctx.font = font(400, 26, 'Montserrat');
  ctx.textAlign = 'right';
  const lo = t[0], hi = t[t.length - 1];
  for (const v of t) {
    const y = area.y + area.h - ((v - lo) / (hi - lo)) * area.h;
    ctx.strokeStyle = v === 0 ? INK.axis : INK.grid;   // solid hairlines, never dashed
    ctx.lineWidth = MARK;
    ctx.beginPath(); ctx.moveTo(area.x + labelW, y); ctx.lineTo(area.x + area.w, y); ctx.stroke();
    ctx.fillStyle = INK.muted;
    ctx.fillText(fmt(v, unit), area.x + labelW - 16, y + 9);
  }
  ctx.textAlign = 'left';
  return { lo, hi, at: (v) => area.y + area.h - ((v - lo) / (hi - lo)) * area.h };
}

/* Axis labels sit horizontal — above the y axis and under the x band — so
   neither has to be read sideways. */
function axisLabels(ctx, d, area, labelW) {
  ctx.font = font(600, 25, 'Montserrat');
  ctx.fillStyle = INK.muted;
  if (d.yLabel) ctx.fillText(String(d.yLabel), area.x, area.y - 20);
  if (d.xLabel) {
    ctx.textAlign = 'center';
    ctx.fillText(String(d.xLabel), area.x + labelW + (area.w - labelW) / 2, area.y + area.h + 96);
    ctx.textAlign = 'left';
  }
}

function xLabels(ctx, cats, area, x0, bandW) {
  ctx.font = font(400, 26, 'Montserrat');
  ctx.fillStyle = INK.muted;
  ctx.textAlign = 'center';
  cats.forEach((c, i) => {
    const cx = x0 + bandW * (i + 0.5);
    const lines = wrapText(ctx, c, bandW - 8).slice(0, 2);
    lines.forEach((l, j) => ctx.fillText(l, cx, area.y + area.h + 44 + j * 30));
  });
  ctx.textAlign = 'left';
}

/* ---- columns (vertical bars) ------------------------------------------ */
function drawColumns(ctx, d, area, colorOf) {
  const t = valueRange(d);
  ctx.font = font(400, 26, 'Montserrat');
  const labelW = Math.max(...t.map((v) => ctx.measureText(fmt(v, d.unit)).width)) + 26;
  const plot = { ...area, h: area.h - 78 };
  const ax = yAxis(ctx, plot, t, d.unit, labelW);

  const cats = d.categories.length ? d.categories : d.series[0].values.map((_, i) => String(i + 1));
  const x0 = area.x + labelW;
  const bandW = (area.w - labelW) / cats.length;
  const n = d.series.length;
  const gap = 2 * MARK;
  // Cap the bar so the band always keeps air, however few categories there are.
  const barW = Math.min(72 * (n > 1 ? 1 : 1.6), (bandW * 0.62 - gap * (n - 1)) / n);
  const zero = ax.at(0);

  d.series.forEach((s, si) => {
    ctx.fillStyle = colorOf(si);
    s.values.forEach((v, i) => {
      if (!isNum(v)) return;
      const groupW = barW * n + gap * (n - 1);
      const x = x0 + bandW * (i + 0.5) - groupW / 2 + si * (barW + gap);
      const y = ax.at(v);
      const h = Math.abs(y - zero);
      barPath(ctx, x, Math.min(y, zero), barW, h, 4 * MARK, v >= 0 ? 'up' : 'down');
      ctx.fill();
    });
  });

  if (d.valueLabels && n * cats.length <= 12) {
    ctx.font = font(600, 27, 'Montserrat');
    ctx.textAlign = 'center';
    d.series.forEach((s, si) => s.values.forEach((v, i) => {
      if (!isNum(v)) return;
      const groupW = barW * n + gap * (n - 1);
      const x = x0 + bandW * (i + 0.5) - groupW / 2 + si * (barW + gap) + barW / 2;
      ctx.fillStyle = INK.secondary;
      ctx.fillText(fmt(v, d.unit), x, ax.at(v) - 18);
    }));
    ctx.textAlign = 'left';
  }
  xLabels(ctx, cats, plot, x0, bandW);
  axisLabels(ctx, d, plot, labelW);
}

/* ---- bars (horizontal) ------------------------------------------------ */
function drawBars(ctx, d, area, colorOf) {
  const cats = d.categories.length ? d.categories : d.series[0].values.map((_, i) => String(i + 1));
  ctx.font = font(400, 28, 'Montserrat');
  const labelW = Math.min(area.w * 0.34,
    Math.max(...cats.map((c) => ctx.measureText(c).width)) + 24);
  const all = d.series.flatMap((s) => s.values).filter(isNum);
  const max = Math.max(0, ...all) || 1;
  const x0 = area.x + labelW;
  const plotW = area.w - labelW - 130;      // room for the value at the bar end
  const bandH = area.h / cats.length;
  const n = d.series.length;
  const gap = 2 * MARK;
  const barH = Math.min(72, (bandH * 0.66 - gap * (n - 1)) / n);

  cats.forEach((c, i) => {
    ctx.font = font(400, 28, 'Montserrat');
    ctx.fillStyle = INK.secondary;
    ctx.textAlign = 'right';
    ctx.fillText(c, x0 - 24, area.y + bandH * (i + 0.5) + 10);
    ctx.textAlign = 'left';
  });

  d.series.forEach((s, si) => {
    ctx.fillStyle = colorOf(si);
    s.values.forEach((v, i) => {
      if (!isNum(v)) return;
      const groupH = barH * n + gap * (n - 1);
      const y = area.y + bandH * (i + 0.5) - groupH / 2 + si * (barH + gap);
      const w = Math.max(2, (v / max) * plotW);
      barPath(ctx, x0, y, w, barH, 4 * MARK, 'right');
      ctx.fill();
      if (d.valueLabels) {
        ctx.font = font(600, 27, 'Montserrat');
        ctx.fillStyle = INK.secondary;
        ctx.fillText(fmt(v, d.unit), x0 + w + 16, y + barH / 2 + 9);
        ctx.fillStyle = colorOf(si);
      }
    });
  });
}

/* ---- line / area ------------------------------------------------------ */
function drawLine(ctx, d, area, colorOf) {
  const t = valueRange(d);
  ctx.font = font(400, 26, 'Montserrat');
  const labelW = Math.max(...t.map((v) => ctx.measureText(fmt(v, d.unit)).width)) + 26;
  const plot = { ...area, h: area.h - 78 };
  const ax = yAxis(ctx, plot, t, d.unit, labelW);

  const cats = d.categories.length ? d.categories : d.series[0].values.map((_, i) => String(i + 1));
  const x0 = area.x + labelW;
  const span = area.w - labelW;
  const bandW = span / cats.length;
  const at = (i) => x0 + bandW * (i + 0.5);
  const single = d.series.length === 1;

  d.series.forEach((s, si) => {
    const col = colorOf(si);
    const pts = s.values.map((v, i) => (isNum(v) ? [at(i), ax.at(v)] : null)).filter(Boolean);
    if (!pts.length) return;

    if (d.type === 'area' && single) {
      const g = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h);
      g.addColorStop(0, col + 'AA'); g.addColorStop(1, col + '11');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], ax.at(0));
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(pts[pts.length - 1][0], ax.at(0));
      ctx.closePath(); ctx.fill();
    }

    ctx.strokeStyle = col;
    ctx.lineWidth = 2 * MARK;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();

    // Direct-label the endpoint only — a number on every point is noise.
    const last = pts[pts.length - 1];
    dot(ctx, last[0], last[1], 5 * MARK, col);
    if (d.valueLabels) {
      const v = [...s.values].reverse().find(isNum);
      ctx.font = font(600, 28, 'Montserrat');
      ctx.fillStyle = INK.secondary;
      ctx.textAlign = 'right';
      // Two series can end at almost the same height, so alternate the label
      // above and below the point rather than letting them stack.
      ctx.fillText(fmt(v, d.unit), last[0] - 22, last[1] + (si % 2 ? 42 : -24));
      ctx.textAlign = 'left';
    }
  });

  xLabels(ctx, cats, plot, x0, bandW);
  axisLabels(ctx, d, plot, labelW);
}

/* ---- scatter ---------------------------------------------------------- */
function drawScatter(ctx, d, area, colorOf, pal) {
  const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
  const tx = ticks(Math.min(...xs), Math.max(...xs), 4);
  const ty = ticks(Math.min(...ys), Math.max(...ys), 5);
  ctx.font = font(400, 26, 'Montserrat');
  const labelW = Math.max(...ty.map((v) => ctx.measureText(fmt(v, d.unit)).width)) + 26;
  const plot = { ...area, h: area.h - 78 };
  const ax = yAxis(ctx, plot, ty, d.unit, labelW);

  const x0 = area.x + labelW, span = area.w - labelW;
  const lo = tx[0], hi = tx[tx.length - 1];
  const px = (v) => x0 + ((v - lo) / (hi - lo)) * span;

  ctx.font = font(400, 26, 'Montserrat');
  ctx.fillStyle = INK.muted;
  ctx.textAlign = 'center';
  for (const v of tx) ctx.fillText(fmt(v, d.xUnit || ''), px(v), plot.y + plot.h + 44);
  ctx.textAlign = 'left';

  axisLabels(ctx, d, plot, labelW);

  d.points.forEach((p) => dot(ctx, px(p.x), ax.at(p.y), 5 * MARK, pal[0]));

  // Name only the extremes; labelling every dot is unreadable.
  const named = d.points.filter((p) => p.name);
  const pick = named.length <= 3 ? named
    : [named.reduce((a, b) => (b.y > a.y ? b : a)), named.reduce((a, b) => (b.y < a.y ? b : a))];
  ctx.font = font(600, 26, 'Montserrat');
  ctx.fillStyle = INK.secondary;
  for (const p of pick) ctx.fillText(p.name, px(p.x) + 22, ax.at(p.y) - 16);
}

/* ---- donut ------------------------------------------------------------ */
function drawDonut(ctx, d, area, colorOf, pal) {
  const vals = (d.series[0]?.values || []).filter(isNum);
  const cats = d.categories.length ? d.categories : vals.map((_, i) => `Slice ${i + 1}`);
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const r = Math.min(area.w, area.h) * 0.32;
  const cx = area.x + area.w / 2, cy = area.y + r + 20;
  const thickness = r * 0.42;

  let a0 = -Math.PI / 2;
  vals.forEach((v, i) => {
    const a1 = a0 + (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.arc(cx, cy, r - thickness, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = pal[i % pal.length];
    ctx.fill();
    // 2px surface gap instead of a stroke around each slice
    ctx.strokeStyle = INK.surface; ctx.lineWidth = 2 * MARK; ctx.stroke();
    a0 = a1;
  });

  ctx.textAlign = 'center';
  ctx.font = font(700, 64, 'Montserrat');
  ctx.fillStyle = INK.primary;
  ctx.fillText(fmt(Math.round((vals[0] / total) * 100)) + '%', cx, cy + 12);
  ctx.font = font(400, 26, 'Montserrat');
  ctx.fillStyle = INK.muted;
  ctx.fillText(cats[0] || '', cx, cy + 52);
  ctx.textAlign = 'left';

  legend(ctx, cats.map((c, i) => `${c} · ${fmt(vals[i], d.unit)}`),
    cats.map((_, i) => pal[i % pal.length]), area.x, cy + r + 76, area.w);
}

/* ---- stat tile -------------------------------------------------------- */
/* The right form when the data is one number — a one-bar bar chart is not. */
function drawStat(ctx, d, area) {
  const value = String(d.value ?? (d.series[0]?.values?.[0] ?? ''));
  const cx = area.x;
  let y = area.y + area.h * 0.34;

  ctx.font = font(700, 190, 'Montserrat');   // proportional figures, never tabular
  ctx.fillStyle = INK.title;
  ctx.fillText(value, cx, y);

  if (d.delta) {
    y += 66;
    ctx.font = font(600, 40, 'Montserrat');
    ctx.fillStyle = INK.secondary;
    ctx.fillText(String(d.delta), cx, y);
  }
  if (d.label) {
    y += 74;
    ctx.font = font(400, 38, 'Montserrat');
    ctx.fillStyle = INK.primary;
    for (const line of wrapText(ctx, d.label, area.w)) { ctx.fillText(line, cx, y); y += 50; }
  }
}

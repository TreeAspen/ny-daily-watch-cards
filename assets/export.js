/* NY Daily Watch — offline export.

   The recorder in video.js captures a canvas in real time: a 30s cut costs 30s,
   and a tab pushed to the background loses frames, because a throttled
   requestAnimationFrame simply stops handing them over. That is tolerable for a
   short slideshow and wrong for a minute of footage.

   This path never watches a clock. Every output frame is composed deliberately,
   handed to a WebCodecs encoder, and muxed; the audio for the whole timeline is
   rendered in one offline pass and encoded alongside. It is usually faster than
   real time, and — because it waits on media events and microtasks rather than
   on rAF or timers — it keeps running at full speed in a background tab. */

import { Muxer, ArrayBufferTarget } from './mp4-muxer.mjs';
import { asSlide, planTimeline, framesOnScreen, drawFrame, fpsFor, V } from './video.js';
import { readVideoTrack, decodeTrack } from './demux.js';

const VIDEO_CODEC = 'avc1.4d0028';     // H.264 Main, level 4.0 — 1080x1920 at 30fps
const AUDIO_CODEC = 'mp4a.40.2';       // AAC-LC
const SAMPLE_RATE = 48000;
const AUDIO_FADE = 0.12;               // seconds, so a clip does not click in or out
const FRAME_PICK = 0.3;                // where inside a source frame to sample

export function canExportOffline() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' &&
    typeof OfflineAudioContext !== 'undefined';
}

export async function offlineSupported() {
  if (!canExportOffline()) return false;
  try {
    const v = await VideoEncoder.isConfigSupported({
      codec: VIDEO_CODEC, width: V.W, height: V.H, bitrate: 10e6, framerate: V.fps,
    });
    return !!v.supported;
  } catch (_) { return false; }
}

async function audioSupported() {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    const a = await AudioEncoder.isConfigSupported({
      codec: AUDIO_CODEC, numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 128000,
    });
    return !!a.supported;
  } catch (_) { return false; }
}

/* The source bytes of a clip: the File it came from, or the object URL it is
   playing, which is fetchable. */
async function bytesOf(slide) {
  if (slide.file) return slide.file.arrayBuffer();
  const src = slide.el && slide.el.currentSrc || slide.el && slide.el.src;
  if (!src) return null;
  const res = await fetch(src);
  return res.arrayBuffer();
}

/* One audio buffer for the whole cut: each clip laid down at its own place on
   the timeline, repeated if its slot outruns it, cut if the slot ends first —
   the same arithmetic the picture follows. */
async function renderAudio(slides, plan) {
  const clips = slides.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'video');
  if (!clips.length) return null;

  const length = Math.max(1, Math.ceil(plan.total * SAMPLE_RATE));
  const oac = new OfflineAudioContext(2, length, SAMPLE_RATE);
  let placed = 0;

  for (const { s, i } of clips) {
    let buf;
    try {
      const bytes = await bytesOf(s);
      if (!bytes) continue;
      buf = await oac.decodeAudioData(bytes);
    } catch (_) { continue; }          // a clip with no sound is not an error
    if (!buf || !buf.duration) continue;

    const start = plan.intro + plan.starts[i];
    const span = plan.spans[i];
    for (let at = 0; at < span - 0.01; at += buf.duration) {
      const take = Math.min(buf.duration, span - at);
      const src = oac.createBufferSource();
      src.buffer = buf;
      const gain = oac.createGain();
      const t0 = start + at, t1 = t0 + take;
      const fade = Math.min(AUDIO_FADE, take / 3);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + fade);
      gain.gain.setValueAtTime(1, Math.max(t0 + fade, t1 - fade));
      gain.gain.linearRampToValueAtTime(0, t1);
      src.connect(gain); gain.connect(oac.destination);
      src.start(t0, 0, take);
      placed++;
    }
  }
  if (!placed) return null;
  return oac.startRendering();
}

/* Seeking is event-driven, so it is not throttled when the tab is hidden. */
function seekTo(el, time) {
  const want = Math.max(0, Math.min(time, (el.duration || 0) - 0.02));
  // Tight: half a frame at 30fps would skip real seeks on 60fps footage.
  if (Math.abs(el.currentTime - want) < 0.002) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; el.removeEventListener('seeked', finish); resolve(); } };
    el.addEventListener('seeked', finish, { once: true });
    try { el.currentTime = want; } catch (_) { finish(); }
    setTimeout(finish, 600);           // a stubborn seek must not stall the export
  });
}

/* Wait for the encoder to drain without a timer, so a hidden tab keeps pace. */
function drain(encoder, limit) {
  if (encoder.encodeQueueSize <= limit) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (encoder.encodeQueueSize <= limit) { encoder.removeEventListener('dequeue', check); resolve(); }
    };
    encoder.addEventListener('dequeue', check);
    check();
  });
}

/* A slide can pass its own frames straight through when it is a clip that plays
   once at its own length: nothing is being asked of it that would require
   inventing frames at other moments. That is the case the long-footage cut is
   made of, and it is the only way to be exactly faithful to variable-rate
   footage, which has no fixed grid to resample onto in the first place. */
function passthroughIndex(slides, plan) {
  const out = new Map();
  slides.forEach((slide, i) => {
    if (slide.kind !== 'video' || !slide.file) return;
    const dur = slide.el.duration || 0;
    if (!dur) return;
    // Looping or trimming means frames are wanted at times the clip has none.
    if (Math.abs(plan.spans[i] - dur) > 0.05) return;
    out.set(i, { start: plan.intro + plan.starts[i], span: plan.spans[i] });
  });
  return out;
}

/* Draw a decoded frame the way drawFrame would: full width, wash behind if it
   is not tall enough to fill, and the subtitle over it. Skipped entirely when
   the frame already fills the frame and carries no words — then its pixels go
   to the encoder untouched. */
function needsCompositing(slide, track) {
  if (String(slide.sub || '').trim()) return true;
  const aspect = track.width / track.height;
  return Math.abs(aspect - V.W / V.H) > 0.02;
}

export async function exportVideo(canvas, rawSlides, opts, onProgress, shouldStop) {
  const slides = rawSlides.map(asSlide);
  const plan = planTimeline(slides, opts);
  // The footage sets the rate where there is footage, so its frames map one to
  // one instead of being resampled onto a grid that does not divide evenly.
  const fps = opts.fps || fpsFor(slides);
  const totalFrames = Math.max(1, Math.round(plan.total * fps));

  const wantAudio = opts.audio !== false && await audioSupported();
  const audioBuffer = wantAudio ? await renderAudio(slides, plan) : null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: 'in-memory',
    // No frameRate here on purpose: the muxer uses it as the track's timescale,
    // so declaring 30 would quantise every timestamp to 1/30s and collapse the
    // timing of variable-rate footage. Its fallback, 57600, divides evenly by
    // every common frame rate and leaves 17us of resolution.
    video: { codec: 'avc', width: V.W, height: V.H },
    ...(audioBuffer
      ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SAMPLE_RATE } }
      : {}),
  });

  let failed = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failed = e; },
  });
  venc.configure({
    codec: VIDEO_CODEC, width: V.W, height: V.H,
    bitrate: 10e6, framerate: fps,
    avc: { format: 'avc' },
  });

  const ctx = canvas.getContext('2d');
  canvas.width = V.W; canvas.height = V.H;

  // Which clips will be written from their own frames rather than sampled.
  const straight = passthroughIndex(slides, plan);
  const tracks = new Map();
  for (const [i] of straight) {
    try {
      const track = await readVideoTrack(slides[i].file);
      if (track && track.samples.length) tracks.set(i, track);
    } catch (_) { /* this one gets sampled like any other */ }
  }
  for (const i of [...straight.keys()]) if (!tracks.has(i)) straight.delete(i);

  /* The timeline in order: stretches the grid draws, and stretches a clip
     writes for itself. Chunks have to reach the muxer with rising timestamps,
     so the two are interleaved here rather than run one after the other. */
  const segments = [];
  let at = 0;
  for (const [i, window] of [...straight.entries()].sort((a, b) => a[1].start - b[1].start)) {
    if (window.start > at + 1e-6) segments.push({ kind: 'grid', from: at, to: window.start });
    segments.push({ kind: 'clip', i, from: window.start, to: window.start + window.span });
    at = window.start + window.span;
  }
  if (at < plan.total - 1e-6) segments.push({ kind: 'grid', from: at, to: plan.total });

  let cancelled = false;
  let done = 0;
  const step = () => {
    done++;
    if (onProgress && done % 4 === 0) onProgress(Math.min(0.99, done / totalFrames));
  };

  for (const seg of segments) {
    if (cancelled || failed) break;

    if (seg.kind === 'grid') {
      const first = Math.ceil(seg.from * fps - 1e-6);
      const last = Math.ceil(seg.to * fps - 1e-6);
      for (let f = first; f < last; f++) {
        if (shouldStop && shouldStop()) { cancelled = true; break; }
        if (failed) break;
        const t = f / fps;

        // Put every clip on screen at this instant on its own frame first.
        for (const { i, local } of framesOnScreen(slides, opts, t)) {
          const slide = slides[i];
          if (slide && slide.kind === 'video') {
            const dur = slide.el.duration || 0;
            let want = dur ? local % dur : 0;
            // Ask for a point inside the source frame, not its edge. Not the
            // middle either: a source frame's real boundary sits a little later
            // than its nominal time, so the middle tips into the next frame once
            // a second on 25fps footage. Sweeping the offset against clips of
            // known rate, 0.2-0.35 hits every frame at 24, 25, 30, 50 and 60fps.
            // The epsilon is for f/25*25 coming back as 1.9999999999999998.
            want = slide.fps > 0
              ? (Math.floor(want * slide.fps + 1e-4) + FRAME_PICK) / slide.fps
              : want + FRAME_PICK / fps;
            await seekTo(slide.el, want);
          }
        }

        drawFrame(ctx, slides, t, opts);
        const frame = new VideoFrame(canvas, {
          timestamp: Math.round((f * 1e6) / fps),
          duration: Math.round(1e6 / fps),
        });
        venc.encode(frame, { keyFrame: f % (fps * 2) === 0 });
        frame.close();
        await drain(venc, 6);
        step();
      }
      continue;
    }

    // A clip writing its own frames, at the timestamps they carry in the file.
    const slide = slides[seg.i];
    const track = tracks.get(seg.i);
    const composite = needsCompositing(slide, track);
    const offset = Math.round(seg.from * 1e6);
    let n = 0;
    try {
      await decodeTrack(track, async (frame) => {
        if (cancelled || failed) return;
        const ts = offset + frame.timestamp;
        let out;
        if (composite) {
          // Draw the frame we just decoded, not whatever the <video> element
          // happens to be showing: drawSlide reads slide.el, so it is lent the
          // decoded frame for the length of the call.
          const held = slide.el;
          slide.el = frame;
          try {
            drawFrame(ctx, slides, seg.from + frame.timestamp / 1e6, opts);
          } finally { slide.el = held; }
          out = new VideoFrame(canvas, { timestamp: ts, duration: frame.duration || undefined });
        } else {
          // Untouched: the decoded picture goes straight to the encoder.
          out = new VideoFrame(frame, { timestamp: ts, duration: frame.duration || undefined });
        }
        venc.encode(out, { keyFrame: n % (fps * 2) === 0 });
        out.close();
        n++;
        await drain(venc, 6);
        step();
      }, () => cancelled || !!failed || !!(shouldStop && shouldStop()));
    } catch (_) { /* a clip that will not decode leaves a gap rather than a crash */ }
    if (shouldStop && shouldStop()) cancelled = true;
  }

  if (cancelled || failed) {
    try { venc.close(); } catch (_) {}
    if (failed) throw failed;
    return { cancelled: true };
  }

  await venc.flush();

  if (audioBuffer) {
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { failed = e; },
    });
    aenc.configure({
      codec: AUDIO_CODEC, numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 128000,
    });
    const n = audioBuffer.length;
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    const CHUNK = 9600;
    for (let off = 0; off < n; off += CHUNK) {
      const count = Math.min(CHUNK, n - off);
      const data = new Float32Array(count * 2);
      data.set(left.subarray(off, off + count), 0);
      data.set(right.subarray(off, off + count), count);
      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: count,
        numberOfChannels: 2,
        timestamp: Math.round((off / SAMPLE_RATE) * 1e6),
        data,
      });
      aenc.encode(ad);
      ad.close();
      await drain(aenc, 8);
    }
    await aenc.flush();
    aenc.close();
  }

  venc.close();
  muxer.finalize();
  if (failed) throw failed;
  if (onProgress) onProgress(1);

  return {
    blob: new Blob([target.buffer], { type: 'video/mp4' }),
    mime: 'video/mp4',
    ext: 'mp4',
    cancelled: false,
    audio: !!audioBuffer,
    frames: totalFrames,
    passedThrough: straight.size,
  };
}

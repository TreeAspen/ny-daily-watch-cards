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
    video: { codec: 'avc', width: V.W, height: V.H, frameRate: fps },
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

  let cancelled = false;
  for (let f = 0; f < totalFrames; f++) {
    if (shouldStop && shouldStop()) { cancelled = true; break; }
    if (failed) break;
    const t = f / fps;

    // Put every clip that is on screen at this instant on its exact frame
    // before anything is drawn.
    for (const { i, local } of framesOnScreen(slides, opts, t)) {
      const slide = slides[i];
      if (slide && slide.kind === 'video') {
        const dur = slide.el.duration || 0;
        let want = dur ? local % dur : 0;
        // Land in the middle of a source frame, never on its edge: a seek to a
        // boundary can resolve either side of it, and that alone repeated a
        // third of the frames of a 30fps clip.
        // Ask for a point inside the source frame, not its edge. Not the
        // middle either: a source frame's real boundary sits a little later
        // than its nominal time, so the middle tips over into the next frame
        // once a second on 25fps footage. Sweeping the offset against clips of
        // known rate, 0.2-0.35 hits every frame at 24, 25, 30 and 60fps; the
        // middle misses. The epsilon is for f/25*25 coming back as
        // 1.9999999999999998, which would floor to the frame before.
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
    if (onProgress && f % 3 === 0) onProgress(f / totalFrames);
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
  };
}

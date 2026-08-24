/* Reading a clip's own frames.

   Everything else in the exporter asks "what does the picture look like at time
   t" and samples the clip there. That is resampling, and resampling footage onto
   a grid it was not shot on repeats frames on a cycle — which is what judder is.
   Footage shot at a variable rate, as phones and screen recorders produce, has
   no grid to match at all.

   So for a clip that plays once at its own length, its frames are read straight
   out of the file with the timestamps they were recorded with, and written to
   the export at those same timestamps. The count is the count; nothing is
   invented and nothing is dropped. */

let loading = null;

/* mp4box is a classic script, so it is pulled in on demand rather than
   weighing down a page that never opens the video tab. */
function loadMP4Box() {
  if (window.MP4Box) return Promise.resolve(window.MP4Box);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('./mp4box.min.js', import.meta.url).href;
    s.onload = () => (window.MP4Box ? resolve(window.MP4Box) : reject(new Error('mp4box')));
    s.onerror = () => reject(new Error('mp4box'));
    document.head.appendChild(s);
  });
  return loading;
}

export async function demuxable() {
  try { await loadMP4Box(); return true; } catch (_) { return false; }
}

/* The video track's encoded samples, in decode order, with the description the
   decoder needs. Returns null for anything that is not a plain H.264 MP4. */
export async function readVideoTrack(file) {
  const MP4Box = await loadMP4Box();
  const buf = await file.arrayBuffer();
  buf.fileStart = 0;

  return new Promise((resolve) => {
    const mp4 = MP4Box.createFile();
    let info = null;
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    mp4.onError = () => done(null);
    mp4.onReady = (i) => {
      info = i;
      const track = i.videoTracks && i.videoTracks[0];
      if (!track) { done(null); return; }
      mp4.setExtractionOptions(track.id, null, { nbSamples: Number.MAX_SAFE_INTEGER });
      mp4.start();
    };
    mp4.onSamples = (id, user, samples) => {
      const track = info.videoTracks.find((t) => t.id === id);
      if (!track) { done(null); return; }

      // H.264 in MP4 is length-prefixed, so the decoder cannot start without
      // the avcC box verbatim — it carries the SPS and PPS. Without it the very
      // first decode fails with "a key frame is required".
      let description = null;
      let descriptionError = null;
      try {
        // DataStream is a global in the bundled build, not a property of MP4Box.
        const DS = MP4Box.DataStream || window.DataStream;
        const entry = mp4.getTrackById(id).mdia.minf.stbl.stsd.entries[0];
        const box = entry.avcC || entry.hvcC || entry.av1C || entry.vpcC;
        if (!DS) descriptionError = 'no DataStream';
        else if (!box) descriptionError = 'no codec config box';
        else {
          const stream = new DS(undefined, 0, DS.BIG_ENDIAN);
          box.write(stream);
          description = new Uint8Array(stream.buffer, 8);   // past the box header
        }
      } catch (e) { descriptionError = e.message; }

      const out = samples.map((s) => ({
        data: s.data,
        // mp4box reports in the track's own timescale; microseconds is what
        // WebCodecs speaks.
        timestamp: (s.cts * 1e6) / s.timescale,
        duration: (s.duration * 1e6) / s.timescale,
        key: !!s.is_sync,
      }));
      mp4.stop();
      mp4.flush();
      done({
        codec: track.codec,
        description,
        descriptionError,
        width: track.video ? track.video.width : track.track_width,
        height: track.video ? track.video.height : track.track_height,
        samples: out,
        frames: out.length,
        seconds: track.duration / track.timescale,
      });
    };

    try {
      mp4.appendBuffer(buf);
      mp4.flush();
    } catch (_) { done(null); }
    setTimeout(() => done(null), 20000);
  });
}

/* Can this browser's WebCodecs actually decode the track? Reading a file is not
   the same as being able to play it: HEVC demuxes fine everywhere and decodes
   almost nowhere, and committing to the frame-exact path without asking left
   the clip silently missing from the export. */
export async function decodable(track) {
  if (!track || typeof VideoDecoder === 'undefined') return false;
  const config = { codec: track.codec, codedWidth: track.width, codedHeight: track.height };
  if (track.description) config.description = track.description;
  try {
    const support = await VideoDecoder.isConfigSupported(config);
    return !!support.supported;
  } catch (_) { return false; }
}

/* Hands every frame of a track to `onFrame`, in presentation order, with the
   timestamp it carries in the file. */
export async function decodeTrack(track, onFrame, shouldStop) {
  if (typeof VideoDecoder === 'undefined') throw new Error('no-decoder');
  const config = { codec: track.codec, codedWidth: track.width, codedHeight: track.height };
  if (track.description) config.description = track.description;

  const support = await VideoDecoder.isConfigSupported(config);
  if (!support.supported) throw new Error('unsupported-codec');

  // Decode order is not presentation order when there are B-frames, so frames
  // are held briefly and released in timestamp order.
  const pending = [];
  let failed = null;

  const decoder = new VideoDecoder({
    output: (frame) => pending.push(frame),
    error: (e) => { failed = e; },
  });
  decoder.configure(config);

  const flushPending = async (keep) => {
    pending.sort((a, b) => a.timestamp - b.timestamp);
    while (pending.length > keep) {
      const frame = pending.shift();
      await onFrame(frame);
      frame.close();
    }
  };

  for (const s of track.samples) {
    if (failed) break;
    if (shouldStop && shouldStop()) break;
    decoder.decode(new EncodedVideoChunk({
      type: s.key ? 'key' : 'delta',
      timestamp: s.timestamp,
      duration: s.duration,
      data: s.data,
    }));
    if (decoder.decodeQueueSize > 12) {
      await new Promise((r) => {
        const check = () => {
          if (decoder.decodeQueueSize <= 6) { decoder.removeEventListener('dequeue', check); r(); }
        };
        decoder.addEventListener('dequeue', check);
        check();
      });
    }
    await flushPending(8);        // eight is well past any sane B-frame reorder depth
  }

  await decoder.flush();
  await flushPending(0);
  decoder.close();
  if (failed) throw failed;
}

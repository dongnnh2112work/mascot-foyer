import { frameAt } from "./motion";

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ src, image, ok: true });
    image.onerror = () => resolve({ src, image: null, ok: false });
    image.src = `/${src}`;
  });
}

/**
 * Full-frame sprite sheet engine (no separate mouth/eye layers).
 * @param {HTMLCanvasElement} canvas
 * @param {object} manifest
 */
export async function createEngine(canvas, manifest) {
  const ctx = canvas.getContext("2d");
  const assets = new Map();
  const missing = [];
  const jobs = [];

  const remember = (src) => {
    if (!src || assets.has(src)) return;
    assets.set(src, null);
    jobs.push(
      loadImage(src).then((asset) => {
        assets.set(src, asset);
        if (!asset.ok) missing.push(src);
      }),
    );
  };

  if (manifest.layers?.body) remember(manifest.layers.body);
  for (const frames of Object.values(manifest.clips || {})) {
    for (const frame of frames) remember(frame.src);
  }
  await Promise.all(jobs);

  let clipName =
    manifest.defaultClip && manifest.clips?.[manifest.defaultClip]
      ? manifest.defaultClip
      : Object.keys(manifest.clips || {})[0] || "idle";
  let clipStarted = performance.now();
  let running = false;
  let latest = { clip: clipName, frameIndex: 0, frameCount: 0 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function drawContain(source, width, height) {
    const scale = Math.min(canvas.width / width, canvas.height / height);
    const w = width * scale;
    const h = height * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.drawImage(source, x, y, w, h);
  }

  function setClip(name) {
    if (!manifest.clips?.[name]) return;
    if (name === clipName) return;
    clipName = name;
    clipStarted = performance.now();
  }

  function availableClips() {
    const result = {};
    for (const [name, frames] of Object.entries(manifest.clips || {})) {
      const ok = frames.every((f) => assets.get(f.src)?.ok);
      result[name] = { ok, frames: frames.length, missing: frames.filter((f) => !assets.get(f.src)?.ok).map((f) => f.src) };
    }
    return result;
  }

  function frame() {
    const now = performance.now();
    const clip = manifest.clips[clipName] || Object.values(manifest.clips)[0] || [];
    const current = frameAt(clip, now - clipStarted);
    const frameIndex = Math.max(0, clip.indexOf(current));
    const bodyAsset = assets.get(current?.src) || assets.get(manifest.layers?.body);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e8efe8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (bodyAsset?.ok && bodyAsset.image) {
      const logicalW = manifest.canvas?.width || bodyAsset.image.naturalWidth;
      const logicalH = manifest.canvas?.height || bodyAsset.image.naturalHeight;
      drawContain(bodyAsset.image, logicalW, logicalH);
    }

    return { clip: clipName, frameIndex, frameCount: clip.length };
  }

  function tick() {
    latest = frame();
    if (running) requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    requestAnimationFrame(tick);
  }

  function snapshot() {
    return { ...latest, missing: [...missing].sort(), clips: availableClips() };
  }

  window.addEventListener("resize", resize);
  resize();
  start();

  return { setClip, snapshot, resize, availableClips };
}

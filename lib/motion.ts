export function frameAt(frames, elapsedMs) {
  if (!frames || frames.length === 0) return null;
  const total = frames.reduce((sum, frame) => sum + Math.max(1, frame.ms || 1), 0);
  let time = elapsedMs % total;
  for (const frame of frames) {
    const duration = Math.max(1, frame.ms || 1);
    if (time < duration) return frame;
    time -= duration;
  }
  return frames[frames.length - 1];
}

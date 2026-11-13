// Finds the main face in a photo so round thumbnails can be centered on it.
// Runs in the browser; the detector loads only the first time someone uploads a photo.
let detectorP = null;
async function detector() {
  if (!detectorP) detectorP = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    return FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
      runningMode: 'IMAGE', minDetectionConfidence: 0.5,
    });
  })();
  return detectorP;
}
// Returns {x, y} as percentages of the image, or null if no face was found.
export async function findFace(file) {
  if (!file || !String(file.type).startsWith('image/')) return null;
  try {
    const bmp = await createImageBitmap(file);
    // shrink big photos first; the detector works best around 1000px
    const s = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const det = await detector();
    const res = det.detect(c);
    const best = (res.detections || []).map(d => d.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!best) return null;
    return { x: Math.round((best.originX + best.width / 2) / c.width * 100), y: Math.round((best.originY + best.height / 2) / c.height * 100) };
  } catch (e) { return null; }
}

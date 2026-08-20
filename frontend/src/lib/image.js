/**
 * Turning a phone photo into something an API can carry.
 *
 * A delivery proof comes off a camera at three to six megabytes. That is far
 * more than the evidence needs — a dispute reviewer is looking at "is this the
 * right item, was it handed over" — and far more than the transport allows:
 * the API caps a request body at 1MB, and in demo mode the image goes into
 * localStorage, where a few megabytes is the entire quota.
 *
 * So the browser resizes before uploading. Downscale to a sane long edge,
 * re-encode as JPEG, and step the quality down until it fits. The result is
 * legible on a phone and on a reviewer's screen, which is all it has to be.
 */

/** Long edge, in CSS pixels. Comfortably readable, nowhere near a raw photo. */
const MAX_EDGE = 1400;

/** Base64 characters, matching the server's own ceiling. */
const MAX_CHARS = 700_000;

const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45, 0.34];

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** What the file input should offer. HEIC is listed because iPhones produce it. */
export const ACCEPT_ATTRIBUTE = 'image/*';

/** Rough decoded size of a base64 payload, for showing the user a number. */
export const dataUrlBytes = (dataUrl) => {
  const payload = String(dataUrl).split(',')[1] ?? '';
  return Math.floor((payload.length * 3) / 4);
};

export const formatBytes = (bytes) =>
  (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      /* Safari cannot decode HEIC into a canvas even though it will happily
       * hand you the file. Saying so beats a silent failure. */
      reject(new Error('That image could not be read. Try a JPEG or PNG.'));
    };
    img.src = url;
  });
}

/**
 * Reads a File and returns `{ dataUrl, fileName, byteSize, width, height }`.
 *
 * @param {File} file
 * @throws if the file is not an image, or cannot be squeezed under the ceiling
 */
export async function prepareImageUpload(file) {
  if (!file) throw new Error('Choose a photo first.');
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');

  const img = await loadImage(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  /* A photo scaled down in one step aliases badly; the smoothing hint is what
     keeps a handwritten receipt or a serial number readable. */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  /* JPEG has no alpha, so a transparent PNG would come out with black behind
     it. White is what a scanned document expects. */
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if ((dataUrl.split(',')[1] ?? '').length <= MAX_CHARS) {
      return {
        dataUrl,
        fileName: file.name?.replace(/\.[^.]+$/, '.jpg') ?? 'delivery-proof.jpg',
        byteSize: dataUrlBytes(dataUrl),
        width,
        height,
      };
    }
  }

  throw new Error('That image is too large even after compression. Try a smaller photo.');
}

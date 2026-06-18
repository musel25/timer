/** Compute target dimensions so the longest edge is at most maxEdge.
 *  Never upscales. Preserves aspect ratio. Returns integer pixels. */
export function scaledDimensions(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/** Output mime to re-encode to. Canvas can't keep animated GIFs, so callers
 *  handle GIF separately; for the rest we keep png/webp/jpeg and fall back to png. */
function outputMime(input: string): string {
  if (input === 'image/jpeg' || input === 'image/webp') return input;
  return 'image/png';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

/** Downscale a pasted image to a data URL whose longest edge is <= maxEdge.
 *  GIFs are passed through unchanged to keep animation. */
export async function resizeImageToDataUrl(
  file: Blob,
  maxEdge = 1600,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif') {
    const img = await loadImage(original);
    return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight };
  }
  const img = await loadImage(original);
  const dims = scaledDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight };
  ctx.drawImage(img, 0, 0, dims.width, dims.height);
  const mime = outputMime(file.type);
  const dataUrl = mime === 'image/jpeg' ? canvas.toDataURL(mime, 0.9) : canvas.toDataURL(mime);
  return { dataUrl, width: dims.width, height: dims.height };
}

const LOGO_SIZE = 256;
export const MAX_LOGO_BYTES = 200 * 1024;

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

// Shrinks a logo in the browser before upload, keeping storage and page weight small.
// Returns null when the file can't be read as an image.
export async function resizeLogo(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, LOGO_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Safari can't encode WebP and silently returns a PNG, which is also accepted.
  return encode(canvas, "image/webp", 0.85);
}

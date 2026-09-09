export async function normalizeProfilePhoto(file: File): Promise<Blob> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    const loaded = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(); });
    image.src = sourceUrl;
    await loaded;
  } catch {
    URL.revokeObjectURL(sourceUrl);
    throw new Error("The selected photo could not be opened. Try choosing another photo.");
  }
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 800;
  canvas.getContext("2d")?.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 800, 800);
  URL.revokeObjectURL(sourceUrl);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob) throw new Error("The image could not be prepared.");
  return blob;
}

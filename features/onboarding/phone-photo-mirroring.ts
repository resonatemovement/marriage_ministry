import type { PhonePhotoSource } from "./phone-photo-selection";

/**
 * Mirrors a native front-camera selfie in its pixel data. Drawing the decoded
 * image into a canvas preserves its browser-corrected EXIF orientation and
 * intrinsic dimensions; the resulting WebP is the same image shown and uploaded.
 */
export async function preparePhonePhoto(file: File, source: PhonePhotoSource) {
  if (source === "library") return file;
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadPhoto(sourceUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("The photo could not be prepared. Please try again.");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The photo could not be prepared. Please try again.");

    context.setTransform(-1, 0, 0, 1, width, 0);
    context.drawImage(image, 0, 0, width, height);
    const mirrored = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!mirrored) throw new Error("The photo could not be prepared. Please try again.");

    return new File([mirrored], "selfie.webp", { type: "image/webp", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadPhoto(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photo could not be prepared. Please try another image."));
    image.src = sourceUrl;
  });
}

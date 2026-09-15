export const PROFILE_PHOTO_MAX_SOURCE_SIZE = 5 * 1024 * 1024;
export const PROFILE_PHOTO_CONTENT_TYPE = "image/avif";

export function profilePhotoPath(profileId: string) {
  return `profiles/${profileId}/avatar.avif`;
}

export function profilePhotoSourceError(file: Pick<File, "name" | "size" | "type"> | null) {
  if (!file || file.size === 0) return "Choose a profile photo before uploading.";
  if (file.size > PROFILE_PHOTO_MAX_SOURCE_SIZE) return "Choose an image smaller than 5 MB.";
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) return "Choose a JPG, PNG, WebP, or AVIF image.";
  return "";
}

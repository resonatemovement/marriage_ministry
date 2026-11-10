type FileListLike = Pick<FileList, "item"> | null;
export type PhonePhotoSource = "library" | "native-camera";

export function selectedPhonePhoto(files: FileListLike) {
  return files?.item(0) ?? null;
}

export function isSupportedPhonePhoto(file: Pick<File, "name" | "type" | "size">) {
  return file.size > 0 && (file.type.startsWith("image/") || /\.(avif|heic|heif|jpe?g|png|webp)$/i.test(file.name));
}

export function attachNativePhotoChangeListener(input: Pick<HTMLInputElement, "addEventListener" | "removeEventListener" | "files" | "value">, onFile: (file: File | null) => void) {
  const listener = () => {
    const file = input.files?.item(0) ?? null;
    input.value = "";
    onFile(file);
  };
  input.addEventListener("change", listener);
  return () => input.removeEventListener("change", listener);
}

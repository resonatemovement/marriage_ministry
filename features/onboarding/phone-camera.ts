export const frontCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user" },
};

export function cameraUnavailableMessage(secureContext: boolean, supported: boolean) {
  if (!secureContext) return "Camera access requires a secure connection. You can choose a photo from your library instead.";
  if (!supported) return "Camera access is not available in this browser. You can choose a photo from your library instead.";
  return "We could not start the camera. You can choose a photo from your library instead.";
}

export function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function captureCameraFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The camera is still starting. Try again in a moment.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!image) throw new Error("The photo could not be captured. Please try again.");
  return image;
}

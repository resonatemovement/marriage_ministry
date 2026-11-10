export type CameraFacingMode = "user" | "environment";

export function cameraConstraints(facingMode: CameraFacingMode): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode,
      // Preferences only: browsers can choose the closest supported camera mode.
      width: { ideal: 1920 },
      height: { ideal: 1440 },
    },
  };
}

export const frontCameraConstraints: MediaStreamConstraints = cameraConstraints("user");

export function nextCameraFacingMode(facingMode: CameraFacingMode): CameraFacingMode {
  return facingMode === "user" ? "environment" : "user";
}

export function canFlipCamera(devices: Pick<MediaDeviceInfo, "kind">[]) {
  return devices.filter((device) => device.kind === "videoinput").length > 1;
}

export function cameraUnavailableMessage(secureContext: boolean, supported: boolean) {
  if (!secureContext) return "Camera access requires a secure connection. You can choose a photo from your library instead.";
  if (!supported) return "Camera access is not available in this browser. You can choose a photo from your library instead.";
  return "We could not start the camera. You can choose a photo from your library instead.";
}

export function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function switchCameraStream(
  stream: MediaStream,
  currentFacingMode: CameraFacingMode,
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
) {
  const nextFacingMode = nextCameraFacingMode(currentFacingMode);
  stopCameraStream(stream);

  try {
    return { stream: await getUserMedia(cameraConstraints(nextFacingMode)), facingMode: nextFacingMode, switched: true };
  } catch {
    try {
      return { stream: await getUserMedia(cameraConstraints(currentFacingMode)), facingMode: currentFacingMode, switched: false };
    } catch {
      throw new Error("The camera could not be restarted.");
    }
  }
}

export async function captureCameraFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The camera is still starting. Try again in a moment.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The photo could not be captured. Please try again.");
  // Keep the source's natural orientation and aspect ratio; do not mirror or stretch it.
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!image) throw new Error("The photo could not be captured. Please try again.");
  return image;
}

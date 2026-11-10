export type CameraFacingMode = "user" | "environment";
export const CAMERA_PREVIEW_ASPECT_RATIO = 3 / 4;
export const CAMERA_CROP_ZOOM = 1.1;

export type CameraCrop = { x: number; y: number; width: number; height: number };

export function centeredCameraCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect = CAMERA_PREVIEW_ASPECT_RATIO,
  zoom = CAMERA_CROP_ZOOM,
): CameraCrop {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetAspect <= 0 || zoom < 1) {
    throw new Error("The camera image dimensions are unavailable.");
  }

  let width: number;
  let height: number;
  if (sourceWidth / sourceHeight > targetAspect) {
    height = sourceHeight;
    width = height * targetAspect;
  } else {
    width = sourceWidth;
    height = width / targetAspect;
  }

  width /= zoom;
  height /= zoom;
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}

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

export async function captureCameraFrame(video: HTMLVideoElement, mirror = false) {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The camera is still starting. Try again in a moment.");
  const crop = centeredCameraCrop(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The photo could not be captured. Please try again.");
  // Draw the centered crop once; front-camera pixels then match the mirrored live preview.
  context.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? canvas.width : 0, 0);
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!image) throw new Error("The photo could not be captured. Please try again.");
  return image;
}

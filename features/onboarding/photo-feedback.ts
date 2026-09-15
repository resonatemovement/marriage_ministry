export const PHOTO_UPLOAD_SUCCESS = "Photo uploaded. You can now complete onboarding.";

export type PhotoUploadFeedback = { success: boolean; error: string };

export function photoSelectionFeedback(error: string): PhotoUploadFeedback {
  return { success: false, error };
}

export function photoUploadStarted(): PhotoUploadFeedback {
  return { success: false, error: "" };
}

export function photoUploadSucceeded(): PhotoUploadFeedback {
  return { success: true, error: "" };
}

export function photoUploadFailed(error: string): PhotoUploadFeedback {
  return { success: false, error };
}

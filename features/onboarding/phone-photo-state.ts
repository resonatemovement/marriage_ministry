export type PhonePhotoStage = "initial" | "requesting_camera" | "camera_live" | "processing" | "preview" | "uploading" | "error" | "completed";

export function nextPhonePhotoStage(event: "select" | "prepared" | "failed" | "upload" | "uploaded"): PhonePhotoStage {
  if (event === "select") return "processing";
  if (event === "prepared") return "preview";
  if (event === "upload") return "uploading";
  if (event === "uploaded") return "completed";
  return "error";
}

export function phonePhotoStageIsBusy(stage: PhonePhotoStage) {
  return stage === "processing" || stage === "uploading";
}

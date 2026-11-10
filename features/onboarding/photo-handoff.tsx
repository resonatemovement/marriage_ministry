"use client";
/* eslint-disable @next/next/no-img-element -- QR data URLs and local blob previews cannot use the Next image optimizer. */
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPhotoHandoff, photoHandoffStatus } from "./handoff-actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { profilePhotoPath, profilePhotoSourceError } from "./profile-photo-contract";
import { phonePhotoStageIsBusy, type PhonePhotoStage } from "./phone-photo-state";
import { attachNativePhotoChangeListener, isSupportedPhonePhoto } from "./phone-photo-selection";
import { cameraUnavailableMessage, canFlipCamera, captureCameraFrame, frontCameraConstraints, stopCameraStream, switchCameraStream, type CameraFacingMode } from "./phone-camera";
import { PhonePhotoCaptureView } from "./phone-photo-capture-view";

type HandoffProps = { profileId: string; onCompleted: (url: string) => void };

export function PhotoHandoff({ profileId, onCompleted }: HandoffProps) {
  const [qr, setQr] = useState(""); const [token, setToken] = useState(""); const [error, setError] = useState(""); const [expired, setExpired] = useState(false);
  async function start() { setError(""); setExpired(false); const result = await createPhotoHandoff(); if (!result.success) return setError(result.error); setToken(result.token); setQr(await QRCode.toDataURL(result.url)); }
  const refreshPhoto = useCallback(async () => { const { data } = await createBrowserSupabaseClient().storage.from("profile-photos").createSignedUrl(profilePhotoPath(profileId), 3600); if (data?.signedUrl) onCompleted(data.signedUrl); }, [onCompleted, profileId]);
  useEffect(() => { if (!token) return; const timer = setInterval(async () => { const result = await photoHandoffStatus(token); if (result.state === "completed") { clearInterval(timer); setToken(""); setQr(""); await refreshPhoto(); } else if (result.state !== "active") { clearInterval(timer); setToken(""); setQr(""); setExpired(true); } }, 5000); return () => clearInterval(timer); }, [refreshPhoto, token]);
  return <div className="mt-3"><button type="button" onClick={start} className="h-10 rounded-md bg-white px-3 text-sm font-semibold text-brand-primary ring-1 ring-border">{qr ? "Start a new phone handoff" : "Take photo on phone"}</button>{qr ? <div className="mt-3"><img src={qr} alt="Scan to take your profile photo on your phone" className="size-44"/><p className="mt-2 text-xs text-text-muted">Scan this code with your phone. This secure link expires in 10 minutes.</p><button type="button" onClick={refreshPhoto} className="mt-2 text-xs font-semibold text-brand-primary underline">Refresh photo status</button></div> : null}{expired ? <p role="status" className="mt-3 text-sm text-text-muted">This phone handoff expired. Start a new one to continue.</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-danger-strong">{error}</p> : null}</div>;
}

export function PhonePhotoUpload({ token }: { token: string }) {
  const [image, setImage] = useState<Blob | null>(null); const [preview, setPreview] = useState(""); const [message, setMessage] = useState(""); const [stage, setStage] = useState<PhonePhotoStage>("initial");
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>("user"); const [canSwitchCamera, setCanSwitchCamera] = useState(false); const [cameraTransitioning, setCameraTransitioning] = useState(false); const [cameraSession, setCameraSession] = useState(0);
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const libraryInput = useRef<HTMLInputElement>(null); const cameraRequest = useRef(false); const uploadInProgress = useRef(false); const mounted = useRef(false);
  const stopCamera = useCallback(() => { stopCameraStream(stream.current); stream.current = null; }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopCamera(); }; }, [stopCamera]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const prepare = useCallback((file: File) => { const sourceError = profilePhotoSourceError(file); if (sourceError) { setStage("error"); setMessage(sourceError); return; } setStage("processing"); setMessage(""); const nextPreview = URL.createObjectURL(file); setImage(file); setPreview((current) => { if (current) URL.revokeObjectURL(current); return nextPreview; }); setStage("preview"); }, []);
  const receiveLibraryFile = useCallback((file: File | null) => { if (!file) return; if (libraryInput.current) libraryInput.current.value = ""; if (!isSupportedPhonePhoto(file)) { setStage("error"); setMessage("Choose a photo from your camera or library."); return; } stopCamera(); setCanSwitchCamera(false); prepare(file); }, [prepare, stopCamera]);
  useEffect(() => { const input = libraryInput.current; return input ? attachNativePhotoChangeListener(input, receiveLibraryFile) : undefined; }, [receiveLibraryFile]);
  useEffect(() => { if (stage !== "camera_live" || !video.current || !stream.current) return; video.current.srcObject = stream.current; void video.current.play(); }, [stage, cameraSession]);
  async function startCamera() {
    if (cameraRequest.current) return;
    cameraRequest.current = true; setCameraTransitioning(true); setCanSwitchCamera(false); setCameraFacingMode("user");
    if (!window.isSecureContext) { setStage("error"); setMessage(cameraUnavailableMessage(false, true)); cameraRequest.current = false; setCameraTransitioning(false); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setStage("error"); setMessage(cameraUnavailableMessage(true, false)); cameraRequest.current = false; setCameraTransitioning(false); return; }
    setStage("requesting_camera"); setMessage("");
    try {
      stopCamera();
      const nextStream = await navigator.mediaDevices.getUserMedia(frontCameraConstraints);
      if (!mounted.current) { stopCameraStream(nextStream); return; }
      stream.current = nextStream; setCameraSession((session) => session + 1); setStage("camera_live");
      try { const devices = await navigator.mediaDevices.enumerateDevices(); if (mounted.current) setCanSwitchCamera(canFlipCamera(devices)); } catch { if (mounted.current) setCanSwitchCamera(false); }
    } catch { if (mounted.current) { setStage("error"); setMessage(cameraUnavailableMessage(true, true)); } }
    finally { cameraRequest.current = false; if (mounted.current) setCameraTransitioning(false); }
  }
  async function flipCamera() {
    const currentStream = stream.current;
    if (cameraRequest.current || !currentStream || !navigator.mediaDevices?.getUserMedia) return;
    cameraRequest.current = true; setCameraTransitioning(true); setMessage(""); stream.current = null; video.current?.pause(); if (video.current) video.current.srcObject = null;
    try {
      const result = await switchCameraStream(currentStream, cameraFacingMode, (constraints) => navigator.mediaDevices.getUserMedia(constraints));
      if (!mounted.current) { stopCameraStream(result.stream); return; }
      stream.current = result.stream; setCameraSession((session) => session + 1); setCameraFacingMode(result.facingMode); setMessage(result.switched ? "" : "Could not switch cameras. Your current camera is still active.");
    } catch { if (mounted.current) { setCanSwitchCamera(false); setStage("error"); setMessage(cameraUnavailableMessage(true, true)); } }
    finally { cameraRequest.current = false; if (mounted.current) setCameraTransitioning(false); }
  }
  async function takeCameraPhoto() { if (!video.current || cameraRequest.current) return; setStage("processing"); setCanSwitchCamera(false); try { const frame = await captureCameraFrame(video.current); stopCamera(); prepare(new File([frame], "camera.webp", { type: "image/webp" })); } catch (error) { stopCamera(); setStage("error"); setMessage(error instanceof Error ? error.message : "The photo could not be captured. Please try again."); } }
  async function upload() {
    if (!image || uploadInProgress.current || stage === "completed") return;
    uploadInProgress.current = true;
    setStage("uploading"); setMessage("");
    try {
      const response = await fetch(`/api/onboarding/photo-handoff/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": image.type }, body: image });
      const result = await response.json() as { success: boolean; error?: string };
      if (result.success) { stopCamera(); setStage("completed"); }
      else { setStage("error"); setMessage(result.error ?? "The photo could not be uploaded. Please try again."); }
    } catch { setStage("error"); setMessage("The photo could not be uploaded. Please try again."); }
    finally { uploadInProgress.current = false; }
  }
  function cancelCamera() { stopCamera(); setCanSwitchCamera(false); setStage("initial"); }
  function clearPreview() { setImage(null); setPreview(""); }
  const busy = phonePhotoStageIsBusy(stage) || stage === "requesting_camera" || cameraTransitioning;
  return <PhonePhotoCaptureView
    stage={stage}
    preview={preview}
    message={message}
    busy={busy}
    canSwitchCamera={canSwitchCamera}
    cameraTransitioning={cameraTransitioning}
    videoRef={video}
    libraryInputRef={libraryInput}
    onStartCamera={startCamera}
    onTakePhoto={takeCameraPhoto}
    onFlipCamera={flipCamera}
    onCancelCamera={cancelCamera}
    onChoosePhoto={() => libraryInput.current?.click()}
    onRetake={() => { clearPreview(); void startCamera(); }}
    onUpload={upload}
  />;
}

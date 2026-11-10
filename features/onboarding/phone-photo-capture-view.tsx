/* eslint-disable @next/next/no-img-element -- Local photo previews use blob URLs, not optimizer-compatible sources. */
import { ArrowLeft, Image as ImageIcon, SwitchCamera } from "lucide-react";
import type { RefObject } from "react";
import type { PhonePhotoStage } from "./phone-photo-state";

type PhonePhotoCaptureViewProps = {
  stage: PhonePhotoStage;
  preview: string;
  message: string;
  busy: boolean;
  canSwitchCamera: boolean;
  cameraTransitioning: boolean;
  mirrorLivePreview: boolean;
  cameraCropZoom: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  libraryInputRef: RefObject<HTMLInputElement | null>;
  onStartCamera: () => void;
  onTakePhoto: () => void;
  onFlipCamera: () => void;
  onCancelCamera: () => void;
  onChoosePhoto: () => void;
  onRetake: () => void;
  onUpload: () => void;
};

const pickerClass = "inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-center text-xs font-semibold text-brand-primary transition-colors hover:bg-surface-muted focus-visible:bg-sidebar-accent disabled:pointer-events-none disabled:opacity-60 sm:text-sm";

export function PhonePhotoCaptureView({
  stage,
  preview,
  message,
  busy,
  canSwitchCamera,
  cameraTransitioning,
  mirrorLivePreview,
  cameraCropZoom,
  videoRef,
  libraryInputRef,
  onStartCamera,
  onTakePhoto,
  onFlipCamera,
  onCancelCamera,
  onChoosePhoto,
  onRetake,
  onUpload,
}: PhonePhotoCaptureViewProps) {
  const hasPreview = Boolean(preview);
  const isLive = stage === "camera_live";
  const showBack = isLive;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6">
      <header className="flex min-h-12 items-center gap-3">
        {showBack ? (
          <button
            type="button"
            onClick={onCancelCamera}
            disabled={busy}
            aria-label="Back"
            className="grid size-11 shrink-0 place-items-center rounded-full text-brand-primary transition-colors hover:bg-surface-muted focus-visible:bg-sidebar-accent disabled:opacity-60"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        ) : null}
        <div className="min-w-0">
          <p className="font-heading text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-secondary">Resonate</p>
          <h1 className="font-heading text-lg font-bold leading-tight text-text-primary">Profile Photo</h1>
        </div>
      </header>

      {stage === "completed" ? (
        <p role="status" className="mt-8 text-sm leading-6 text-success-strong">
          Photo added successfully.<br />You can return to your computer.
        </p>
      ) : (
        <>
          <input
            id="phone-library-input"
            ref={libraryInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            aria-hidden="true"
            tabIndex={-1}
            disabled={busy}
          />
          {isLive ? (
            <section className="mt-4 sm:mt-6" aria-label="Camera capture">
              <p className="mb-3 text-center text-sm text-text-muted">Center your face in the frame.</p>
              <div className="relative mx-auto aspect-[3/4] w-full max-w-[min(100%,48svh,27rem)] overflow-hidden rounded-3xl bg-black shadow-lg">
                <video ref={videoRef} autoPlay playsInline muted style={{ transform: `${mirrorLivePreview ? "scaleX(-1) " : ""}scale(${cameraCropZoom})` }} className="absolute inset-0 size-full object-cover" />
                <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 shadow-[0_0_0_999px_rgb(0_0_0/12%)]" />
              </div>

              <div className="relative mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onChoosePhoto}
                  disabled={busy}
                  aria-label="Choose a photo from your library"
                  className={`${pickerClass} disabled:pointer-events-none disabled:opacity-60`}
                >
                  <ImageIcon size={19} aria-hidden="true" />
                  <span>Photo Library</span>
                </button>
                <button
                  type="button"
                  onClick={onTakePhoto}
                  disabled={busy}
                  aria-label="Take photo"
                  className="absolute left-1/2 grid size-[4.5rem] -translate-x-1/2 place-items-center rounded-full border-4 border-white bg-transparent transition-transform hover:scale-105 focus-visible:scale-105 disabled:cursor-wait disabled:opacity-60"
                >
                  <span aria-hidden="true" className="size-[3.45rem] rounded-full bg-white" />
                </button>
                {canSwitchCamera ? (
                  <button
                    type="button"
                    onClick={onFlipCamera}
                    disabled={busy}
                    aria-label="Flip camera between front and rear cameras"
                    title="Flip Camera"
                    className="grid size-12 place-items-center rounded-full text-brand-primary transition-colors hover:bg-surface-muted focus-visible:bg-sidebar-accent disabled:cursor-wait disabled:opacity-60"
                  >
                    <SwitchCamera size={22} aria-hidden="true" />
                    <span className="sr-only">Flip Camera</span>
                  </button>
                ) : null}
              </div>
              {cameraTransitioning ? <p role="status" className="mt-3 text-center text-sm text-text-muted">Switching cameras...</p> : null}
            </section>
          ) : hasPreview ? (
            <section className="mt-5 sm:mt-6" aria-label="Photo preview">
              <div className="relative mx-auto aspect-[3/4] w-full max-w-[min(100%,48svh,27rem)] overflow-hidden rounded-3xl bg-black">
                <img src={preview} alt="Selected profile photo preview" className="absolute inset-0 size-full object-contain" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" onClick={onRetake} disabled={busy} className="min-h-12 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-brand-primary transition-colors hover:bg-surface-muted focus-visible:bg-sidebar-accent disabled:opacity-60">
                  Retake
                </button>
                <button type="button" onClick={onUpload} disabled={busy} className="min-h-12 rounded-lg bg-brand-primary px-4 text-sm font-bold text-white transition-colors hover:bg-brand-secondary focus-visible:bg-brand-secondary disabled:cursor-wait disabled:opacity-60">
                  {stage === "uploading" ? "Uploading..." : "Use Photo"}
                </button>
              </div>
              <button
                type="button"
                onClick={onChoosePhoto}
                disabled={busy}
                className={`${pickerClass} mt-2 w-full disabled:pointer-events-none disabled:opacity-60`}
              >
                <ImageIcon size={18} aria-hidden="true" />
                Choose another photo
              </button>
            </section>
          ) : (
            <section className="mt-6 flex flex-1 flex-col justify-center gap-3 pb-4" aria-label="Choose a profile photo">
              <p className="text-sm text-text-muted">Take a photo or choose one from your library.</p>
              <button type="button" onClick={onStartCamera} disabled={busy} className="min-h-12 rounded-lg bg-brand-primary px-4 text-sm font-bold text-white transition-colors hover:bg-brand-secondary focus-visible:bg-brand-secondary disabled:opacity-60">
                Take Photo
              </button>
              <button
                type="button"
                onClick={onChoosePhoto}
                disabled={busy}
                className={`${pickerClass} w-full border border-border bg-white disabled:pointer-events-none disabled:opacity-60`}
              >
                <ImageIcon size={18} aria-hidden="true" />
                Photo Library
              </button>
            </section>
          )}

          {stage === "requesting_camera" ? <p role="status" className="mt-4 text-center text-sm text-text-muted">Opening camera...</p> : null}
          {stage === "processing" ? <p role="status" className="mt-4 text-center text-sm text-text-muted">Preparing your photo...</p> : null}
          {message ? <p role="alert" className="mt-4 text-sm text-danger-strong">{message}</p> : null}
        </>
      )}
    </main>
  );
}

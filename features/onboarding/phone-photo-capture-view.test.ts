import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PhonePhotoCaptureView } from "./phone-photo-capture-view";
import type { PhonePhotoStage } from "./phone-photo-state";

function markup(overrides: Partial<Parameters<typeof PhonePhotoCaptureView>[0]> = {}) {
  const props: Parameters<typeof PhonePhotoCaptureView>[0] = {
    stage: "initial",
    preview: "",
    message: "",
    busy: false,
    canSwitchCamera: false,
    cameraTransitioning: false,
    mirrorLivePreview: false,
    cameraCropZoom: 1.1,
    canMirrorPhoto: false,
    nativePhotoMirrored: false,
    videoRef: createRef<HTMLVideoElement>(),
    libraryInputRef: createRef<HTMLInputElement>(),
    nativeCameraInputRef: createRef<HTMLInputElement>(),
    onStartCamera: vi.fn(),
    onTakePhoto: vi.fn(),
    onFlipCamera: vi.fn(),
    onCancelCamera: vi.fn(),
    onChoosePhoto: vi.fn(),
    onUsePhoneCamera: vi.fn(),
    onToggleMirrorPhoto: vi.fn(),
    onRetake: vi.fn(),
    onUpload: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(createElement(PhonePhotoCaptureView, props));
}

describe("phone photo capture presentation", () => {
  it("offers browser camera, native camera, and library fallback from the ready state", () => {
    const html = markup();

    expect(html).toContain(">Take Photo</button>");
    expect(html).toContain(">Use Phone Camera</button>");
    expect(html).toContain(">Photo Library</button>");
    expect(html).toContain('id="phone-native-camera-input"');
    expect(html).toContain('capture="user"');
  });

  it("shows the live camera, guidance, accessible controls, and responsive viewport", () => {
    const html = markup({ stage: "camera_live", canSwitchCamera: true, mirrorLivePreview: true });

    expect(html).toContain("Profile Photo");
    expect(html).toContain("Center your face in the frame.");
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('playsInline=""');
    expect(html).toContain("object-cover");
    expect(html).toContain('style="transform:scaleX(-1) scale(1.1)"');
    expect(html).toContain("aspect-[3/4]");
    expect(html).toContain("max-w-[min(100%,48svh,27rem)]");
    expect(html).toContain('aria-label="Take photo"');
    expect(html).toContain('aria-label="Flip camera between front and rear cameras"');
    expect(html).toContain("Photo Library");
    expect(html).toContain('type="file" accept="image/*" capture="user"');
    expect(html).toContain('aria-label="Use Phone Camera"');
    expect(html).toContain("safe-area-inset-bottom");
  });

  it("uses centered zoom framing and keeps front/rear preview orientation correct", () => {
    expect(markup({ stage: "camera_live", mirrorLivePreview: true })).toContain('style="transform:scaleX(-1) scale(1.1)"');
    expect(markup({ stage: "camera_live", mirrorLivePreview: false })).toContain('style="transform:scale(1.1)"');
  });

  it("keeps the camera switch column without showing Flip when unavailable", () => {
    const html = markup({ stage: "camera_live", canSwitchCamera: false });

    expect(html).toContain('aria-label="Take photo"');
    expect(html).not.toContain("Flip Camera");
  });

  it("disables camera actions while a switch is in progress", () => {
    const html = markup({ stage: "camera_live", canSwitchCamera: true, cameraTransitioning: true, busy: true });

    expect(html).toContain("Switching cameras...");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Take photo"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Flip camera between front and rear cameras"/);
  });

  it("shows the captured photo with Retake and Use Photo actions", () => {
    const html = markup({ stage: "preview", preview: "blob:photo-preview" });

    expect(html).toContain('src="blob:photo-preview"');
    expect(html).toContain('alt="Selected profile photo preview"');
    expect(html).toContain(">Retake</button>");
    expect(html).toContain(">Use Photo</button>");
    expect(html).toContain("Choose another photo");
    expect(html).toContain(">Use Phone Camera</button>");
  });

  it("shows a pressed-state Mirror Photo control only for native-camera captures", () => {
    const nativeCapture = markup({ stage: "preview", preview: "blob:selfie", canMirrorPhoto: true, nativePhotoMirrored: true });
    expect(nativeCapture).toContain('aria-label="Mirror Photo: mirrored"');
    expect(nativeCapture).toContain('aria-pressed="true"');
    expect(nativeCapture).toContain("Mirror Photo");

    const librarySelection = markup({ stage: "preview", preview: "blob:library" });
    expect(librarySelection).not.toContain("Mirror Photo");
  });

  it("disables preview actions while uploading and shows upload progress", () => {
    const html = markup({ stage: "uploading", preview: "blob:photo-preview", busy: true });

    expect(html).toContain(">Uploading...</button>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Uploading\.\.\.<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retake<\/button>/);
  });

  it.each([
    ["requesting_camera", "Opening camera..."],
    ["processing", "Preparing your photo..."],
  ] as [PhonePhotoStage, string][]) ("shows the %s loading state", (stage, text) => {
    expect(markup({ stage, busy: true })).toContain(text);
  });

  it("preserves accessible errors and the photo-library fallback", () => {
    const html = markup({ stage: "error", message: "Camera permission was not granted." });

    expect(html).toContain('role="alert"');
    expect(html).toContain("Camera permission was not granted.");
    expect(html).toContain(">Photo Library</button>");
    expect(html).toContain(">Use Phone Camera</button>");
    expect(html).toContain('aria-hidden="true"');
  });

  it("confirms successful completion without exposing token details", () => {
    const html = markup({ stage: "completed" });

    expect(html).toContain("Photo added successfully.");
    expect(html).toContain("You can return to your computer.");
    expect(html).not.toContain("photo-handoff");
  });
});

import { describe, expect, it, vi } from "vitest";

import { cameraConstraints, cameraUnavailableMessage, canFlipCamera, captureCameraFrame, frontCameraConstraints, nextCameraFacingMode, stopCameraStream, switchCameraStream } from "./phone-camera";

describe("phone camera", () => {
  it("requests a front-facing video stream without audio", () => {
    expect(frontCameraConstraints).toEqual({ audio: false, video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1440 } } });
  });

  it("selects and toggles the front and rear cameras", () => {
    expect(cameraConstraints("environment")).toEqual({ audio: false, video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1440 } } });
    expect(nextCameraFacingMode("user")).toBe("environment");
    expect(nextCameraFacingMode("environment")).toBe("user");
  });

  it("offers switching only when multiple video inputs are available", () => {
    expect(canFlipCamera([{ kind: "videoinput" } as MediaDeviceInfo])).toBe(false);
    expect(canFlipCamera([{ kind: "videoinput" }, { kind: "audioinput" }, { kind: "videoinput" }] as MediaDeviceInfo[])).toBe(true);
  });

  it("explains secure-context and capability fallback safely", () => {
    expect(cameraUnavailableMessage(false, true)).toContain("secure connection");
    expect(cameraUnavailableMessage(true, false)).toContain("not available");
  });

  it("stops every active track", () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopCameraStream({ getTracks: () => tracks } as unknown as MediaStream);
    expect(tracks[0].stop).toHaveBeenCalledOnce();
    expect(tracks[1].stop).toHaveBeenCalledOnce();
  });

  it("stops the current stream before opening the selected replacement", async () => {
    const track = { stop: vi.fn() };
    const current = { getTracks: () => [track] } as unknown as MediaStream;
    const replacement = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      expect(track.stop).toHaveBeenCalledOnce();
      expect(constraints).toEqual(cameraConstraints("environment"));
      return replacement;
    });

    await expect(switchCameraStream(current, "user", getUserMedia)).resolves.toEqual({ stream: replacement, facingMode: "environment", switched: true });
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it("reopens the previous camera when switching fails", async () => {
    const current = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const restored = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockRejectedValueOnce(new Error("rear unavailable")).mockResolvedValueOnce(restored);

    await expect(switchCameraStream(current, "user", getUserMedia)).resolves.toEqual({ stream: restored, facingMode: "user", switched: false });
    expect(getUserMedia.mock.calls.map(([constraints]) => constraints)).toEqual([cameraConstraints("environment"), cameraConstraints("user")]);
  });

  it("reports failure if neither the selected nor previous camera can start", async () => {
    const current = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    await expect(switchCameraStream(current, "user", vi.fn().mockRejectedValue(new Error("unavailable"))))
      .rejects.toThrow("The camera could not be restarted.");
  });

  it("mirrors front-camera capture pixels without changing dimensions or aspect ratio", async () => {
    const drawImage = vi.fn();
    const setTransform = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["photo"], { type: "image/webp" })));
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage, setTransform }), toBlob };
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;

    const result = await captureCameraFrame(video, true);

    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(setTransform).toHaveBeenCalledOnce();
    expect(setTransform).toHaveBeenCalledWith(-1, 0, 0, 1, 1280, 0);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(result.type).toBe("image/webp");
    vi.unstubAllGlobals();
  });

  it("leaves rear-camera capture pixels in their natural orientation", async () => {
    const setTransform = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), setTransform }), toBlob: (callback: BlobCallback) => callback(new Blob(["photo"], { type: "image/webp" })) };
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

    await captureCameraFrame({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement, false);

    expect(setTransform).toHaveBeenCalledOnce();
    expect(setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    vi.unstubAllGlobals();
  });
});

import { describe, expect, it, vi } from "vitest";

import { cameraUnavailableMessage, frontCameraConstraints, stopCameraStream } from "./phone-camera";

describe("phone camera", () => {
  it("requests a front-facing video stream without audio", () => {
    expect(frontCameraConstraints).toEqual({ audio: false, video: { facingMode: "user" } });
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
});

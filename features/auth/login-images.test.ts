import { afterEach, describe, expect, it, vi } from "vitest";

import { loginImages, selectLoginImage } from "./login-images";

describe("login image selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects only from the authoritative existing image list", () => {
    expect(loginImages).toEqual([
      { src: "/images/login/couple-01.avif", alt: "" },
      { src: "/images/login/couple-02.avif", alt: "" },
      { src: "/images/login/couple-03.avif", alt: "" },
      { src: "/images/login/couple-04.avif", alt: "" },
      { src: "/images/login/couple-05.avif", alt: "" },
    ]);

    const random = vi.spyOn(Math, "random");
    const selectedImages = loginImages.map((_, index) => {
      random.mockReturnValue((index + 0.5) / loginImages.length);
      return selectLoginImage();
    });

    expect(selectedImages).toEqual(loginImages);
    expect(loginImages.every((image) => image.src.endsWith(".avif"))).toBe(true);
  });
});

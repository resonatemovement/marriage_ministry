export const loginImages = [
  { src: "/images/login/couple-01.avif", alt: "" },
  { src: "/images/login/couple-02.avif", alt: "" },
  { src: "/images/login/couple-03.avif", alt: "" },
  { src: "/images/login/couple-04.avif", alt: "" },
  { src: "/images/login/couple-05.avif", alt: "" },
] as const;

export function selectLoginImage() {
  return loginImages[Math.floor(Math.random() * loginImages.length)]!;
}

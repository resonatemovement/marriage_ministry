import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";

const creatoDisplay = localFont({
  src: [
    { path: "./fonts/CreatoDisplay-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/CreatoDisplay-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/CreatoDisplay-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/CreatoDisplay-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-creato-display",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "Marriage Ministry | Resonate",
  description: "Support for couples through every season of life.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={creatoDisplay.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

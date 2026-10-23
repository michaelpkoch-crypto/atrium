import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "Atrium — taste-to-atmosphere compiler",
  description:
    "Turn a cultural prompt into a room. Atrium uses Qloo's taste graph to choose the light, the music, the drink, and the objects.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-[#100e0c] text-[#f6f1e8]">{children}</body>
    </html>
  );
}

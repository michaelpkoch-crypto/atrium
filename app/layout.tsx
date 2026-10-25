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
    "A cultural prompt becomes a room. Atrium queries Qloo's taste graph for the lamps, the sound, and the objects, and shows the plain reading beside it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-[#100e0c] text-[#f6f1e8]">{children}</body>
    </html>
  );
}

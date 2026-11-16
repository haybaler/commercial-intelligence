import type { Metadata, Viewport } from "next";
import { RegisterSw } from "@/components/RegisterSw";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quillmere Bio — Commercial Intelligence Layer",
  description:
    "A working commercial intelligence demo for a life-sciences tools company: synthetic orders, SQL-modeled marts, and a dashboard with plain-English questions answered as SQL against a DuckDB warehouse — all in the browser.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0E7A66",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <RegisterSw />
      </body>
    </html>
  );
}

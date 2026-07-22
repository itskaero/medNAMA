import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "medNAMA — Clinical Knowledge Assistant",
  description:
    "Evidence-based medical Q&A grounded strictly in your reference textbooks. Inline citations, extracted diagrams, zero hallucinations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%" }} className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body style={{ height: "100%" }}>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}

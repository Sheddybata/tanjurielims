import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tanjuriel Corporation IMS",
  description: "Enterprise Information Management System for Tanjuriel Corporation",
  icons: {
    icon: "/tanjuriel-logo.jpg",
    apple: "/tanjuriel-logo.jpg"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

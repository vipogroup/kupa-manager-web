import type { Metadata, Viewport } from "next";
import { Assistant, Rubik } from "next/font/google";
import "./globals.css";

const body = Assistant({
  variable: "--font-body",
  subsets: ["hebrew", "latin"],
  weight: ["400", "600", "700"],
});

const display = Rubik({
  variable: "--font-display",
  subsets: ["hebrew", "latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kupa Manager — ניהול הכנסות והוצאות",
  description: "ממשק נייד לניהול הכנסות, הוצאות, לקוחות ומוצרים",
  appleWebApp: {
    capable: true,
    title: "Kupa Manager",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d5c45",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${body.variable} ${display.variable} antialiased`}>{children}</body>
    </html>
  );
}

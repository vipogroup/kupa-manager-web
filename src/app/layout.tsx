import type { Metadata, Viewport } from "next";
import { Assistant, Rubik } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
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
  applicationName: "Kupa Manager",
  title: "Kupa Manager",
  description: "ניהול הכנסות, הוצאות, לקוחות ומוצרים — חשבון אחד בכל מכשיר",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kupa Manager",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
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
      <body className={`${body.variable} ${display.variable} antialiased kupa-app-shell`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

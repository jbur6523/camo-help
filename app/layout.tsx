import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAMO Fighter Application Helper",
  description: "Prepare CAMO Athlete License and National MMA ID paperwork from your phone.",
  ...(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
    ? { robots: { index: false, follow: false, nocache: true } }
    : {})
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

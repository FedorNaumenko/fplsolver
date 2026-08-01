import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BASE_PATH } from "@/lib/utils";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FPL Solver",
  description: "Fantasy Premier League transfer advisor",
  // basePath is not applied to metadata icon paths, so it is spelled out here.
  // Verified against the emitted <link rel="icon"> in the built HTML.
  // Real sizes rather than one large file: browsers downscale a 512 to 16 poorly.
  icons: {
    icon: [16, 32, 48].map(s => ({
      url: `${BASE_PATH}/icon-${s}.png`,
      sizes: `${s}x${s}`,
      type: "image/png",
    })),
    apple: [{ url: `${BASE_PATH}/icon-180.png`, sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

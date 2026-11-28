import type { Metadata, Viewport } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const grotesk = Schibsted_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "LifeOS",
  description: "Personal dashboard",
  robots: { index: false, follow: false },
  // Home-screen app on iPhone: full screen, dark status bar over the page.
  appleWebApp: { capable: true, title: "LifeOS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#13151d",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${newsreader.variable}`}>
        {children}
      </body>
    </html>
  );
}

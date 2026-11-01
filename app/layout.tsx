import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import Script from "next/script";
import { ChunkLoadRecovery } from "@/components/chunk-load-recovery";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { ScrollReset } from "@/components/scroll-reset";
import "./globals.css";
import { FeatureProvider } from "@/components/feature-provider";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Библиотека blablablarden",
  description:
    "Философия, история и математика — личное собрание текстов blablablarden.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ed" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${sourceSans.variable} ${sourceSerif.variable} min-h-full antialiased`}
    >
      <body className="min-h-full">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark");}}catch(e){}})();`}
        </Script>
        <ScrollReset />
        <ChunkLoadRecovery />
        <MaintenanceBanner />
        <FeatureProvider>{children}</FeatureProvider>
      </body>
    </html>
  );
}

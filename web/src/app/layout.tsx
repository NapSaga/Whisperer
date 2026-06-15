import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://whisperer-xi.vercel.app"),
  title: "Whisperer — memory layer for voice agents",
  description:
    "Drop-in memory layer for AI voice agents. Measured recall: 0/10 → 10/10. Built at HackRome.",
  openGraph: {
    type: "website",
    title: "Whisperer — memory layer for voice agents",
    description:
      "Drop-in memory layer for AI voice agents. Measured recall: 0/10 → 10/10. Built at HackRome.",
    url: "https://whisperer-xi.vercel.app",
    siteName: "Whisperer",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Whisperer recall measured: 0/10 to 10/10",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Whisperer — memory layer for voice agents",
    description:
      "Drop-in memory layer for AI voice agents. Measured recall: 0/10 → 10/10. Built at HackRome.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          {children}
          <Toaster richColors theme="light" />
        </TooltipProvider>
      </body>
    </html>
  );
}

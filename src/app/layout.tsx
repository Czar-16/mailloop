import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata: Metadata = {
  metadataBase: new URL("https://mailloop.in"),
  title: {
    default: "Mailloop — Make your next introduction",
    template: "%s | Mailloop",
  },
  description:
    "Personalized job outreach, sent individually from your own Gmail. Prepare your message, attach your resume, and keep every conversation in view.",
  openGraph: {
    title: "Mailloop",
    description: "A thoughtful introduction. A new opportunity.",
    url: "https://mailloop.in",
    siteName: "Mailloop",
    type: "website",
  },
};
export const viewport: Viewport = { themeColor: "#fafafa" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-sm bg-primary px-4 py-3 text-white focus:translate-y-0"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

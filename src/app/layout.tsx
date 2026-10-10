import type { Metadata, Viewport } from "next";
import {
  Plus_Jakarta_Sans,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";
import { themeScript } from "@/lib/theme";
const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  fallback: ["system-ui", "sans-serif"],
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  fallback: ["monospace"],
});
const num = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  fallback: ["system-ui", "sans-serif"],
});
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
export const viewport: Viewport = { themeColor: "#f6f5fb" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      suppressHydrationWarning
      lang="en"
      className={`${sans.variable} ${jetbrains.variable} ${num.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-sm bg-primary px-4 py-3 text-primary-foreground focus:translate-y-0"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/lib/theme";
const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  fallback: ["system-ui", "sans-serif"],
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  fallback: ["monospace"],
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
      className={`${sans.variable} ${jakarta.variable} ${jetbrains.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
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

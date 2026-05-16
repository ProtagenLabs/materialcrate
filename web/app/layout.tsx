import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Libre_Baskerville } from "next/font/google";
import Script from "next/script";
import AuthSplashGate from "./components/AuthSplashGate";
import ConditionalNavbar from "./components/ConditionalNavbar";
import DesktopSidebarOffset from "./components/DesktopSidebarOffset";
import { SystemPopupProvider } from "./components/SystemPopup";
import BrowserNotificationBridge from "./components/BrowserNotificationBridge";
import ScrollRestoration from "./components/ScrollRestoration";
import ThemeSync from "./components/ThemeSync";
import { ServerStatusProvider } from "./lib/server-status";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-libre-baskerville",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Material Crate",
  description: "Home to your studies.",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

const themeInitScript = `
  try {
    var savedTheme = localStorage.getItem("mc-theme") || "light";
    if (savedTheme === "dark" || savedTheme === "sepia") {
      document.documentElement.dataset.theme = savedTheme;
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch (error) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${libreBaskerville.variable} antialiased`}
    >
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans relative">
        <ServerStatusProvider>
        <SystemPopupProvider>
          <Suspense>
            <ScrollRestoration />
          </Suspense>
          <BrowserNotificationBridge />
          <ThemeSync />
          <AuthSplashGate>
            <ConditionalNavbar />
            <DesktopSidebarOffset>{children}</DesktopSidebarOffset>
          </AuthSplashGate>
        </SystemPopupProvider>
        </ServerStatusProvider>
      </body>
    </html>
  );
}

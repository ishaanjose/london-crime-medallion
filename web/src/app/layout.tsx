import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNav from "@/components/AppNav";
import { THEME_INIT_SCRIPT } from "@/lib/themePreference";
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
  title: "London Crime",
  description: "London crime, deprivation and outcomes, built on a medallion pipeline",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the head script may add data-theme before hydration
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before first paint to avoid a flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppNav />
        {children}
      </body>
    </html>
  );
}

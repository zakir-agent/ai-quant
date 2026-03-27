import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { SidebarProvider } from "@/components/SidebarContext";
import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Quant - Blockchain Quantitative Analysis",
  description: "AI-powered blockchain quantitative analysis dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="quantum"
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider>
          <LanguageProvider>
            <SidebarProvider>
              <Sidebar />
              <MainContent>{children}</MainContent>
            </SidebarProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

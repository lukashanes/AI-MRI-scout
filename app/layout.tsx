import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MRI Scout — AI-powered MRI scan analysis",
  description: "Hobby tool for analyzing MRI scans using AI vision models. This is NOT a medical tool.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased" style={{ backgroundColor: "#0A0E1A", color: "#F1F5F9" }}>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Accountant",
  description: "AI Accountant — increase your accounting productivity 10–100×",
  openGraph: {
    title: "AI Accountant",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

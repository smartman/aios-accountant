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
      <body className="bg-slate-50 text-slate-900 transition-colors duration-300 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}

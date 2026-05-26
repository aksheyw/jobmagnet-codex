import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const heading = Inter({ variable: "--font-heading", subsets: ["latin"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "<candidate_name> — <target_company_name>",
  description: "Tailored portfolio for this role.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ruthless Recruiter AI",
  description: "Get an honest, AI-powered critique of your portfolio based on specific job offers.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ruthless Recruiter",
  },
};

export const viewport = {
  themeColor: "#000000",
};

import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-title" content="Ruthless" />
      </head>
      <body className={outfit.className}>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}

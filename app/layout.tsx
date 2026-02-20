import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ResolverProvider } from "./ResolverContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ICPC Scoreboard Resolver",
  description: "Animated scoreboard resolver for ICPC-style programming contests",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <ResolverProvider>{children}</ResolverProvider>
      </body>
    </html>
  );
}

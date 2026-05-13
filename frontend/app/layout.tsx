import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "VerifyTrade · ZK-TLS Trading Competition",
  description: "Prove your Binance Futures PnL with TLSNotary + zkVerify",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

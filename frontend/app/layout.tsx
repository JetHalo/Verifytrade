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
    <html lang="en" className="dark">
      <body>
        <Providers>
          <Header />
          <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
          <footer className="mt-20 border-t border-white/5 py-6 text-center text-xs text-slate-500">
            <span className="font-mono">VerifyTrade</span>
            <span className="mx-2 opacity-50">·</span>
            <span>TLSNotary <span className="opacity-50">×</span> Noir UltraHonk <span className="opacity-50">×</span> zkVerify</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}

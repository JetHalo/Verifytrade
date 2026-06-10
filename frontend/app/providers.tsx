"use client";

/**
 * Providers — formerly wrapped wagmi + RainbowKit + react-query, now a no-op
 * passthrough. Wallet connection was removed when the contract was retired in
 * favor of the Next.js API + zkVerify backend.
 *
 * If you ever want wallets back, restore the WagmiProvider/RainbowKitProvider
 * here and add ConnectButton to components/Header.tsx.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

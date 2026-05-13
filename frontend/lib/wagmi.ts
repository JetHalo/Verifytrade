import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "VerifyTrade",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "PROJECT_ID_PLACEHOLDER",
  chains: [baseSepolia],
  ssr: true,
});

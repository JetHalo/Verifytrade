/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // zkverifyjs uses @polkadot/api + websocket transports server-side; let Node
  // resolve them at runtime instead of webpack trying to bundle them.
  // (Next 14.2.x: this option lives under `experimental`; renamed to top-level in 15.x.)
  experimental: {
    serverComponentsExternalPackages: [
      "zkverifyjs",
      "@polkadot/api",
      "@polkadot/keyring",
      "@polkadot/util",
      "@polkadot/util-crypto",
    ],
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {}, // Silence Turbopack warning
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      fs: false,
      path: false,
      crypto: false,
    };

    // Enable WASM support for fhevmjs (TFHE + KMS)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Exclude fhevmjs from server-side bundling (browser-only WASM)
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("fhevmjs");
    }

    return config;
  },
};

module.exports = nextConfig;

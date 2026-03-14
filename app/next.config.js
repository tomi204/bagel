/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude Node.js packages that are incompatible with Turbopack bundling
  serverExternalPackages: ["pino", "thread-stream", "pino-pretty"],
  // Turbopack: resolve Node.js built-ins to empty modules for client bundle
  turbopack: {
    resolveAlias: {
      fs: "./empty-module.js",
      net: "./empty-module.js",
      tls: "./empty-module.js",
      child_process: "./empty-module.js",
      worker_threads: "./empty-module.js",
    },
  },
  // Configure webpack fallbacks for client-side
  webpack: (config, { isServer }) => {
    // Enable WASM support for fhevmjs (TFHE + KMS)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: require.resolve("./empty-module.js"),
        net: false,
        tls: false,
        path: false,
        crypto: false,
        child_process: false,
        worker_threads: false,
      };
    }

    // Exclude fhevmjs from server-side bundling (browser-only WASM)
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("fhevmjs");
    }

    return config;
  },
};

module.exports = nextConfig;

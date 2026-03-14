import { useEffect, useState } from "react";
import { useWallet } from "../pages/_app";

export default function NetworkWarning() {
  const { chainId, address } = useWallet();

  if (!address) return null;

  // Expected chain IDs: localhost (31337), sepolia (11155111)
  const isSupported = chainId === 31337 || chainId === 11155111;
  const networkName =
    chainId === 31337
      ? "Localhost"
      : chainId === 11155111
        ? "Sepolia"
        : `Chain ${chainId}`;

  if (!isSupported) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">!</div>
            <div>
              <p className="font-bold text-lg">Wrong Network</p>
              <p className="text-sm">
                Connected to <strong>{networkName}</strong>. Please switch to{" "}
                <strong>Sepolia</strong> or <strong>Localhost</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white p-2 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-center space-x-2">
        <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
        <p className="text-sm font-medium">
          Connected to {networkName} (Zama fhEVM)
        </p>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useWallet } from "../pages/_app";

export default function WalletButton() {
  const { address, connect, disconnect, isConnecting } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm">
        Loading...
      </button>
    );
  }

  if (address) {
    return (
      <button
        onClick={disconnect}
        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-mono transition-colors"
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
    >
      {isConnecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}

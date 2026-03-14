import { useEffect, useState, useCallback } from "react";
import { useWallet } from "../pages/_app";
import { getCerc20Contract, CERC20_ADDRESS } from "../lib/contract-client";
import { decryptValue, getFhevmInstance } from "../lib/fhevm";

export default function BalanceDisplay() {
  const { address, signer } = useWallet();
  const [encryptedHandle, setEncryptedHandle] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch encrypted handle on connect
  useEffect(() => {
    if (!address || !signer || !mounted) {
      setEncryptedHandle(null);
      setBalance(null);
      return;
    }

    async function fetchHandle() {
      try {
        setLoading(true);
        const cerc20 = getCerc20Contract(signer!);
        const handle = await cerc20.confidentialBalanceOf(address);
        const handleBigInt = BigInt(handle.toString());

        if (handleBigInt === BigInt(0)) {
          setEncryptedHandle(null);
          setBalance(0);
          return;
        }

        setEncryptedHandle(handleBigInt);

        // Check localStorage cache
        const cacheKey = `bagel_nav_balance_${address}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const { handle: cachedHandle, amount } = JSON.parse(cached);
            if (cachedHandle === handleBigInt.toString()) {
              setBalance(amount);
              return;
            }
          } catch {}
        }
      } catch (err) {
        console.error("Failed to fetch balance handle:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchHandle();
  }, [address, signer, mounted]);

  const handleDecrypt = useCallback(async () => {
    if (!address || !signer || !encryptedHandle) return;

    const fhevmInstance = getFhevmInstance();
    if (!fhevmInstance) {
      console.warn("fhEVM not initialized yet");
      return;
    }

    setDecrypting(true);
    try {
      // Re-fetch handle in case it changed
      const cerc20 = getCerc20Contract(signer);
      const currentHandle = BigInt(
        (await cerc20.confidentialBalanceOf(address)).toString()
      );
      if (currentHandle === BigInt(0)) {
        setBalance(0);
        return;
      }

      setEncryptedHandle(currentHandle);
      const decrypted = await decryptValue(currentHandle, CERC20_ADDRESS, signer);
      const value = Number(decrypted) / 1_000_000;
      setBalance(value);

      // Cache
      localStorage.setItem(
        `bagel_nav_balance_${address}`,
        JSON.stringify({ handle: currentHandle.toString(), amount: value })
      );
    } catch (err) {
      console.error("Decrypt failed:", err);
    } finally {
      setDecrypting(false);
    }
  }, [address, signer, encryptedHandle]);

  if (!mounted || !address) return null;

  // No handle yet (loading or zero balance)
  if (loading) {
    return (
      <div className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-xs font-mono animate-pulse">
        Loading...
      </div>
    );
  }

  // Balance is known (either cached or decrypted)
  if (balance !== null) {
    return (
      <button
        onClick={handleDecrypt}
        disabled={decrypting}
        className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50"
        title="Click to refresh balance"
      >
        <span className="text-yellow-400">$</span>
        <span>
          {balance.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span className="text-gray-400">USDB</span>
        {decrypting && (
          <svg
            className="w-3 h-3 animate-spin text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              className="opacity-25"
            />
            <path
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              fill="currentColor"
              className="opacity-75"
            />
          </svg>
        )}
      </button>
    );
  }

  // Has encrypted handle but not decrypted yet
  if (encryptedHandle) {
    return (
      <button
        onClick={handleDecrypt}
        disabled={decrypting}
        className="px-3 py-1.5 rounded-lg bg-indigo-900/50 hover:bg-indigo-800/50 border border-indigo-700/50 text-indigo-300 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
      >
        {decrypting ? (
          <>
            <svg
              className="w-3 h-3 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-25"
              />
              <path
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                fill="currentColor"
                className="opacity-75"
              />
            </svg>
            Decrypting...
          </>
        ) : (
          <>
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Decrypt Balance
          </>
        )}
      </button>
    );
  }

  // No balance at all
  return (
    <div className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-500 text-xs font-mono">
      0.00 USDB
    </div>
  );
}

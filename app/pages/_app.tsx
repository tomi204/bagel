import type { AppProps } from "next/app";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BrowserProvider, type Signer } from "ethers";
import { initFhevm as initFhevmClient, getFhevmInstance, getInitError } from "../lib/fhevm";
import "../styles/globals.css";

interface WalletContextType {
  provider: BrowserProvider | null;
  signer: Signer | null;
  address: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  fhevmReady: boolean;
  fhevmError: string | null;
}

export const WalletContext = createContext<WalletContextType>({
  provider: null,
  signer: null,
  address: null,
  chainId: null,
  connect: async () => {},
  disconnect: () => {},
  isConnecting: false,
  fhevmReady: false,
  fhevmError: null,
});

export const useWallet = () => useContext(WalletContext);

export default function App({ Component, pageProps }: AppProps) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [fhevmReady, setFhevmReady] = useState(false);
  const [fhevmError, setFhevmError] = useState<string | null>(null);

  // Initialize fhEVM eagerly on mount (SDK is already loaded via _document.tsx)
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;

    // Give the beforeInteractive script a moment to fully execute
    const timer = setTimeout(() => {
      initFhevmClient()
        .then(() => {
          console.log("[App] fhEVM initialized successfully");
          setFhevmReady(true);
          setFhevmError(null);
        })
        .catch((err) => {
          console.error("[App] fhEVM init failed:", err);
          setFhevmError(err?.message || "fhEVM initialization failed");
        });
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const connect = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("Please install MetaMask");
      return;
    }

    setIsConnecting(true);
    try {
      const browserProvider = new BrowserProvider((window as any).ethereum);
      const userSigner = await browserProvider.getSigner();
      const userAddress = await userSigner.getAddress();
      const network = await browserProvider.getNetwork();

      setProvider(browserProvider);
      setSigner(userSigner);
      setAddress(userAddress);
      setChainId(Number(network.chainId));

      // Try to init fhEVM if it hasn't been initialized yet
      if (!getFhevmInstance()) {
        initFhevmClient().then(() => {
          setFhevmReady(true);
          setFhevmError(null);
        }).catch((fhevmErr) => {
          console.error("[fhEVM] Init failed during wallet connect:", fhevmErr);
          setFhevmError(fhevmErr?.message || "fhEVM initialization failed");
        });
      }
    } catch (err) {
      console.error("Connection error:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
  };

  // Auto-connect if previously connected
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      (window as any).ethereum
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            connect();
          }
        });
    }
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;

    const eth = (window as any).ethereum;
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        connect();
      }
    };
    const handleChainChanged = () => connect();

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);
    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
      eth.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const walletValue = useMemo(
    () => ({
      provider,
      signer,
      address,
      chainId,
      connect,
      disconnect,
      isConnecting,
      fhevmReady,
      fhevmError,
    }),
    [provider, signer, address, chainId, isConnecting, fhevmReady, fhevmError]
  );

  return (
    <WalletContext.Provider value={walletValue}>
      <Component {...pageProps} />
    </WalletContext.Provider>
  );
}

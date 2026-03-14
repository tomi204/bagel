import type { AppProps } from "next/app";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BrowserProvider, type Signer } from "ethers";
import { initFhevm as initFhevmClient } from "../lib/fhevm";
import "../styles/globals.css";

interface WalletContextType {
  provider: BrowserProvider | null;
  signer: Signer | null;
  address: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
}

export const WalletContext = createContext<WalletContextType>({
  provider: null,
  signer: null,
  address: null,
  chainId: null,
  connect: async () => {},
  disconnect: () => {},
  isConnecting: false,
});

export const useWallet = () => useContext(WalletContext);

export default function App({ Component, pageProps }: AppProps) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

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

      // Initialize fhEVM (non-blocking — wallet connects even if FHE init fails)
      try {
        await initFhevmClient(browserProvider);
      } catch (fhevmErr) {
        console.warn("fhEVM init failed (FHE operations will be unavailable):", fhevmErr);
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
    }),
    [provider, signer, address, chainId, isConnecting]
  );

  return (
    <WalletContext.Provider value={walletValue}>
      <Component {...pageProps} />
    </WalletContext.Provider>
  );
}

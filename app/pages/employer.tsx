import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useWallet } from "./_app";
import { useBagel } from "../hooks/useBagel";

const WalletButton = dynamic(() => import("../components/WalletButton"), {
  ssr: false,
});

export default function EmployerDashboard() {
  const { address, signer } = useWallet();
  const bagel = useBagel();
  const [employeeAddress, setEmployeeAddress] = useState("");
  const [salaryPerSecond, setSalaryPerSecond] = useState("100");
  const [depositAmount, setDepositAmount] = useState("1000000");
  const [txHash, setTxHash] = useState("");
  const [businessIndex, setBusinessIndex] = useState<number | null>(null);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState("");

  // Load business index
  useEffect(() => {
    if (bagel.connected) {
      bagel
        .getNextBusinessIndex()
        .then((idx) => setBusinessIndex(idx > 0 ? idx - 1 : null))
        .catch(() => setBusinessIndex(null));
    }
  }, [bagel.connected]);

  const handleRegisterBusiness = async () => {
    try {
      const hash = await bagel.registerBusiness();
      setTxHash(hash);
      const idx = await bagel.getNextBusinessIndex();
      setBusinessIndex(idx - 1);
    } catch {}
  };

  const handleAddEmployee = async () => {
    if (businessIndex === null || !employeeAddress) return;
    try {
      const hash = await bagel.addEmployee(
        businessIndex,
        employeeAddress,
        BigInt(salaryPerSecond)
      );
      setTxHash(hash);

      // Set employee address
      const info = await bagel.getBusinessInfo(businessIndex);
      await bagel.setEmployeeAddress(
        businessIndex,
        info.nextEmployeeIndex - 1,
        employeeAddress
      );
    } catch {}
  };

  const handleFaucet = async () => {
    if (!address) return;
    setFaucetLoading(true);
    setFaucetMsg("");
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFaucetMsg(`10,000 USDB minted! TX: ${data.txHash}`);
    } catch (err: any) {
      setFaucetMsg(`Error: ${err.message}`);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (businessIndex === null) return;
    try {
      const hash = await bagel.deposit(
        businessIndex,
        BigInt(depositAmount)
      );
      setTxHash(hash);
    } catch {}
  };

  return (
    <>
      <Head>
        <title>Bagel - Employer Dashboard</title>
      </Head>

      <div className="min-h-screen bg-gray-950 text-white">
        {/* Header */}
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold">
              Bagel
            </Link>
            <span className="text-xs bg-indigo-600/20 text-indigo-400 px-2 py-1 rounded">
              Ethereum + Zama fhEVM
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/employee"
              className="text-sm text-gray-400 hover:text-white"
            >
              Employee View
            </Link>
            <WalletButton />
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-6 space-y-8">
          <h1 className="text-3xl font-bold">Employer Dashboard</h1>

          {!address ? (
            <div className="bg-gray-900 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-4">
                Connect your wallet to manage payroll
              </p>
              <WalletButton />
            </div>
          ) : (
            <>
              {/* Business Registration */}
              <section className="bg-gray-900 rounded-xl p-6 space-y-4">
                <h2 className="text-xl font-semibold">Business</h2>
                {businessIndex !== null ? (
                  <div className="text-green-400">
                    Business registered (Index: {businessIndex})
                  </div>
                ) : (
                  <button
                    onClick={handleRegisterBusiness}
                    disabled={bagel.loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {bagel.loading ? "Registering..." : "Register Business"}
                  </button>
                )}
              </section>

              {/* Faucet */}
              <section className="bg-gray-900 rounded-xl p-6 space-y-4">
                <h2 className="text-xl font-semibold">Faucet</h2>
                <p className="text-sm text-gray-400">
                  Get 10,000 USDB test tokens (1 claim per hour)
                </p>
                <button
                  onClick={handleFaucet}
                  disabled={faucetLoading}
                  className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {faucetLoading ? "Minting..." : "Claim 10,000 USDB"}
                </button>
                {faucetMsg && (
                  <p className={`text-sm ${faucetMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                    {faucetMsg}
                  </p>
                )}
              </section>

              {/* Deposit */}
              {businessIndex !== null && (
                <section className="bg-gray-900 rounded-xl p-6 space-y-4">
                  <h2 className="text-xl font-semibold">Deposit Funds</h2>
                  <p className="text-sm text-gray-400">
                    Amount is encrypted before sending on-chain
                  </p>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Amount (smallest units)"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                    />
                    <button
                      onClick={handleDeposit}
                      disabled={bagel.loading}
                      className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {bagel.loading ? "Depositing..." : "Deposit"}
                    </button>
                  </div>
                </section>
              )}

              {/* Add Employee */}
              {businessIndex !== null && (
                <section className="bg-gray-900 rounded-xl p-6 space-y-4">
                  <h2 className="text-xl font-semibold">Add Employee</h2>
                  <p className="text-sm text-gray-400">
                    Employee ID and salary are encrypted (FHE)
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={employeeAddress}
                      onChange={(e) => setEmployeeAddress(e.target.value)}
                      placeholder="Employee wallet address (0x...)"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                    />
                    <input
                      type="text"
                      value={salaryPerSecond}
                      onChange={(e) => setSalaryPerSecond(e.target.value)}
                      placeholder="Salary per second (smallest units)"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                    />
                    <button
                      onClick={handleAddEmployee}
                      disabled={bagel.loading || !employeeAddress}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {bagel.loading ? "Adding..." : "Add Employee"}
                    </button>
                  </div>
                </section>
              )}

              {/* Status */}
              {bagel.error && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">
                  {bagel.error}
                </div>
              )}

              {txHash && (
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                  <p className="text-green-400 text-sm">
                    TX: <span className="font-mono">{txHash}</span>
                  </p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

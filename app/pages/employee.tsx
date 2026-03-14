import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useWallet } from "./_app";
import { useBagel } from "../hooks/useBagel";

const WalletButton = dynamic(() => import("../components/WalletButton"), {
  ssr: false,
});

export default function EmployeeDashboard() {
  const { address } = useWallet();
  const bagel = useBagel();
  const [businessIndex, setBusinessIndex] = useState("0");
  const [employeeIndex, setEmployeeIndex] = useState("0");
  const [withdrawAmount, setWithdrawAmount] = useState("1000");
  const [txHash, setTxHash] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState<{
    lastAction: number;
    isActive: boolean;
  } | null>(null);

  const handleCheckStatus = async () => {
    try {
      const info = await bagel.getEmployeeInfo(
        Number(businessIndex),
        Number(employeeIndex)
      );
      setEmployeeStatus(info);
    } catch {}
  };

  const handleAccrue = async () => {
    try {
      const hash = await bagel.accrueSalary(
        Number(businessIndex),
        Number(employeeIndex)
      );
      setTxHash(hash);
    } catch {}
  };

  const handleWithdraw = async () => {
    try {
      const hash = await bagel.requestWithdrawal(
        Number(businessIndex),
        Number(employeeIndex),
        BigInt(withdrawAmount)
      );
      setTxHash(hash);
    } catch {}
  };

  return (
    <>
      <Head>
        <title>Bagel - Employee Dashboard</title>
      </Head>

      <div className="min-h-screen bg-gray-950 text-white">
        {/* Header */}
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold">
              Bagel
            </Link>
            <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
              Employee
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/employer"
              className="text-sm text-gray-400 hover:text-white"
            >
              Employer View
            </Link>
            <WalletButton />
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-6 space-y-8">
          <h1 className="text-3xl font-bold">Employee Dashboard</h1>

          {!address ? (
            <div className="bg-gray-900 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-4">
                Connect your wallet to view your payroll
              </p>
              <WalletButton />
            </div>
          ) : (
            <>
              {/* Payroll Lookup */}
              <section className="bg-gray-900 rounded-xl p-6 space-y-4">
                <h2 className="text-xl font-semibold">Your Payroll</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400">
                      Business Index
                    </label>
                    <input
                      type="text"
                      value={businessIndex}
                      onChange={(e) => setBusinessIndex(e.target.value)}
                      className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">
                      Employee Index
                    </label>
                    <input
                      type="text"
                      value={employeeIndex}
                      onChange={(e) => setEmployeeIndex(e.target.value)}
                      className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCheckStatus}
                  disabled={bagel.loading}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-50 transition-colors"
                >
                  Check Status
                </button>

                {employeeStatus && (
                  <div className="bg-gray-800 rounded-lg p-4 space-y-2">
                    <p>
                      Status:{" "}
                      <span
                        className={
                          employeeStatus.isActive
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {employeeStatus.isActive ? "Active" : "Inactive"}
                      </span>
                    </p>
                    <p className="text-sm text-gray-400">
                      Last Action:{" "}
                      {new Date(
                        employeeStatus.lastAction * 1000
                      ).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Salary: ENCRYPTED (FHE) | Accrued: ENCRYPTED (FHE)
                    </p>
                  </div>
                )}
              </section>

              {/* Accrue Salary */}
              <section className="bg-gray-900 rounded-xl p-6 space-y-4">
                <h2 className="text-xl font-semibold">Accrue Salary</h2>
                <p className="text-sm text-gray-400">
                  Trigger salary accrual (encrypted_salary x elapsed_time)
                </p>
                <button
                  onClick={handleAccrue}
                  disabled={bagel.loading}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {bagel.loading ? "Accruing..." : "Accrue Salary"}
                </button>
              </section>

              {/* Withdraw */}
              <section className="bg-gray-900 rounded-xl p-6 space-y-4">
                <h2 className="text-xl font-semibold">Withdraw</h2>
                <p className="text-sm text-gray-400">
                  Withdrawal amount is encrypted before submission
                </p>
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Amount (smallest units)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={bagel.loading}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {bagel.loading ? "Withdrawing..." : "Withdraw"}
                  </button>
                </div>
              </section>

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

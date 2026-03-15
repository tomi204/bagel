import Head from 'next/head';
import Link from 'next/link';

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms & Conditions - Bagel</title>
        <meta name="description" content="Terms and conditions for using Bagel Privacy Payroll" />
      </Head>

      <div className="min-h-screen bg-[#F7F7F2]">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-4xl">🥯</span>
              <h1 className="text-2xl font-bold text-[#2D2D2A]">Bagel</h1>
            </Link>
            <Link href="/dashboard" className="text-sm text-bagel-orange hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-3xl font-bold text-[#2D2D2A] mb-8">Terms & Conditions</h2>

          <div className="bg-white rounded p-8 space-y-6 text-gray-700">
            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">1. Acceptance of Terms</h3>
              <p className="text-sm leading-relaxed">
                By accessing and using Bagel Privacy Payroll (&quot;Service&quot;), you agree to be bound by these Terms & Conditions.
                If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">2. Service Description</h3>
              <p className="text-sm leading-relaxed">
                Bagel is a privacy-focused payroll platform built on Ethereum that enables confidential token transfers
                using Fully Homomorphic Encryption (FHE) via Zama fhEVM. The Service allows employers to deposit funds
                and pay employees with encrypted amounts that remain private on-chain.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">3. Eligibility</h3>
              <p className="text-sm leading-relaxed">
                You must be at least 18 years old and have the legal capacity to enter into a binding agreement
                to use this Service. By using Bagel, you represent that you meet these requirements.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">4. Wallet Responsibility</h3>
              <p className="text-sm leading-relaxed">
                You are solely responsible for maintaining the security of your cryptocurrency wallet and private keys.
                Bagel does not have access to your private keys and cannot recover lost funds.
                All transactions on the blockchain are irreversible.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">5. Privacy & Encryption</h3>
              <p className="text-sm leading-relaxed">
                Bagel uses FHE technology provided by Zama to encrypt transaction amounts on-chain.
                While we strive to maintain the highest level of privacy, we make no guarantees about the
                absolute security of any cryptographic system. Users should understand the risks associated
                with blockchain technology.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">6. Testnet Notice</h3>
              <p className="text-sm leading-relaxed">
                This Service currently operates on Ethereum Sepolia testnet for demonstration purposes.
                Tokens used on testnet have no real monetary value. Do not send real assets to testnet addresses.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">7. Privacy Pool</h3>
              <p className="text-sm leading-relaxed">
                Transfers via the BagelPool privacy pool are processed by a TEE operator that distributes
                funds after a delay. While this breaks the on-chain sender-recipient link, the TEE operator
                knows the mapping. In production, the operator runs inside a Trusted Execution Environment.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">8. Limitation of Liability</h3>
              <p className="text-sm leading-relaxed">
                Bagel is provided &quot;as is&quot; without warranties of any kind. We are not liable for any losses,
                damages, or claims arising from your use of the Service, including but not limited to
                loss of funds, smart contract bugs, or blockchain network issues.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">9. Changes to Terms</h3>
              <p className="text-sm leading-relaxed">
                We reserve the right to modify these terms at any time. Continued use of the Service
                after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-[#2D2D2A] mb-3">10. Contact</h3>
              <p className="text-sm leading-relaxed">
                For questions about these terms, please reach out via our GitHub repository.
              </p>
            </section>

            <div className="pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Last updated: March 2026
              </p>
            </div>
          </div>
        </main>

        <footer className="mt-16 py-8 border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600">
            <p className="text-xs">
              Bagel Privacy Payroll - Built on Ethereum with Zama fhEVM
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

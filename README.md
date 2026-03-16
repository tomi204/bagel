<p align="center">
  <h1 align="center">Bagel</h1>
  <p align="center"><strong>Private Global Payroll on Ethereum</strong></p>
  <p align="center">
    Bringing the $80B global payroll market on-chain with end-to-end privacy<br/>
    using <strong>Zama fhEVM</strong> and a <strong>privacy pool</strong> for unlinkable transfers.
  </p>
</p>

<p align="center">
  <a href="https://soliditylang.org/"><img src="https://img.shields.io/badge/Solidity-0.8.27-363636?logo=solidity&logoColor=white" alt="Solidity"/></a>
  <a href="https://www.zama.ai/"><img src="https://img.shields.io/badge/Zama-fhEVM-7C3AED?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiPjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcng9IjQiIGZpbGw9IiM3QzNBRUQiLz48L3N2Zz4=" alt="Zama fhEVM"/></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white" alt="Next.js"/></a>
  <a href="https://hardhat.org/"><img src="https://img.shields.io/badge/Hardhat-2.27-FFF100?logo=hardhat&logoColor=black" alt="Hardhat"/></a>
  <a href="https://ethereum.org/"><img src="https://img.shields.io/badge/Ethereum-Sepolia-3C3C3D?logo=ethereum&logoColor=white" alt="Ethereum"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"/></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#privacy-pool">Privacy Pool</a> &bull;
  <a href="#contracts">Contracts</a> &bull;
  <a href="#demo">Demo</a>
</p>

---

## Why Bagel?

### The Problem

Payroll on public blockchains is a **non-starter for enterprises**. Every salary, bonus, and payment is visible to anyone with a block explorer. Employees can see each other's compensation. Competitors can reverse-engineer your cost structure. This fundamentally breaks the confidentiality that businesses require.

### Our Solution

Bagel makes payroll **fully private on-chain** through three layers of protection:

| Layer | What It Protects | How |
|-------|-----------------|-----|
| **FHE Encryption** | All financial data (salaries, balances, amounts) | Zama fhEVM — computations run on encrypted data without ever decrypting |
| **ERC7984 Confidential Tokens** | Token balances and transfer amounts | USDBagel (CERC20) — balances are encrypted `euint64` handles |
| **BagelPool Privacy Pool** | Sender ↔ recipient relationship | Encrypted recipient address (`eaddress`) + TEE-based distribution |

**Result**: An observer sees encrypted ciphertext on-chain. No plaintext salaries. No visible payment graph. No linkable transfers.

---

## Architecture

```
                           ┌─────────────────────────┐
                           │     Frontend (Next.js)   │
                           │                         │
                           │  Dashboard  Employees   │
                           │  History    Reports     │
                           │  Wallets    Privacy     │
                           └────────┬────────────────┘
                                    │
                           ┌────────▼────────────────┐
                           │   Zama Relayer SDK       │
                           │                         │
                           │  encrypt()  decrypt()   │
                           │  createEncryptedInput() │
                           │  userDecrypt()          │
                           └────────┬────────────────┘
                                    │
              ┌─────────────────────▼─────────────────────┐
              │            Ethereum (Sepolia)              │
              │                                           │
              │  ┌───────────────┐    ┌────────────────┐  │
              │  │ BagelPayroll  │    │     CERC20     │  │
              │  │               │    │   (ERC7984)    │  │
              │  │ registerBiz() │◄──►│                │  │
              │  │ deposit()     │    │ encBalances    │  │
              │  │ addEmployee() │    │ confTransfer() │  │
              │  │ accrue()      │    │ confTransferF()│  │
              │  │ withdraw()    │    │ setOperator()  │  │
              │  └───────────────┘    └───────┬────────┘  │
              │                               │           │
              │                    ┌──────────▼────────┐  │
              │                    │    BagelPool      │  │
              │                    │  (Privacy Pool)   │  │
              │                    │                   │  │
              │                    │ queueTransfer()   │  │
              │                    │  └─ eaddress      │  │
              │                    │  └─ euint64       │  │
              │                    │                   │  │
              │                    │ distribute()      │  │
              │                    │  └─ TEE only      │  │
              │                    └───────────────────┘  │
              └───────────────────────────────────────────┘
                                    │
                           ┌────────▼────────────────┐
                           │     TEE Operator         │
                           │                         │
                           │  Decrypt eaddress       │
                           │  Wait minDelay          │
                           │  Batch distribute       │
                           └─────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Smart Contracts** | Solidity 0.8.27 + [`@fhevm/solidity`](https://docs.zama.ai/fhevm) | Encrypted payroll logic with FHE operations |
| **Confidential Token** | [ERC7984](https://eips.ethereum.org/EIPS/eip-7984) via OpenZeppelin Confidential | Encrypted ERC20 balances and transfers |
| **Privacy Pool** | `BagelPool.sol` | Breaks sender-recipient link using `eaddress` + TEE |
| **FHE Client** | [Zama Relayer SDK](https://www.npmjs.com/package/@zama-fhe/relayer-sdk) v0.4.1 | Client-side encryption, decryption, key management |
| **Frontend** | Next.js 15 + React 18 + TypeScript | 8 pages: Dashboard, Employees, History, Reports, Wallets, Privacy Audit |
| **Wallet** | MetaMask + ethers.js v6 | EIP-1193 provider, EIP-712 signing for FHE decryption |
| **Compliance** | [Range Protocol](https://range.org/) API | OFAC sanctions screening, wallet risk scoring |
| **Build** | Hardhat + [`@fhevm/hardhat-plugin`](https://www.npmjs.com/package/@fhevm/hardhat-plugin) | Compile, test, deploy with FHE support |

---

## Privacy Guarantees

Every piece of financial data in Bagel is encrypted using Zama's FHE. Here's what an observer sees vs. what actually exists:

| Data | What An Observer Sees | What Actually Exists |
|------|----------------------|---------------------|
| Salary Rate | `0x7f3a...8b2c` (ciphertext) | `100` USDB/second |
| Employee Balance | `0x4e91...c7d0` (ciphertext) | `50,000.00` USDB |
| Business Vault | `0xa2b3...f4e5` (ciphertext) | `1,000,000.00` USDB |
| Transfer Amount | `0x8c1d...9e0f` (ciphertext) | `5,000.00` USDB |
| Employer Identity | `0x6d2e...a1b3` (ciphertext) | `0x026b...36Cd` |
| Employee Identity | `0x3f4a...b5c6` (ciphertext) | `0x1a2b...3c4d` |
| Who Paid Whom | Sender → Pool, Pool → Recipient | Sender paid Recipient |

### FHE Operations

```solidity
// All operations happen on encrypted data — no decryption needed
FHE.fromExternal(input, proof)     // Ingest encrypted client input with ZK proof
FHE.add(euint64, euint64)          // Encrypted addition (deposits, accrual)
FHE.sub(euint64, euint64)          // Encrypted subtraction (withdrawals)
FHE.mul(euint64, uint64)           // Encrypted × plaintext (salary × elapsed time)
FHE.allow(handle, address)         // Grant cross-contract ciphertext access
FHE.allowThis(handle)              // Grant self-access to ciphertext
```

---

## Privacy Pool

### The Gap in Confidential Transfers

Standard ERC7984 `confidentialTransfer` encrypts the **amount** but the sender → recipient link remains visible:

```
0x026b...36Cd  ──(encrypted amount)──►  0x1a2b...3c4d
     ▲                                       ▲
  Employer                               Employee
  (public)                               (public)
```

Anyone can see who pays whom, even if they can't see how much.

### How BagelPool Fixes This

```
Step 1: Employer queues transfer with encrypted recipient
┌──────────────┐     queueTransfer()     ┌─────────────┐
│   Employer   │ ──────────────────────► │  BagelPool  │
│ 0x026b..36Cd │   eaddress + euint64    │             │
└──────────────┘   (both encrypted)      └──────┬──────┘
                                                │
Step 2: TEE operator decrypts and distributes   │ (after minDelay)
                                                │
                   distribute()          ┌──────▼──────┐
┌──────────────┐ ◄────────────────────── │  BagelPool  │
│   Employee   │    encrypted amount     │             │
│ 0x1a2b..3c4d │                         └─────────────┘
└──────────────┘

On-chain record:
  TX1: 0x026b..36Cd → BagelPool  (encrypted amount, encrypted recipient)
  TX2: BagelPool → 0x1a2b..3c4d  (encrypted amount)

  No direct link between TX1 and TX2.
```

### Privacy Pool Features

| Feature | Details |
|---------|---------|
| **Encrypted Recipient** | `eaddress` type — recipient address encrypted with FHE on-chain |
| **Encrypted Amount** | `euint64` — transfer amount encrypted end-to-end |
| **Minimum Delay** | Configurable time gap between queue and distribute (default: 5 min) |
| **Batch Distribution** | TEE can distribute multiple transfers in one tx for better anonymity |
| **Operator Authorization** | Only the TEE wallet can call `distribute()` |
| **Cross-Contract FHE** | `FHE.allow(amount, address(token))` enables CERC20 to access pool ciphertexts |

---

## Contracts

### Deployed on Sepolia

| Contract | Address | Etherscan |
|----------|---------|-----------|
| **CERC20** (USDBagel) | `0xb01DDDa550C5aA2624d1D0aF0D4A6826350C49F2` | [View](https://sepolia.etherscan.io/address/0xb01DDDa550C5aA2624d1D0aF0D4A6826350C49F2) |
| **BagelPayroll** | `0x6bEE22620286aE720416348636250df26CF91CA3` | [View](https://sepolia.etherscan.io/address/0x6bEE22620286aE720416348636250df26CF91CA3) |
| **BagelPool** | `0x9afFE57d5751d11929dA1cC6a4ff1cE70DF92E50` | [View](https://sepolia.etherscan.io/address/0x9afFE57d5751d11929dA1cC6a4ff1cE70DF92E50) |

### Contract Details

#### `BagelPayroll.sol`
The core payroll contract. All salary data is encrypted with FHE.

- `registerBusiness(encEmployerId, proof)` — Register with encrypted employer ID
- `deposit(businessIndex, encAmount, proof)` — Deposit encrypted amount to business vault
- `addEmployee(businessIndex, encId, encSalary, proof)` — Add employee with encrypted salary
- `accrueSalary(businessIndex, employeeIndex)` — Homomorphic: `encSalary × elapsedTime`
- `requestWithdrawal(businessIndex, employeeIndex, encAmount, proof)` — Withdraw accrued salary

#### `CERC20.sol` (USDBagel)
ERC7984 confidential token. 6 decimals. All balances are `euint64`.

- `confidentialTransfer(to, encAmount, proof)` — Transfer with encrypted amount
- `confidentialTransferFrom(from, to, amount)` — Operator-authorized transfer (used by BagelPool)
- `confidentialBalanceOf(account)` — Returns encrypted balance handle
- `setOperator(operator, until)` — Time-bounded operator approval
- `mint(to, amount)` — Owner-only minting (used by faucet)

#### `BagelPool.sol`
Privacy pool that breaks the sender-recipient link.

- `queueTransfer(encRecipient, encAmount, proof)` — Queue transfer with encrypted recipient (`eaddress`)
- `distribute(index, recipient)` — TEE-only: distribute to decrypted recipient
- `batchDistribute(indices, recipients)` — TEE-only: batch distribution
- `setOperator(operator)` — Update TEE operator address
- `setMinDelay(delay)` — Update minimum queue-to-distribute delay

---

## Payroll Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EMPLOYER FLOW                                │
│                                                                     │
│  1. Register Business                                               │
│     └─ encEmployerId = encrypt(hash(walletAddress))                │
│     └─ On-chain: only ciphertext stored                            │
│                                                                     │
│  2. Mint Test Tokens (Faucet)                                       │
│     └─ POST /api/faucet { address }                                │
│     └─ Mints 10,000 USDBagel to wallet                             │
│                                                                     │
│  3. Deposit Funds                                                   │
│     └─ encrypt(amount) → BagelPayroll.deposit()                    │
│     └─ Business vault: FHE.add(currentBalance, encAmount)          │
│                                                                     │
│  4. Add Employee                                                    │
│     └─ encrypt(employeeId, salaryPerSecond)                        │
│     └─ BagelPayroll.addEmployee() + setEmployeeAddress()           │
│                                                                     │
│  5. Pay Employee (via Privacy Pool)                                 │
│     └─ encrypt(recipientAddress, amount)                           │
│     └─ BagelPool.queueTransfer() — breaks sender-recipient link   │
│     └─ TEE distributes after minDelay                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        EMPLOYEE FLOW                                │
│                                                                     │
│  1. View Encrypted Balance                                          │
│     └─ CERC20.confidentialBalanceOf() → encrypted handle           │
│                                                                     │
│  2. Decrypt Balance (EIP-712 Signature)                             │
│     └─ Sign decryption request → Zama Relayer → plaintext value    │
│                                                                     │
│  3. Accrue Salary                                                   │
│     └─ BagelPayroll.accrueSalary()                                 │
│     └─ FHE.mul(encSalary, elapsedSeconds) — homomorphic            │
│                                                                     │
│  4. Withdraw                                                        │
│     └─ encrypt(amount) → BagelPayroll.requestWithdrawal()          │
│     └─ FHE.sub(encAccrued, encAmount)                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Frontend

### Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with animated hero, feature highlights, and CTA |
| `/dashboard` | Main dashboard — employer payroll management and employee portal |
| `/employees` | Employee management — add, edit, remove with on-chain registration |
| `/history` | Transaction history — fetches from Etherscan Sepolia API with filtering |
| `/reports` | Analytics — payroll stats, transaction trends, Range compliance checks |
| `/wallets` | Wallet details — ETH balance, encrypted USDB balance, contract addresses |
| `/privacy-audit` | Privacy demo — shows encrypted vs. decrypted data for judges |
| `/terms` | Terms and conditions |

### API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/faucet` | POST | Mint 10,000 USDBagel test tokens (rate limited: 1/hour) |
| `/api/distribute` | POST `{action: "register"}` | Register recipient for pool queue index |
| `/api/distribute` | POST `{action: "distribute"}` | Trigger TEE distribution of pending transfers |
| `/api/distribute` | GET | Pool status (queue length, pending, distributed) |

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **MetaMask** browser extension (connected to Sepolia)
- **Sepolia ETH** for gas — [Sepolia Faucet](https://sepoliafaucet.com/)

### Run Locally

```bash
# Clone
git clone https://github.com/tomi204/bagel.git
cd bagel

# Install contract dependencies
npm install

# Install frontend dependencies
cd app && npm install

# Start dev server (uses deployed Sepolia contracts)
npm run dev
# → http://localhost:3000
```

### Deploy Your Own Contracts

```bash
# Configure Hardhat
npx hardhat vars set MNEMONIC "your twelve word mnemonic here"
npx hardhat vars set INFURA_API_KEY "your-infura-project-id"

# Deploy all contracts (CERC20 → BagelPayroll → BagelPool)
npx hardhat deploy --network sepolia

# Copy printed addresses to app/.env.local
```

### Environment Variables

Create `app/.env.local`:

```env
# RPC
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/<your-key>
NEXT_PUBLIC_CHAIN_ID=11155111

# Contracts (from deployment output)
NEXT_PUBLIC_PAYROLL_ADDRESS=0x...
NEXT_PUBLIC_CERC20_ADDRESS=0x...
NEXT_PUBLIC_POOL_ADDRESS=0x...

# Server-side only (faucet + TEE distributor)
DEPLOYER_PRIVATE_KEY=0x...
```

---

## Project Structure

```
bagel/
├── contracts/
│   ├── BagelPayroll.sol                 # Payroll contract — all fields FHE-encrypted
│   ├── BagelPool.sol                    # Privacy pool — eaddress + euint64 queue
│   └── tokens/
│       └── CERC20.sol                   # ERC7984 confidential token (USDBagel, 6 decimals)
│
├── deploy/
│   └── deploy.ts                        # Deploy script: CERC20 → BagelPayroll → BagelPool
│
├── deployments/sepolia/                 # Deployment artifacts (addresses, ABIs)
│
├── app/                                 # Next.js frontend
│   ├── pages/
│   │   ├── index.tsx                    # Landing page with animated hero
│   │   ├── dashboard.tsx                # Main dashboard (employer + employee views)
│   │   ├── employees.tsx                # Employee CRUD + on-chain registration
│   │   ├── history.tsx                  # Transaction history (Etherscan API)
│   │   ├── reports.tsx                  # Analytics + Range compliance
│   │   ├── wallets.tsx                  # Wallet info, balances, FHE status
│   │   ├── privacy-audit.tsx            # Privacy stack demo
│   │   ├── employer.tsx                 # Simple employer view
│   │   ├── employee.tsx                 # Simple employee view
│   │   ├── terms.tsx                    # Terms & conditions
│   │   └── send.tsx                     # Redirect → dashboard?transfer=true
│   │
│   ├── pages/api/
│   │   ├── faucet.ts                    # Mint 10K USDBagel (rate limited)
│   │   └── distribute.ts               # TEE distributor (register + distribute)
│   │
│   ├── lib/
│   │   ├── fhevm.ts                     # Zama Relayer SDK wrapper
│   │   │                                #   initFhevm(), encryptValue(),
│   │   │                                #   encryptAddressAndValue(), decryptValue()
│   │   ├── contract-client.ts           # Contract interaction layer
│   │   │                                #   registerBusiness(), deposit(), addEmployee(),
│   │   │                                #   privateTransfer(), getPoolStatus()
│   │   ├── range.ts                     # Range Protocol compliance client
│   │   │                                #   getRiskScore(), checkSanctions(),
│   │   │                                #   fullComplianceCheck()
│   │   └── format.ts                    # formatBalance() utility
│   │
│   ├── hooks/
│   │   ├── useBagel.ts                  # React hook for all payroll operations
│   │   └── useTransactions.ts           # Transaction history from Etherscan API
│   │
│   ├── components/
│   │   ├── WalletButton.tsx             # MetaMask connect/disconnect
│   │   ├── BalanceDisplay.tsx           # Navbar encrypted balance + decrypt
│   │   ├── NetworkWarning.tsx           # Wrong chain warning banner
│   │   └── ui/
│   │       ├── scroll-morph-hero.tsx    # Animated landing hero with 3D coin flip
│   │       ├── holo-pulse-loader.tsx    # Loading animation
│   │       ├── payroll-chart.tsx        # Payroll bar chart
│   │       ├── crypto-distribution-chart.tsx  # Token distribution pie chart
│   │       ├── card.tsx                 # Reusable card component
│   │       └── toaster.tsx              # Toast notifications
│   │
│   ├── styles/globals.css               # Tailwind + Bagel theme (orange, cream, dark)
│   ├── public/
│   │   ├── eth-logo.png                 # ETH coin logo (local)
│   │   └── usdb-logo.png               # USDB coin logo (local)
│   └── next.config.js                   # Webpack/Turbopack config with FHE WASM support
│
├── hardhat.config.ts                    # Hardhat config (Sepolia, compiler settings)
├── package.json
└── LICENSE
```

---

## Compliance

Bagel integrates [Range Protocol](https://range.org/) for regulatory compliance:

| Check | Endpoint | Description |
|-------|----------|-------------|
| **Risk Score** | `GET /v1/risk/address?address={addr}&network=ethereum` | 1-10 risk assessment with reasoning |
| **OFAC Sanctions** | `GET /v1/risk/sanctions/{addr}` | Check if address is on OFAC sanctions list |
| **Token Blacklist** | Same endpoint | Check if address is on any token blacklist |

The Reports page displays:
- Overall wallet risk score with pass/fail status
- Per-employee compliance screening
- OFAC and blacklist status for all registered wallets

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| **TEE trust** | BagelPool TEE operator knows the sender-recipient mapping. In production, runs inside AWS Nitro Enclaves / Intel SGX with sealed keys. |
| **Low anonymity set** | If only 1 transfer is in the pool queue, the link is trivially guessable. Batch distribution and minimum delay mitigate this. |
| **FHE key management** | Decryption requires wallet signature (EIP-712). Only the handle owner can authorize decryption via the Zama Relayer. |
| **Contract upgradability** | Contracts are not upgradeable. Deployed and immutable. |
| **Faucet abuse** | Rate limited to 1 claim per address per hour. Server-side private key used for minting. |

---

## Team

Built by [ConejoCapital](https://github.com/ConejoCapital) | [tomi204](https://github.com/tomi204)

---

## License

[MIT](LICENSE)

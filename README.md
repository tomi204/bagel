# Bagel — Private Global Payroll on Ethereum

> Bringing the $80B global payroll market on-chain with end-to-end privacy using **Zama fhEVM** and a **privacy pool** for unlinkable transfers.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.27-363636?logo=solidity)](https://soliditylang.org/)
[![Zama fhEVM](https://img.shields.io/badge/Zama-fhEVM-7C3AED)](https://www.zama.ai/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000?logo=next.js)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## The Problem

Payroll on public blockchains exposes **every salary, bonus, and payment** to anyone with a block explorer. Employees, competitors, and adversaries can see exactly who earns what. This is a dealbreaker for enterprise adoption.

## The Solution

Bagel encrypts **all financial data** on-chain using Fully Homomorphic Encryption (FHE). Salary rates, balances, and transfer amounts remain encrypted at all times — even validators cannot see plaintext values. Computations (accrual, payments) run directly on ciphertext via Zama's fhEVM coprocessor.

Additionally, Bagel introduces a **privacy pool** (`BagelPool`) that breaks the on-chain sender → recipient link, making payroll transfers unlinkable.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                    │
│  Dashboard · Employees · History · Reports · Wallets     │
├──────────────────────────────────────────────────────────┤
│              Zama Relayer SDK (FHE Client)                │
│         encrypt() · decrypt() · createInstance()         │
├──────────────────────────────────────────────────────────┤
│                  Ethereum (Sepolia)                       │
│                                                          │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ BagelPayroll │  │  CERC20  │  │    BagelPool     │   │
│  │              │  │ (ERC7984)│  │  (Privacy Pool)  │   │
│  │ register()   │  │          │  │                  │   │
│  │ deposit()    │  │ balances │  │ queueTransfer()  │   │
│  │ addEmployee()│  │ transfer │  │ distribute()     │   │
│  │ accrue()     │  │          │  │                  │   │
│  │ withdraw()   │  │ all FHE  │  │ eaddress+euint64 │   │
│  └──────────────┘  └──────────┘  └──────────────────┘   │
│         ▲                              │                 │
│         │              TEE Operator    ▼                 │
│         │            (decrypt & distribute)              │
└──────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Smart Contracts | Solidity + `@fhevm/solidity` | Encrypted payroll logic |
| Confidential Token | ERC7984 (`CERC20.sol`) | Encrypted balances & transfers |
| Privacy Pool | `BagelPool.sol` | Breaks sender-recipient link on-chain |
| FHE Client | Zama Relayer SDK + `ethers.js` | Client-side encrypt/decrypt |
| Frontend | Next.js 15 + TypeScript | Full-featured employer/employee UI |
| Compliance | Range Protocol API | Wallet screening & risk scoring |
| Framework | Hardhat + `@fhevm/hardhat-plugin` | Build, test, deploy |

---

## Privacy Guarantees

| Data | On-Chain Visibility | Method |
|------|-------------------|--------|
| Salary Rate | **Encrypted** | `euint64` via `FHE.fromExternal()` |
| Accrued Balance | **Encrypted** | Homomorphic `FHE.mul(salary, time)` |
| Business Balance | **Encrypted** | Homomorphic `FHE.add()` / `FHE.sub()` |
| Transfer Amounts | **Encrypted** | ERC7984 confidential transfers |
| Employer/Employee IDs | **Encrypted** | `euint64` hash |
| Sender → Recipient Link | **Broken** | BagelPool privacy pool + TEE distribution |
| Recipient Address | **Encrypted** | `eaddress` stored on-chain in pool queue |

---

## Privacy Pool (BagelPool)

Standard confidential transfers encrypt the **amount** but the sender-recipient link remains visible on-chain. BagelPool solves this:

```
1. Sender → BagelPool.queueTransfer(encRecipient, encAmount)
   On-chain: sender → pool (encrypted amount, encrypted recipient)

2. TEE Operator decrypts recipient, waits minDelay, calls distribute()
   On-chain: pool → recipient (encrypted amount)

Result: No direct on-chain link between sender and recipient.
```

- **`eaddress`**: Recipient address encrypted with FHE on-chain
- **`minDelay`**: Configurable delay between queue and distribute (default: 5 min)
- **`batchDistribute`**: TEE can batch multiple transfers for better anonymity
- **TEE Operator**: Runs inside a Trusted Execution Environment (the only entity that knows the mapping)

---

## Contracts

### Deployed on Sepolia

| Contract | Address | Purpose |
|----------|---------|---------|
| `CERC20` (USDBagel) | `0xb01DDDa550C5aA2624d1D0aF0D4A6826350C49F2` | Confidential ERC20 token |
| `BagelPayroll` | `0x6bEE22620286aE720416348636250df26CF91CA3` | Payroll management |
| `BagelPool` | `0x9afFE57d5751d11929dA1cC6a4ff1cE70DF92E50` | Privacy pool |

### FHE Operations Used

```solidity
FHE.fromExternal(input, proof)     // Validate encrypted client inputs
FHE.add(euint64, euint64)          // Homomorphic addition (deposits, accrual)
FHE.sub(euint64, euint64)          // Homomorphic subtraction (withdrawals)
FHE.mul(euint64, uint64)           // Ciphertext × plaintext (salary × time)
FHE.allow(handle, address)         // Grant contract access to ciphertext
FHE.allowThis(handle)              // Grant self access
```

---

## Project Structure

```
Bagel-EVM/
├── contracts/
│   ├── BagelPayroll.sol              # Payroll contract (all fields FHE-encrypted)
│   ├── BagelPool.sol                 # Privacy pool (eaddress + euint64 queue)
│   └── tokens/
│       └── CERC20.sol                # ERC7984 confidential token (USDBagel)
├── deploy/
│   └── deploy.ts                     # Deployment script (CERC20 → Payroll → Pool)
├── app/                              # Next.js frontend
│   ├── pages/
│   │   ├── dashboard.tsx             # Main dashboard (employer/employee views)
│   │   ├── employees.tsx             # Employee management & on-chain registration
│   │   ├── history.tsx               # Transaction history (Etherscan integration)
│   │   ├── reports.tsx               # Analytics & Range compliance checks
│   │   ├── wallets.tsx               # Wallet details, balances, FHE status
│   │   ├── privacy-audit.tsx         # Privacy stack demo for judges
│   │   └── terms.tsx                 # Terms & conditions
│   ├── pages/api/
│   │   ├── faucet.ts                 # Testnet token faucet
│   │   └── distribute.ts            # TEE distributor endpoint (pool → recipients)
│   ├── lib/
│   │   ├── fhevm.ts                  # Zama Relayer SDK wrapper (encrypt/decrypt)
│   │   ├── contract-client.ts        # Contract interactions + privateTransfer()
│   │   ├── range.ts                  # Range Protocol compliance client
│   │   └── format.ts                 # Number formatting utilities
│   ├── hooks/
│   │   ├── useBagel.ts               # React hook for payroll operations
│   │   └── useTransactions.ts        # Transaction history hook (Etherscan API)
│   └── components/
│       ├── WalletButton.tsx          # MetaMask connect/disconnect
│       ├── BalanceDisplay.tsx        # Encrypted balance with decrypt
│       └── ui/                       # Charts, loaders, hero animation
├── hardhat.config.ts
└── package.json
```

---

## Quick Start

### Prerequisites

- Node.js >= 20
- MetaMask (connected to Sepolia)
- Sepolia ETH for gas ([faucet](https://sepoliafaucet.com/))

### Install & Run

```bash
# Install contract dependencies
npm install

# Install frontend dependencies
cd app && npm install

# Start frontend (connects to deployed Sepolia contracts)
npm run dev
```

### Deploy Your Own Contracts

```bash
# Set Hardhat vars
npx hardhat vars set MNEMONIC "your twelve word mnemonic phrase here"
npx hardhat vars set INFURA_API_KEY "your-infura-key"

# Deploy to Sepolia
npx hardhat deploy --network sepolia

# Update app/.env.local with new contract addresses
```

### Environment Variables

```env
# app/.env.local
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/<key>
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_PAYROLL_ADDRESS=0x...
NEXT_PUBLIC_CERC20_ADDRESS=0x...
NEXT_PUBLIC_POOL_ADDRESS=0x...
DEPLOYER_PRIVATE_KEY=0x...  # Server-side only (faucet + distributor)
```

---

## Payroll Flow

```
1. Employer registers business
   └─ encryptedEmployerId = FHE.fromExternal(hash(address))

2. Employer deposits funds
   └─ encryptedBalance += FHE.add(currentBalance, encryptedAmount)

3. Employer adds employee with encrypted salary
   └─ encryptedSalary = FHE.fromExternal(salaryPerSecond)

4. Salary accrues over time (homomorphic computation)
   └─ encryptedAccrued += FHE.mul(encryptedSalary, elapsedSeconds)

5. Employee withdraws via privacy pool
   └─ sender → BagelPool → TEE → recipient (unlinkable)
```

---

## Compliance

Bagel integrates [Range Protocol](https://range.org/) for wallet screening:

- **Risk Score API**: 1-10 risk assessment per wallet
- **Sanctions Check**: OFAC + token blacklist screening
- **Per-Employee Compliance**: Screen employee wallets before onboarding

Results are displayed in the Reports dashboard with pass/fail indicators.

---

## Team

Built by [ConejoCapital](https://github.com/ConejoCapital) | [tomi204](https://github.com/tomi204)

---

## License

MIT

# Bagel - Private Global Payroll on Ethereum

**Bringing the $80 billion global payroll market on-chain with end-to-end privacy using Zama fhEVM.**

---

## Overview

Bagel is a privacy-preserving payroll platform on Ethereum. All salary amounts, balances, and identity data are encrypted using **Fully Homomorphic Encryption (FHE)** via Zama's fhEVM. Observers see only encrypted ciphertext — never plaintext values.

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Smart Contracts | Solidity + `@fhevm/solidity` | Encrypted payroll logic (BagelPayroll.sol) |
| Confidential Token | ERC7984 (CERC20) | Encrypted token balances and transfers |
| Client SDK | `fhevmjs` + `ethers.js` | Client-side encryption/decryption |
| Frontend | Next.js + TypeScript | Employer/Employee dashboards |
| Framework | Hardhat + `@fhevm/hardhat-plugin` | Development, testing, deployment |

## Privacy Guarantees

| Data | Status | Method |
|------|--------|--------|
| Employer Identity | ENCRYPTED | `euint64` hash via `FHE.fromExternal()` |
| Employee Identity | ENCRYPTED | `euint64` hash via `FHE.fromExternal()` |
| Salary Rate | ENCRYPTED | `euint64` via fhEVM |
| Accrued Balance | ENCRYPTED | Homomorphic `FHE.mul(salary, time)` |
| Business Balance | ENCRYPTED | Homomorphic `FHE.add()` / `FHE.sub()` |
| Transfer Amounts | ENCRYPTED | ERC7984 confidential transfers |
| Business/Employee Counts | ENCRYPTED | `euint64` counters |

## Project Structure

```
Bagel-EVM/
├── contracts/
│   ├── BagelPayroll.sol          # Main payroll contract (FHE encrypted)
│   └── tokens/
│       └── CERC20.sol            # Confidential ERC20 (USDBagel)
├── scripts/
│   └── deploy.ts                 # Deployment orchestrator
├── test/
│   └── BagelPayroll.test.ts      # Contract tests
├── app/                          # Next.js frontend
│   ├── lib/
│   │   ├── fhevm.ts              # Zama fhEVM client (encrypt/decrypt)
│   │   └── contract-client.ts    # Contract interaction layer
│   ├── hooks/
│   │   └── useBagel.ts           # React hook for payroll ops
│   └── pages/
│       ├── employer.tsx          # Employer dashboard
│       └── employee.tsx          # Employee dashboard
├── hardhat.config.ts
└── package.json
```

## Quick Start

```bash
# Install dependencies
npm install

# Start local node (persistent RPC required for fhEVM)
npx hardhat node

# Deploy contracts
npx hardhat run scripts/deploy.ts --network localhost

# Run tests
npx hardhat test --network localhost

# Start frontend
cd app && npm install && npm run dev
```

## Key Concepts

### Encrypted Payroll Flow

1. **Employer registers business** — employer ID hash encrypted via `FHE.fromExternal()`
2. **Employer deposits funds** — amount encrypted, added to business balance via `FHE.add()`
3. **Employer adds employee** — employee ID and salary encrypted via fhEVM
4. **Salary accrues** — `FHE.mul(encrypted_salary, plaintext_elapsed_time)` (homomorphic)
5. **Employee withdraws** — encrypted amount subtracted via `FHE.sub()`

### FHE Operations Used

- `FHE.fromExternal()` — validate encrypted inputs from client
- `FHE.add(euint64, euint64)` — homomorphic addition (deposits, accrual)
- `FHE.sub(euint64, euint64)` — homomorphic subtraction (withdrawals)
- `FHE.mul(euint64, uint64)` — ciphertext * plaintext (salary * time)
- `FHE.asEuint64(0)` — create encrypted zero
- `FHE.allowThis()` — grant contract access to ciphertext

## License

MIT

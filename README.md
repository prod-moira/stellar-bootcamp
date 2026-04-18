# SplitWork

> **One USDC invoice. One click. Every collaborator paid instantly.**

A Soroban smart contract that replaces days of manual GCash / PayPal transfers with a single on-chain payout — built for small creative teams across Southeast Asia.

---

## The Problem

A freelance creative director in Manila coordinates a 4-person remote team — designer, developer, copywriter, videographer. After the client pays, manually splitting and transferring funds across GCash, PayPal, and bank transfers takes **days** and causes payment disputes that damage team trust.

Traditional split payments eat **5–10 % in transfer fees** on small $200–$1 000 gigs, making the tools designed for big enterprises actively harmful to micro-teams.

---

## The Solution

The client pays **one USDC invoice** into a Soroban smart contract that **instantly splits and distributes** funds to each collaborator's wallet at preset percentages.

- ⚡ Stellar's **3–5 second finality** means money moves faster than a WhatsApp confirmation.  
- 💸 Near-zero fees (~$0.00001 per operation) make small gigs viable.  
- 🔒 Smart-contract enforcement removes "I'll send it later" ambiguity entirely.

---

## Timeline

| Milestone | Target |
|-----------|--------|
| Smart-contract MVP (this repo) | Week 1 |
| React web app + Freighter wallet integration | Week 2 |
| Testnet demo & Stellar Quest submission | Week 3 |
| Mainnet launch + AI invoice parser (optional edge) | Week 4+ |

---

## Stellar Features Used

| Feature | Role in SplitWork |
|---------|-------------------|
| **USDC (SEP-0041 Stellar Asset Contract)** | Single settlement currency — no FX risk, instant finality |
| **Soroban smart contracts** | Trustless on-chain split logic; no intermediary can delay or redirect funds |
| **Trustlines** | Each collaborator wallet must hold a USDC trustline before receiving a payout — enforced by the token contract |

---

## Vision and Purpose

SplitWork demonstrates that Soroban is not just theoretically powerful — it solves a **concrete, everyday problem** affecting millions of gig workers across the Philippines, Indonesia, and Vietnam right now. The before/after is visceral: days of awkward manual transfers replaced by one button. If we can make payment splitting as easy as sending a link, we remove one of the biggest trust barriers inside informal creative teams.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | ≥ 1.77 (stable) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| `wasm32` target | – | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI | ≥ 21.0.0 | `cargo install --locked stellar-cli --features opt` |

> **Tip:** verify versions with `rustc --version` and `stellar --version`.

---

## Build

```bash
# Clone the repo
git clone https://github.com/your-org/splitwork
cd splitwork

# Compile to optimised .wasm
stellar contract build
# Output: target/wasm32-unknown-unknown/release/split_work.wasm
```

---

## Test

```bash
# Run the full test suite (5 tests)
cargo test

# With output for debugging
cargo test -- --nocapture
```

Expected output:

```
running 5 tests
test test::test_happy_path_full_mvp ........................... ok
test test::test_release_with_zero_balance_panics .............. ok
test test::test_storage_reflects_correct_collaborators_and_shares ok
test test::test_initialize_rejects_invalid_share_sum .......... ok
test test::test_double_initialize_panics ...................... ok

test result: ok. 5 passed; 0 failed
```

---

## Deploy to Testnet

### 1 — Configure network & identity

```bash
# Add Testnet RPC
stellar network add testnet \
  --rpc-url  https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Create (or import) a deployer identity
stellar keys generate --network testnet deployer
stellar keys address deployer        # prints your G... address

# Fund from Friendbot
curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
```

### 2 — Upload the Wasm

```bash
stellar contract upload \
  --network testnet \
  --source  deployer \
  --wasm    target/wasm32-unknown-unknown/release/split_work.wasm
# → prints a WASM hash
```

### 3 — Deploy the contract

```bash
stellar contract deploy \
  --network   testnet \
  --source    deployer \
  --wasm-hash <WASM_HASH_FROM_STEP_2>
# → prints CONTRACT_ID (C...)
```

---

## Sample CLI Invocations

All amounts are in **stroops** (1 USDC = 10 000 000 stroops, 7 decimal places).

### initialize — set up collaborators and splits

```bash
stellar contract invoke \
  --network   testnet \
  --source    deployer \
  --id        <CONTRACT_ID> \
  -- initialize \
  --coordinator  GCOORD... \
  --usdc_token   CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --collaborators '["GDESIGNER...", "GDEVELOPER...", "GCOPYWRITER...", "GVIDEOGRAPHER..."]' \
  --shares        '[4000, 3000, 2000, 1000]'
```

> Shares are in basis points: 4000 = 40 %, 3000 = 30 %, 2000 = 20 %, 1000 = 10 %.

### deposit — client pays the invoice

```bash
stellar contract invoke \
  --network testnet \
  --source  client_wallet \
  --id      <CONTRACT_ID> \
  -- deposit \
  --from   GCLIENT... \
  --amount 2000000000   # 200 USDC
```

### release — coordinator distributes funds instantly

```bash
stellar contract invoke \
  --network testnet \
  --source  coordinator_wallet \
  --id      <CONTRACT_ID> \
  -- release
# All 4 collaborators receive their cut simultaneously in < 5 seconds
```

### get_balance — check contract balance before release

```bash
stellar contract invoke \
  --network testnet \
  --source  any_wallet \
  --id      <CONTRACT_ID> \
  -- get_balance
```

---

## Contract Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SplitWork Contract                     │
│                                                         │
│  initialize(coordinator, usdc, collaborators, shares)   │
│    └─ stores split config; callable once only           │
│                                                         │
│  deposit(from, amount)                                  │
│    └─ transfers USDC from client → contract             │
│                                                         │
│  release()     ← coordinator only                       │
│    └─ reads balance → proportional transfer to each     │
│       collaborator in a single atomic batch             │
│                                                         │
│  get_balance()          (view)                          │
│  get_collaborators()    (view)                          │
└─────────────────────────────────────────────────────────┘
```

---

### Smart Contract Link:
[https://stellar.expert/explorer/testnet/contract/CC47MFMXFNPMQUCJHYJZK3S2YE3T5BGVFVVRDYEAK6YPT4HZAIQD353C]

![alt text](<Screenshot 2026-04-18 162328.png>)

## License

MIT © 2025 SplitWork Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
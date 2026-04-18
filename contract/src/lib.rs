//! SplitWork – Soroban smart contract
//!
//! One USDC deposit → instant proportional distribution to every collaborator.
//! Designed for small remote creative teams in SEA earning $200–$1 000 per gig.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, Vec,
};

// ─── Storage key enum ────────────────────────────────────────────────────────
//
// Each variant becomes a distinct key in the contract's ledger storage.
// Using an enum (rather than raw strings) gives us compile-time safety and
// avoids typo-driven storage collisions.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The USDC token contract address (SEP-0041 compliant).
    UsdcToken,
    /// The address that is authorised to call `release()`.
    /// Typically the freelance team lead / project coordinator.
    Coordinator,
    /// Ordered list of collaborator wallet addresses.
    Collaborators,
    /// Parallel list of basis-point shares (must sum to 10 000).
    /// e.g. [5000, 2500, 1500, 1000] → 50 %, 25 %, 15 %, 10 %
    Shares,
    /// Whether `initialize` has already been called.
    Initialized,
}

// ─── Contract struct ─────────────────────────────────────────────────────────
#[contract]
pub struct SplitWorkContract;

#[contractimpl]
impl SplitWorkContract {
    // ─── initialize ──────────────────────────────────────────────────────────
    //
    // Must be called exactly once after deployment.
    //
    // Parameters
    // ----------
    // coordinator   – address allowed to call `release()`; must sign this tx.
    // usdc_token    – address of the USDC token contract on this network.
    // collaborators – ordered Vec of wallet addresses that will receive funds.
    // shares        – parallel Vec of u32 values in basis points (1 bp = 0.01 %).
    //                 The sum MUST equal 10 000 (= 100 %).
    //
    // Why basis points?
    // -----------------
    // Integer arithmetic in Wasm avoids floating-point rounding errors.
    // 10 000 bp gives two decimal places of precision without floats.
    pub fn initialize(
        env: Env,
        coordinator: Address,
        usdc_token: Address,
        collaborators: Vec<Address>,
        shares: Vec<u32>,
    ) {
        // Prevent re-initialisation – once set, the split is immutable.
        if env
            .storage()
            .instance()
            .get::<DataKey, bool>(&DataKey::Initialized)
            .unwrap_or(false)
        {
            panic!("contract already initialised");
        }

        // The caller must prove they own the coordinator address.
        coordinator.require_auth();

        // Basic sanity checks before we touch storage.
        let n = collaborators.len();
        assert!(n > 0,                    "need at least one collaborator");
        assert!(n == shares.len(),        "collaborators and shares length mismatch");
        assert!(n <= 10,                  "maximum 10 collaborators");

        // Shares must sum to exactly 10 000 bp so the full payment is distributed.
        let total: u32 = shares.iter().sum();
        assert!(total == 10_000, "shares must sum to 10 000 basis points (= 100 %)");

        // Persist everything to instance storage (lives as long as the contract).
        let storage = env.storage().instance();
        storage.set(&DataKey::UsdcToken,     &usdc_token);
        storage.set(&DataKey::Coordinator,   &coordinator);
        storage.set(&DataKey::Collaborators, &collaborators);
        storage.set(&DataKey::Shares,        &shares);
        storage.set(&DataKey::Initialized,   &true);
    }

    // ─── deposit ─────────────────────────────────────────────────────────────
    //
    // The client (payer) transfers `amount` stroops of USDC into this contract.
    //
    // Why does the client call this rather than just sending a payment?
    // ------------------------------------------------------------------
    // Soroban contracts cannot receive SAC token transfers passively; the
    // payer must invoke `transfer` on the token contract, specifying the
    // SplitWork contract address as the destination.  This function is a
    // convenience entry-point that performs that transfer atomically and
    // emits a clear audit trail via the return value.
    //
    // Parameters
    // ----------
    // from   – the payer's address; must sign this transaction.
    // amount – amount in stroops (USDC uses 7 decimal places on Stellar,
    //          so 1 USDC = 10_000_000 stroops).
    pub fn deposit(env: Env, from: Address, amount: i128) -> i128 {
        assert!(amount > 0, "deposit amount must be positive");

        // Require the payer's signature so funds cannot be moved without consent.
        from.require_auth();

        let usdc_token = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::UsdcToken)
            .expect("contract not initialised");

        // Transfer USDC from the payer into this contract's account.
        TokenClient::new(&env, &usdc_token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        amount // Return the deposited amount for caller confirmation.
    }

    // ─── release ─────────────────────────────────────────────────────────────
    //
    // Distributes the contract's entire USDC balance to collaborators
    // proportionally according to their stored basis-point shares.
    //
    // Only the coordinator (set at initialisation) may call this function.
    // This prevents a random actor from triggering an early payout.
    //
    // Why drain the full balance?
    // ---------------------------
    // For the MVP a gig has a single payout event.  Draining 100 % of the
    // balance keeps accounting simple: the contract balance is always either
    // "awaiting client payment" (> 0) or "paid out" (= 0).
    //
    // Returns the total amount distributed (in stroops).
    pub fn release(env: Env) -> i128 {
        let storage = env.storage().instance();

        // Only the coordinator can trigger the payout.
        let coordinator = storage
            .get::<DataKey, Address>(&DataKey::Coordinator)
            .expect("contract not initialised");
        coordinator.require_auth();

        let usdc_token = storage
            .get::<DataKey, Address>(&DataKey::UsdcToken)
            .expect("contract not initialised");

        let collaborators = storage
            .get::<DataKey, Vec<Address>>(&DataKey::Collaborators)
            .expect("collaborators not set");

        let shares = storage
            .get::<DataKey, Vec<u32>>(&DataKey::Shares)
            .expect("shares not set");

        let token = TokenClient::new(&env, &usdc_token);
        let contract_addr = env.current_contract_address();

        // Read the full USDC balance held by this contract.
        let balance: i128 = token.balance(&contract_addr);
        assert!(balance > 0, "nothing to release – balance is zero");

        let mut distributed: i128 = 0;

        // Iterate all collaborators except the last and pay their exact share.
        // The last collaborator receives the remainder to prevent dust loss from
        // integer-division truncation.
        let n = collaborators.len() as usize;
        for i in 0..n {
            let collaborator = collaborators.get(i as u32).unwrap();
            let share_bp    = shares.get(i as u32).unwrap() as i128;

            let payout = if i < n - 1 {
                // Integer division: (balance * share_bp) / 10_000
                balance * share_bp / 10_000_i128
            } else {
                // Last collaborator gets whatever remains to zero the balance.
                balance - distributed
            };

            if payout > 0 {
                token.transfer(&contract_addr, &collaborator, &payout);
                distributed += payout;
            }
        }

        distributed
    }

    // ─── get_balance ─────────────────────────────────────────────────────────
    //
    // Read-only view of the contract's current USDC balance.
    // Useful for frontends polling payment confirmation before release.
    pub fn get_balance(env: Env) -> i128 {
        let usdc_token = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::UsdcToken)
            .expect("contract not initialised");

        TokenClient::new(&env, &usdc_token).balance(&env.current_contract_address())
    }

    // ─── get_collaborators ───────────────────────────────────────────────────
    //
    // Returns the stored collaborator list as a Vec of (address, share_bp) pairs
    // encoded as a flat Vec<u32> of indices.  Frontends call this to render
    // the split breakdown before the client confirms payment.
    //
    // Returns (collaborators, shares) as separate Vecs for easy JS destructuring.
    pub fn get_collaborators(env: Env) -> (Vec<Address>, Vec<u32>) {
        let storage = env.storage().instance();
        let collaborators = storage
            .get::<DataKey, Vec<Address>>(&DataKey::Collaborators)
            .expect("contract not initialised");
        let shares = storage
            .get::<DataKey, Vec<u32>>(&DataKey::Shares)
            .expect("contract not initialised");
        (collaborators, shares)
    }
}

// ─── test module ─────────────────────────────────────────────────────────────
// Tests live in a separate file for clarity; see src/test.rs.
#[cfg(test)]
mod test;
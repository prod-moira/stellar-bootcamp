//! SplitWork – contract test suite
//!
//! Exactly 5 tests covering the MVP happy path, edge cases, and state
//! verification.  All tests use soroban_sdk::testutils and a mock environment.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, Vec,
};

use crate::{SplitWorkContract, SplitWorkContractClient};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Spin up a fresh Env, deploy a mock USDC token, and deploy + initialise
/// a SplitWork contract with 4 collaborators at 40 / 30 / 20 / 10 %.
/// Returns (env, splitwork_client, usdc_client, coordinator, collaborators, client_payer).
fn setup() -> (
    Env,
    SplitWorkContractClient<'static>,
    TokenClient<'static>,
    Address,
    [Address; 4],
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    // ── Deploy a test USDC (Stellar Asset Contract) ──────────────────────────
    let usdc_admin  = Address::generate(&env);
    let usdc_id     = env.register_stellar_asset_contract_v2(usdc_admin.clone());
    let usdc_client = TokenClient::new(&env, &usdc_id.address());
    let usdc_admin_client = StellarAssetClient::new(&env, &usdc_id.address());

    // ── Actors ───────────────────────────────────────────────────────────────
    let coordinator   = Address::generate(&env);
    let collaborators = [
        Address::generate(&env), // Designer  – 40 %
        Address::generate(&env), // Developer – 30 %
        Address::generate(&env), // Copywriter – 20 %
        Address::generate(&env), // Videographer – 10 %
    ];
    let client_payer = Address::generate(&env);

    // Mint 500 USDC (7 decimal places → 5_000_000_000 stroops) to the payer.
    usdc_admin_client.mint(&client_payer, &5_000_000_000_i128);

    // ── Deploy & initialise SplitWork ─────────────────────────────────────────
    let contract_id = env.register(SplitWorkContract, ());
    let sw = SplitWorkContractClient::new(&env, &contract_id);

    let mut collab_vec = Vec::new(&env);
    for addr in &collaborators {
        collab_vec.push_back(addr.clone());
    }

    let mut shares_vec = Vec::new(&env);
    // 40 % + 30 % + 20 % + 10 % = 100 % = 10 000 bp
    for bp in [4_000_u32, 3_000, 2_000, 1_000] {
        shares_vec.push_back(bp);
    }

    sw.initialize(
        &coordinator,
        &usdc_id.address(),
        &collab_vec,
        &shares_vec,
    );

    (env, sw, usdc_client, coordinator, collaborators, client_payer)
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 – Happy path: full MVP transaction succeeds end-to-end
// ═══════════════════════════════════════════════════════════════════════════
//
// Scenario: client deposits 200 USDC; coordinator calls release(); every
// collaborator instantly receives their proportional share.
#[test]
fn test_happy_path_full_mvp() {
    let (_env, sw, usdc, _coord, collaborators, payer) = setup();

    // 200 USDC in stroops
    let deposit_amount: i128 = 2_000_000_000;

    // Client deposits into the contract.
    let returned = sw.deposit(&payer, &deposit_amount);
    assert_eq!(returned, deposit_amount, "deposit should return the deposited amount");

    // Contract should now hold the full deposit.
    assert_eq!(sw.get_balance(), deposit_amount);

    // Coordinator releases funds.
    let distributed = sw.release();
    assert_eq!(distributed, deposit_amount, "full balance should be distributed");

    // Verify each collaborator received their correct share.
    // 40 % of 2_000_000_000 = 800_000_000
    assert_eq!(usdc.balance(&collaborators[0]), 800_000_000_i128);
    // 30 % → 600_000_000
    assert_eq!(usdc.balance(&collaborators[1]), 600_000_000_i128);
    // 20 % → 400_000_000
    assert_eq!(usdc.balance(&collaborators[2]), 400_000_000_i128);
    // 10 % (last – receives remainder to absorb rounding) → 200_000_000
    assert_eq!(usdc.balance(&collaborators[3]), 200_000_000_i128);

    // Contract balance should be zero after full release.
    assert_eq!(sw.get_balance(), 0_i128);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 – Edge case: release() panics when contract balance is zero
// ═══════════════════════════════════════════════════════════════════════════
//
// Scenario: the coordinator tries to call release() before the client has
// deposited anything.  The contract must reject this gracefully.
#[test]
fn test_release_with_zero_balance_panics() {
    let (_env, sw, _usdc, _coord, _collaborators, _payer) = setup();

    // No deposit has been made – calling release() must return an error.
    let result = sw.try_release();
    assert!(result.is_err());
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 – State verification: storage reflects correct state after MVP flow
// ═══════════════════════════════════════════════════════════════════════════
//
// Scenario: after initialize() the collaborator list and share vector returned
// by get_collaborators() must exactly match what was passed in.
#[test]
fn test_storage_reflects_correct_collaborators_and_shares() {
    let (_env, sw, _usdc, _coord, collaborators, _payer) = setup();

    let (stored_collabs, stored_shares) = sw.get_collaborators();

    assert_eq!(stored_collabs.len(), 4, "should have 4 collaborators");
    assert_eq!(stored_shares.len(),  4, "should have 4 share entries");

    // Verify addresses are in insertion order.
    for (i, expected_addr) in collaborators.iter().enumerate() {
        assert_eq!(
            stored_collabs.get(i as u32).unwrap(),
            *expected_addr,
            "collaborator at index {i} does not match"
        );
    }

    // Verify basis-point values.
    let expected_bp: [u32; 4] = [4_000, 3_000, 2_000, 1_000];
    for (i, expected) in expected_bp.iter().enumerate() {
        assert_eq!(
            stored_shares.get(i as u32).unwrap(),
            *expected,
            "share at index {i} does not match"
        );
    }

    // Total must equal 10 000.
    let total: u32 = stored_shares.iter().sum();
    assert_eq!(total, 10_000);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4 – Edge case: initialize() panics when shares do not sum to 10 000
// ═══════════════════════════════════════════════════════════════════════════
//
// Scenario: a coordinator accidentally sets shares that sum to 9 500 (off by
// 500 bp).  The contract must reject the configuration at initialisation time
// so no funds are ever silently lost.
#[test]
#[should_panic(expected = "shares must sum to 10 000 basis points")]
fn test_initialize_rejects_invalid_share_sum() {
    let env = Env::default();
    env.mock_all_auths();

    let usdc_admin = Address::generate(&env);
    let usdc_id    = env.register_stellar_asset_contract_v2(usdc_admin);
    let coordinator = Address::generate(&env);

    let mut collabs = Vec::new(&env);
    collabs.push_back(Address::generate(&env));
    collabs.push_back(Address::generate(&env));

    let mut bad_shares = Vec::new(&env);
    bad_shares.push_back(5_000_u32); // 50 %
    bad_shares.push_back(4_500_u32); // 45 % → total = 9 500, not 10 000

    let contract_id = env.register(SplitWorkContract, ());
    let sw = SplitWorkContractClient::new(&env, &contract_id);

    // Must panic because 5000 + 4500 ≠ 10 000.
    sw.initialize(&coordinator, &usdc_id.address(), &collabs, &bad_shares);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5 – Edge case: initialize() can only be called once
// ═══════════════════════════════════════════════════════════════════════════
//
// Scenario: a malicious actor (or accidental second call) tries to re-initialise
// an already-live contract to hijack the collaborator list.  The contract must
// reject the second call unconditionally.
#[test]
#[should_panic(expected = "contract already initialised")]
fn test_double_initialize_panics() {
    let (env, sw, _usdc, coord, _collaborators, _payer) = setup();

    // Build a valid-looking but different collaborator set.
    let attacker = Address::generate(&env);
    let mut hijacked_collabs = Vec::new(&env);
    hijacked_collabs.push_back(attacker);

    let mut hijacked_shares = Vec::new(&env);
    hijacked_shares.push_back(10_000_u32); // 100 % to attacker

    // Retrieve the original usdc token address from storage (via get_collaborators
    // to stay in-test without exposing extra view methods).
    // We reuse the original coord & token from setup; the contract must reject this.
    let (original_collabs, _) = sw.get_collaborators();
    let first_collab = original_collabs.get(0).unwrap();

    // Attempt to re-initialise – must panic.
    sw.initialize(
        &coord,
        &first_collab, // wrong arg, but irrelevant – should fail before validation
        &hijacked_collabs,
        &hijacked_shares,
    );
}
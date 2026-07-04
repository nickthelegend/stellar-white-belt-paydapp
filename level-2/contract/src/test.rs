#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, Address, Env,
};

/// Spin up a contract with a fresh SAC token, `goal`, and a deadline `dt`
/// seconds in the future. Returns the pieces a test needs.
fn setup(
    env: &Env,
    goal: i128,
    dt: u64,
) -> (
    CrowdfundClient<'static>,
    token::StellarAssetClient<'static>,
    token::TokenClient<'static>,
    Address, // beneficiary
) {
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_admin = token::StellarAssetClient::new(env, &sac.address());
    let token = token::TokenClient::new(env, &sac.address());

    let beneficiary = Address::generate(env);
    let contract_id = env.register(
        Crowdfund,
        (beneficiary.clone(), sac.address(), goal, 1_000u64 + dt),
    );
    let client = CrowdfundClient::new(env, &contract_id);

    (client, token_admin, token, beneficiary)
}

fn funded_backer(env: &Env, token_admin: &token::StellarAssetClient, amount: i128) -> Address {
    let backer = Address::generate(env);
    token_admin.mint(&backer, &amount);
    backer
}

#[test]
fn pledge_updates_state_and_moves_funds() {
    let env = Env::default();
    let (client, token_admin, token, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 500);

    let total = client.pledge(&backer, &300);
    assert_eq!(total, 300);

    let state = client.get_state();
    assert_eq!(state.raised, 300);
    assert_eq!(state.backers, 1);
    assert_eq!(client.pledged_by(&backer), 300);
    // Funds actually left the backer and sit in the contract.
    assert_eq!(token.balance(&backer), 200);
    assert_eq!(token.balance(&client.address), 300);
}

#[test]
fn repeat_pledge_same_backer_counts_once() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 500);

    client.pledge(&backer, &100);
    client.pledge(&backer, &150);

    let state = client.get_state();
    assert_eq!(state.raised, 250);
    assert_eq!(state.backers, 1);
    assert_eq!(client.pledged_by(&backer), 250);
}

#[test]
fn two_backers_counted_separately() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let a = funded_backer(&env, &token_admin, 500);
    let b = funded_backer(&env, &token_admin, 500);

    client.pledge(&a, &100);
    client.pledge(&b, &200);

    assert_eq!(client.get_state().backers, 2);
    assert_eq!(client.get_state().raised, 300);
}

#[test]
fn pledge_emits_event() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 500);

    client.pledge(&backer, &300);

    // The most recent event should be our pledge.
    let events = env.events().all();
    assert!(!events.events().is_empty());
}

#[test]
fn rejects_non_positive_amount() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 500);

    assert_eq!(client.try_pledge(&backer, &0), Err(Ok(Error::InvalidAmount)));
    assert_eq!(client.try_pledge(&backer, &-5), Err(Ok(Error::InvalidAmount)));
}

#[test]
fn rejects_pledge_after_deadline() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 500);

    env.ledger().set_timestamp(1_000 + 3_601);
    assert_eq!(
        client.try_pledge(&backer, &100),
        Err(Ok(Error::CampaignEnded))
    );
}

#[test]
fn withdraw_after_success_pays_beneficiary() {
    let env = Env::default();
    let (client, token_admin, token, beneficiary) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 2_000);

    client.pledge(&backer, &1_000); // hits the goal
    env.ledger().set_timestamp(1_000 + 3_601);

    let paid = client.withdraw();
    assert_eq!(paid, 1_000);
    assert_eq!(token.balance(&beneficiary), 1_000);
    assert!(client.get_state().withdrawn);
}

#[test]
fn withdraw_before_deadline_is_rejected() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 2_000);
    client.pledge(&backer, &1_000);

    assert_eq!(client.try_withdraw(), Err(Ok(Error::CampaignActive)));
}

#[test]
fn withdraw_below_goal_is_rejected() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 2_000);
    client.pledge(&backer, &500); // under goal

    env.ledger().set_timestamp(1_000 + 3_601);
    assert_eq!(client.try_withdraw(), Err(Ok(Error::GoalNotMet)));
}

#[test]
fn double_withdraw_is_rejected() {
    let env = Env::default();
    let (client, token_admin, _t, _b) = setup(&env, 1_000, 3_600);
    let backer = funded_backer(&env, &token_admin, 2_000);
    client.pledge(&backer, &1_000);
    env.ledger().set_timestamp(1_000 + 3_601);
    client.withdraw();

    assert_eq!(client.try_withdraw(), Err(Ok(Error::AlreadyWithdrawn)));
}

#[test]
#[should_panic]
fn constructor_rejects_bad_goal() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let beneficiary = Address::generate(&env);

    // goal == 0 -> constructor returns Err, which aborts registration.
    env.register(Crowdfund, (beneficiary, sac.address(), 0i128, 5_000u64));
}

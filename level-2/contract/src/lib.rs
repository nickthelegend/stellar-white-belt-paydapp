#![no_std]
//! Crowdfund — a minimal Soroban crowdfunding contract.
//!
//! Backers pledge native XLM toward a `goal` before a `deadline`. Pledged funds
//! are held by the contract. Once the deadline passes the beneficiary can
//! `withdraw` if the goal was met. Every pledge emits an on-chain event so a
//! frontend can render a live activity feed.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol,
};

/// Storage keys. A typed enum keeps keys collision-free.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Beneficiary,       // Address that receives funds after a successful campaign
    Token,             // Address of the token (SAC) accepted for pledges
    Goal,              // Target amount (stroops)
    Deadline,          // Unix timestamp after which pledging closes
    Raised,            // Running total pledged (stroops)
    Backers,           // Count of distinct backers
    Withdrawn,         // Whether the beneficiary has withdrawn
    Pledged(Address),  // Amount pledged by a given backer
}

/// A snapshot of campaign state, returned to the frontend in one call.
#[contracttype]
#[derive(Clone)]
pub struct State {
    pub beneficiary: Address,
    pub token: Address,
    pub goal: i128,
    pub deadline: u64,
    pub raised: i128,
    pub backers: u32,
    pub withdrawn: bool,
}

/// Errors surfaced to callers. `#[repr(u32)]` codes show up verbatim in the
/// frontend so we can map them to friendly messages.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,   // amount <= 0
    CampaignEnded = 2,   // now > deadline
    CampaignActive = 3,  // withdraw attempted before deadline
    GoalNotMet = 4,      // withdraw attempted but raised < goal
    AlreadyWithdrawn = 5,
    NotBeneficiary = 6,  // caller is not the configured beneficiary
    BadDeadline = 7,     // constructor given a deadline in the past
    BadGoal = 8,         // constructor given goal <= 0
}

// ~30 days of ledgers at ~5s each, used to keep state alive.
const BUMP_THRESHOLD: u32 = 100;
const BUMP_TO: u32 = 518_400;

#[contract]
pub struct Crowdfund;

#[contractimpl]
impl Crowdfund {
    /// Deploy-time setup. Runs exactly once and atomically.
    pub fn __constructor(
        env: Env,
        beneficiary: Address,
        token: Address,
        goal: i128,
        deadline: u64,
    ) -> Result<(), Error> {
        if goal <= 0 {
            return Err(Error::BadGoal);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::BadDeadline);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Beneficiary, &beneficiary);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Goal, &goal);
        s.set(&DataKey::Deadline, &deadline);
        s.set(&DataKey::Raised, &0i128);
        s.set(&DataKey::Backers, &0u32);
        s.set(&DataKey::Withdrawn, &false);
        Ok(())
    }

    /// Pledge `amount` stroops of the campaign token. Moves funds from `backer`
    /// into the contract, records the pledge, and emits a `pledge` event.
    pub fn pledge(env: Env, backer: Address, amount: i128) -> Result<i128, Error> {
        // The backer must sign for this call (and the token transfer below).
        backer.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if env.ledger().timestamp() > Self::deadline(env.clone()) {
            return Err(Error::CampaignEnded);
        }

        // Pull the funds. The token client re-checks auth for the transfer.
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&backer, &env.current_contract_address(), &amount);

        let s = env.storage().instance();

        // First-time backer? bump the distinct-backer count.
        let key = DataKey::Pledged(backer.clone());
        let prev: i128 = s.get(&key).unwrap_or(0);
        if prev == 0 {
            let backers: u32 = s.get(&DataKey::Backers).unwrap_or(0);
            s.set(&DataKey::Backers, &(backers + 1));
        }
        s.set(&key, &(prev.checked_add(amount).expect("overflow")));

        let raised: i128 = s.get(&DataKey::Raised).unwrap_or(0);
        let new_total = raised.checked_add(amount).expect("overflow");
        s.set(&DataKey::Raised, &new_total);

        s.extend_ttl(BUMP_THRESHOLD, BUMP_TO);

        // topics: ("pledge", backer)  data: (amount, running_total)
        let topic: Symbol = symbol_short!("pledge");
        env.events()
            .publish((topic, backer), (amount, new_total));

        Ok(new_total)
    }

    /// After the deadline, if the goal was met, send everything to the
    /// beneficiary. Callable only by the beneficiary.
    pub fn withdraw(env: Env) -> Result<i128, Error> {
        let s = env.storage().instance();
        let beneficiary: Address = s.get(&DataKey::Beneficiary).unwrap();
        beneficiary.require_auth();

        if s.get(&DataKey::Withdrawn).unwrap_or(false) {
            return Err(Error::AlreadyWithdrawn);
        }
        if env.ledger().timestamp() <= Self::deadline(env.clone()) {
            return Err(Error::CampaignActive);
        }
        let raised: i128 = s.get(&DataKey::Raised).unwrap_or(0);
        let goal: i128 = s.get(&DataKey::Goal).unwrap();
        if raised < goal {
            return Err(Error::GoalNotMet);
        }

        let token_addr: Address = s.get(&DataKey::Token).unwrap();
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &beneficiary, &raised);

        s.set(&DataKey::Withdrawn, &true);
        env.events()
            .publish((symbol_short!("withdraw"), beneficiary), raised);

        Ok(raised)
    }

    /// One-call snapshot for the frontend.
    pub fn get_state(env: Env) -> State {
        let s = env.storage().instance();
        State {
            beneficiary: s.get(&DataKey::Beneficiary).unwrap(),
            token: s.get(&DataKey::Token).unwrap(),
            goal: s.get(&DataKey::Goal).unwrap(),
            deadline: s.get(&DataKey::Deadline).unwrap(),
            raised: s.get(&DataKey::Raised).unwrap_or(0),
            backers: s.get(&DataKey::Backers).unwrap_or(0),
            withdrawn: s.get(&DataKey::Withdrawn).unwrap_or(false),
        }
    }

    /// How much a single backer has pledged so far.
    pub fn pledged_by(env: Env, backer: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Pledged(backer))
            .unwrap_or(0)
    }

    fn deadline(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Deadline).unwrap()
    }
}

mod test;

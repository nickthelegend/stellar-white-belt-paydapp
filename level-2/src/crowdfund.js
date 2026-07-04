import * as StellarSdk from "@stellar/stellar-sdk";
import { rpc, NETWORK, CONTRACT_ID } from "./config.js";

const contract = new StellarSdk.Contract(CONTRACT_ID);

// A dummy source is fine for read-only simulation — it is never submitted.
function dummySource() {
  return new StellarSdk.Account(StellarSdk.Keypair.random().publicKey(), "0");
}

// Map the contract's numeric error codes (see contract/src/lib.rs `Error`) plus
// common token/host failures onto human messages. This is where "campaign
// ended", "invalid amount" and "insufficient balance" become readable.
export function mapContractError(raw) {
  const text = (raw || "").toString();
  const lower = text.toLowerCase();

  // SAC transfer runs out of funds before our logic does.
  if (lower.includes("balance") && lower.includes("insufficient")) {
    return "Insufficient balance to cover that pledge plus fees.";
  }
  if (lower.includes("#1")) return "Enter an amount greater than zero.";
  if (lower.includes("#2")) return "This campaign has ended — pledging is closed.";
  if (lower.includes("#3")) return "Campaign is still active; withdrawal isn't allowed yet.";
  if (lower.includes("#4")) return "Goal was not met, so funds can't be withdrawn.";
  if (lower.includes("#5")) return "Funds have already been withdrawn.";
  if (lower.includes("#6")) return "Only the beneficiary can withdraw.";

  // Generic token trap (e.g. #10 from the SAC) usually means not enough XLM.
  if (lower.includes("error(contract")) {
    return "The contract rejected this call. Check your balance and try again.";
  }
  return text || "Transaction failed.";
}

// Read the whole campaign in one simulated call. Returns plain JS values
// (BigInt for i128/u64, number for u32, string for addresses).
export async function getState() {
  const tx = new StellarSdk.TransactionBuilder(dummySource(), {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(contract.call("get_state"))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(mapContractError(sim.error));
  }
  return StellarSdk.scValToNative(sim.result.retval);
}

// How much a given address has pledged (stroops as BigInt).
export async function getPledgedBy(address) {
  const tx = new StellarSdk.TransactionBuilder(dummySource(), {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "pledged_by",
        StellarSdk.Address.fromString(address).toScVal()
      )
    )
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) return 0n;
  return StellarSdk.scValToNative(sim.result.retval);
}

// Build + simulate + assemble a pledge transaction, returning unsigned XDR.
// Simulation is where insufficient-balance / campaign-ended surface early.
export async function buildPledgeXdr(backer, amountStroops) {
  const account = await rpc.getAccount(backer);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "pledge",
        StellarSdk.Address.fromString(backer).toScVal(),
        StellarSdk.nativeToScVal(amountStroops, { type: "i128" })
      )
    )
    .setTimeout(180)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(mapContractError(sim.error));
  }

  return StellarSdk.rpc.assembleTransaction(tx, sim).build().toXDR();
}

// Submit a signed Soroban tx and poll until it settles. Returns { hash }.
export async function submitSignedXdr(signedXdr) {
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK.networkPassphrase
  );

  const sent = await rpc.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(mapContractError(JSON.stringify(sent.errorResult)));
  }

  let res = await rpc.getTransaction(sent.hash);
  const started = Date.now();
  while (res.status === "NOT_FOUND") {
    if (Date.now() - started > 30_000) {
      throw new Error("Timed out waiting for confirmation. Check the explorer.");
    }
    await new Promise((r) => setTimeout(r, 1200));
    res = await rpc.getTransaction(sent.hash);
  }

  if (res.status !== "SUCCESS") {
    throw new Error(mapContractError(res.resultXdr?.toString?.() || res.status));
  }
  return { hash: sent.hash };
}

// ---- Real-time events -------------------------------------------------------
// Pull recent `pledge` / `withdraw` events emitted by the contract. The UI polls
// this to render a live feed and keep the progress bar in sync with chain state.
export async function fetchRecentEvents(lookbackLedgers = 8000) {
  const latest = await rpc.getLatestLedger();
  const startLedger = Math.max(latest.sequence - lookbackLedgers, 1);

  let page;
  try {
    page = await rpc.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
      limit: 100,
    });
  } catch (e) {
    // Window too wide for the RPC's retention — retry with a smaller one.
    const retry = await rpc.getEvents({
      startLedger: Math.max(latest.sequence - 2000, 1),
      filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
      limit: 100,
    });
    page = retry;
  }

  return (page.events || []).map(parseEvent).filter(Boolean);
}

function parseEvent(ev) {
  try {
    const topics = ev.topic.map((t) => StellarSdk.scValToNative(t));
    const kind = topics[0]; // "pledge" | "withdraw"
    const who = topics[1]; // address string
    const value = StellarSdk.scValToNative(ev.value);

    if (kind === "pledge") {
      const [amount, total] = value; // vec [amount, running_total]
      return {
        id: ev.id,
        kind,
        who,
        amount: BigInt(amount),
        total: BigInt(total),
        ledger: ev.ledger,
        at: ev.ledgerClosedAt,
      };
    }
    if (kind === "withdraw") {
      return {
        id: ev.id,
        kind,
        who,
        amount: BigInt(value),
        ledger: ev.ledger,
        at: ev.ledgerClosedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

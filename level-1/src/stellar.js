import * as StellarSdk from "@stellar/stellar-sdk";

// ---- Testnet configuration --------------------------------------------------
// This dApp is testnet-only. Never point this at mainnet without an audit.
export const NETWORK = {
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: StellarSdk.Networks.TESTNET,
  friendbotUrl: "https://friendbot.stellar.org",
  explorerTx: (hash) =>
    `https://stellar.expert/explorer/testnet/tx/${hash}`,
};

export const horizon = new StellarSdk.Horizon.Server(NETWORK.horizonUrl);

// ---- Balances ---------------------------------------------------------------
// Returns the native XLM balance as a string, or null when the account has not
// been created/funded yet (Horizon replies 404 for unfunded accounts).
export async function getXlmBalance(address) {
  try {
    const account = await horizon.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native ? native.balance : "0";
  } catch (error) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
}

// ---- Friendbot funding (fund your wallet) -----------------------------------
export async function fundWithFriendbot(address) {
  const res = await fetch(`${NETWORK.friendbotUrl}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    // Friendbot returns 400 if the account is already funded.
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail || body?.title || `HTTP ${res.status}`;
    throw new Error(`Friendbot funding failed: ${detail}`);
  }
  return res.json();
}

// ---- Build a native XLM payment transaction ---------------------------------
// Returns unsigned XDR, ready to hand to the wallet for signing.
export async function buildPaymentXdr(source, destination, amount) {
  const account = await horizon.loadAccount(source);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK.networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination,
        asset: StellarSdk.Asset.native(),
        amount, // string, e.g. "10.5"
      })
    )
    .setTimeout(180)
    .build();

  return tx.toXDR();
}

// ---- Submit a signed transaction --------------------------------------------
export async function submitSignedXdr(signedXdr) {
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK.networkPassphrase
  );
  const res = await horizon.submitTransaction(tx);
  return { hash: res.hash, ledger: res.ledger };
}

// ---- Validation helpers -----------------------------------------------------
export function isValidStellarAddress(address) {
  try {
    StellarSdk.StrKey.decodeEd25519PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Turn Horizon's verbose error into something a human can read.
export function readableSubmitError(error) {
  const codes = error?.response?.data?.extras?.result_codes;
  if (codes) {
    if (codes.operations?.includes("op_underfunded")) {
      return "Insufficient balance to cover the payment plus fees.";
    }
    if (codes.operations?.includes("op_no_destination")) {
      return "Destination account does not exist on testnet yet (it must be funded first).";
    }
    if (codes.transaction === "tx_bad_seq") {
      return "Bad sequence number — please retry.";
    }
    return `Transaction rejected: ${JSON.stringify(codes)}`;
  }
  return error?.message || "Unknown error submitting transaction.";
}

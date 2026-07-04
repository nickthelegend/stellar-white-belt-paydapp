import * as StellarSdk from "@stellar/stellar-sdk";

// ---- Testnet configuration --------------------------------------------------
// This dApp is testnet-only. Never point it at mainnet without an audit.
export const NETWORK = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: StellarSdk.Networks.TESTNET,
  explorerTx: (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  explorerContract: (id) =>
    `https://stellar.expert/explorer/testnet/contract/${id}`,
};

// The crowdfunding contract deployed by `contract/` (see README).
export const CONTRACT_ID =
  import.meta.env.VITE_CONTRACT_ID ||
  "CC33YCA6YIRR7AD4DMQ3LSNXF6REZCBFLOOYIOXPYJ6HBVP3SITBEZBO";

// Native XLM has 7 decimals; the contract accounts in stroops.
export const DECIMALS = 7;
export const STROOPS = 10 ** DECIMALS;

export const rpc = new StellarSdk.rpc.Server(NETWORK.rpcUrl);

// stroops (bigint/number/string) -> human XLM string
export function toXlm(stroops) {
  return (Number(stroops) / STROOPS).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

// human XLM string -> stroops as bigint
export function toStroops(xlm) {
  return BigInt(Math.round(Number(xlm) * STROOPS));
}

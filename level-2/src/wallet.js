import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit";

// One kit instance for the whole app. `allowAllModules()` enables every wallet
// the kit knows about (Freighter, xBull, Albedo, LOBSTR, Rabet, Hana, …), so the
// selector modal shows all installed options.
export const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: FREIGHTER_ID,
  modules: allowAllModules(),
});

// Opens the multi-wallet picker. Resolves with the connected address, or throws
// a WalletError the UI can translate into a friendly message.
export function openWalletPicker() {
  return new Promise((resolve, reject) => {
    kit
      .openModal({
        onWalletSelected: async (option) => {
          try {
            kit.setWallet(option.id);
            const { address } = await kit.getAddress();
            resolve({ address, walletId: option.id, walletName: option.name });
          } catch (e) {
            reject(new WalletError(walletErrorMessage(e), e));
          }
        },
        onClosed: () => reject(new WalletError("Wallet selection cancelled.")),
      })
      .catch((e) => reject(new WalletError(walletErrorMessage(e), e)));
  });
}

// Ask the connected wallet to sign a transaction XDR. Throws WalletError on
// rejection so callers can distinguish "user said no" from a real failure.
export async function signWithWallet(xdr, networkPassphrase) {
  try {
    const { signedTxXdr } = await kit.signTransaction(xdr, {
      networkPassphrase,
    });
    return signedTxXdr;
  } catch (e) {
    throw new WalletError(walletErrorMessage(e), e);
  }
}

// A tagged error type so the UI can render wallet problems distinctly.
export class WalletError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "WalletError";
    this.cause = cause;
  }
}

// Normalise the many shapes of wallet errors into human text. Covers the three
// required categories: not found/installed, user-rejected, and generic.
export function walletErrorMessage(e) {
  const raw = (e?.message || e?.toString() || "").toLowerCase();

  if (
    raw.includes("not installed") ||
    raw.includes("not found") ||
    raw.includes("no wallet") ||
    raw.includes("could not be found")
  ) {
    return "Wallet not found. Install a Stellar wallet (e.g. Freighter) and reload.";
  }
  if (
    raw.includes("reject") ||
    raw.includes("denied") ||
    raw.includes("declined") ||
    raw.includes("cancel") ||
    raw.includes("user closed")
  ) {
    return "Request rejected in the wallet.";
  }
  return e?.message || "Something went wrong talking to the wallet.";
}

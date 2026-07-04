import { useState, useEffect, useCallback } from "react";
import {
  isConnected,
  getAddress,
  requestAccess,
  getNetwork,
  signTransaction,
} from "@stellar/freighter-api";
import {
  NETWORK,
  getXlmBalance,
  fundWithFriendbot,
  buildPaymentXdr,
  submitSignedXdr,
  isValidStellarAddress,
  readableSubmitError,
} from "./stellar";

const shorten = (a) => (a ? `${a.slice(0, 5)}…${a.slice(-5)}` : "");

export default function App() {
  const [address, setAddress] = useState(null);
  const [walletNetwork, setWalletNetwork] = useState(null);
  const [balance, setBalance] = useState(null); // string | null (unfunded)
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [funding, setFunding] = useState(false);
  const [globalError, setGlobalError] = useState("");

  // Payment form
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  // tx feedback: { state: "pending" | "success" | "error", message, hash? }
  const [tx, setTx] = useState(null);

  const connected = Boolean(address);
  const wrongNetwork =
    walletNetwork && walletNetwork.toUpperCase() !== "TESTNET";

  const refreshBalance = useCallback(async (addr) => {
    if (!addr) return;
    setLoadingBalance(true);
    try {
      const bal = await getXlmBalance(addr);
      setBalance(bal);
    } catch (e) {
      setGlobalError(e.message || "Failed to load balance.");
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // Silently restore an already-authorized session on load.
  useEffect(() => {
    (async () => {
      const { isConnected: installed } = await isConnected();
      if (!installed) return;
      const { address: addr } = await getAddress();
      if (!addr) return;
      const { network } = await getNetwork();
      setAddress(addr);
      setWalletNetwork(network);
      refreshBalance(addr);
    })();
  }, [refreshBalance]);

  const connect = async () => {
    setGlobalError("");
    try {
      const { isConnected: installed } = await isConnected();
      if (!installed) {
        setGlobalError(
          "Freighter not detected. Install it from freighter.app and refresh."
        );
        return;
      }
      const { address: addr, error } = await requestAccess();
      if (error) throw new Error(error.message || String(error));
      const { network } = await getNetwork();
      setAddress(addr);
      setWalletNetwork(network);
      refreshBalance(addr);
    } catch (e) {
      setGlobalError(e.message || "Failed to connect wallet.");
    }
  };

  const disconnect = () => {
    setAddress(null);
    setWalletNetwork(null);
    setBalance(null);
    setTx(null);
    setDestination("");
    setAmount("");
    setGlobalError("");
  };

  const fund = async () => {
    if (!address) return;
    setFunding(true);
    setGlobalError("");
    try {
      await fundWithFriendbot(address);
      await refreshBalance(address);
    } catch (e) {
      setGlobalError(e.message);
    } finally {
      setFunding(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    setTx(null);
    setGlobalError("");

    const dest = destination.trim();
    if (!isValidStellarAddress(dest)) {
      setTx({ state: "error", message: "Enter a valid Stellar public key (starts with G…)." });
      return;
    }
    if (dest === address) {
      setTx({ state: "error", message: "Destination can't be your own address." });
      return;
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setTx({ state: "error", message: "Enter an amount greater than 0." });
      return;
    }

    setSending(true);
    try {
      setTx({ state: "pending", message: "Building transaction…" });
      const xdr = await buildPaymentXdr(address, dest, amount.trim());

      setTx({ state: "pending", message: "Waiting for you to sign in Freighter…" });
      const { signedTxXdr, error } = await signTransaction(xdr, {
        networkPassphrase: NETWORK.networkPassphrase,
        address,
      });
      if (error) throw new Error(error.message || String(error));

      setTx({ state: "pending", message: "Submitting to the Stellar testnet…" });
      const { hash } = await submitSignedXdr(signedTxXdr);

      setTx({
        state: "success",
        message: `Sent ${amount.trim()} XLM to ${shorten(dest)}`,
        hash,
      });
      setAmount("");
      setDestination("");
      refreshBalance(address);
    } catch (err) {
      setTx({ state: "error", message: readableSubmitError(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <div className="stars" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="logo">✦</span>
          <div>
            <h1>StarPay</h1>
            <p className="tagline">Stellar Testnet Payment dApp</p>
          </div>
        </div>

        {connected ? (
          <div className="wallet-chip">
            <span className="dot" />
            <span className="mono">{shorten(address)}</span>
            <button className="ghost" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="primary" onClick={connect}>
            Connect Freighter
          </button>
        )}
      </header>

      <main className="content">
        {globalError && <div className="banner error">{globalError}</div>}
        {wrongNetwork && (
          <div className="banner warn">
            Your wallet is on <b>{walletNetwork}</b>. Switch Freighter to
            <b> Testnet</b> to use this app.
          </div>
        )}

        {!connected ? (
          <section className="card hero">
            <h2>Send XLM on the Stellar testnet</h2>
            <p>
              Connect your Freighter wallet to check your balance and send a
              test payment. Everything here runs on <b>testnet</b> — no real
              funds involved.
            </p>
            <button className="primary big" onClick={connect}>
              Connect Freighter
            </button>
            <p className="hint">
              Don’t have it? Get the wallet at{" "}
              <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
                freighter.app
              </a>
            </p>
          </section>
        ) : (
          <div className="grid">
            {/* Balance card */}
            <section className="card">
              <div className="card-head">
                <h3>Your Balance</h3>
                <button
                  className="ghost small"
                  onClick={() => refreshBalance(address)}
                  disabled={loadingBalance}
                >
                  {loadingBalance ? "…" : "Refresh"}
                </button>
              </div>

              {balance === null ? (
                <>
                  <p className="balance muted">Not funded yet</p>
                  <p className="hint">
                    This account doesn’t exist on testnet. Fund it to get
                    started.
                  </p>
                </>
              ) : (
                <p className="balance">
                  {Number(balance).toLocaleString(undefined, {
                    maximumFractionDigits: 7,
                  })}{" "}
                  <span className="unit">XLM</span>
                </p>
              )}

              <button className="secondary" onClick={fund} disabled={funding}>
                {funding ? "Funding…" : "Fund with Friendbot"}
              </button>
              <p className="addr mono">{address}</p>
            </section>

            {/* Send card */}
            <section className="card">
              <div className="card-head">
                <h3>Send Payment</h3>
              </div>
              <form onSubmit={send} className="form">
                <label>
                  Destination address
                  <input
                    type="text"
                    placeholder="G… recipient public key"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Amount (XLM)
                  <input
                    type="number"
                    min="0"
                    step="0.0000001"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  type="submit"
                  disabled={sending || wrongNetwork}
                >
                  {sending ? "Processing…" : "Send XLM"}
                </button>
              </form>

              {tx && (
                <div className={`tx ${tx.state}`}>
                  <div className="tx-row">
                    <span className="tx-icon">
                      {tx.state === "success" ? "✓" : tx.state === "error" ? "✕" : "⏳"}
                    </span>
                    <span>{tx.message}</span>
                  </div>
                  {tx.hash && (
                    <div className="tx-hash">
                      <span className="mono">{tx.hash}</span>
                      <a
                        href={NETWORK.explorerTx(tx.hash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on Explorer ↗
                      </a>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="footer">
        <span>Built on Stellar Testnet · White Belt · Level 1</span>
      </footer>
    </div>
  );
}

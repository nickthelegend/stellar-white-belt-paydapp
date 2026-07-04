import { useCallback, useEffect, useRef, useState } from "react";
import { NETWORK, CONTRACT_ID, toXlm, toStroops } from "./config.js";
import { kit, openWalletPicker, signWithWallet, WalletError } from "./wallet.js";
import {
  getState,
  getPledgedBy,
  buildPledgeXdr,
  submitSignedXdr,
  fetchRecentEvents,
} from "./crowdfund.js";

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "");

// Sample contract-call tx (a pledge) — verifiable on the explorer. See README.
const SAMPLE_TX =
  "cd00f271fc7b5c7d9e88dd9c4df5ffa59526fbe33b614dd42c0ead8428b72364";

export default function App() {
  const [wallet, setWallet] = useState(null); // { address, walletName }
  const [state, setState] = useState(null); // campaign snapshot
  const [mine, setMine] = useState(0n);
  const [events, setEvents] = useState([]);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState(null); // { kind, msg, hash? }
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  // ---- Load + refresh campaign state and live events ----
  const refresh = useCallback(async () => {
    try {
      const [s, evs] = await Promise.all([getState(), fetchRecentEvents()]);
      setState(s);
      setEvents(
        evs
          .sort((a, b) => Number(b.ledger) - Number(a.ledger))
          .slice(0, 20)
      );
    } catch (e) {
      // Non-fatal: keep last good state, surface nothing intrusive.
      console.warn("refresh failed", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 6000); // real-time-ish sync
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  useEffect(() => {
    if (wallet?.address) getPledgedBy(wallet.address).then(setMine).catch(() => {});
  }, [wallet, events]);

  // ---- Wallet ----
  async function connect() {
    setStatus(null);
    try {
      const w = await openWalletPicker();
      setWallet(w);
    } catch (e) {
      if (e instanceof WalletError && /cancelled/i.test(e.message)) return;
      setStatus({ kind: "error", msg: e.message });
    }
  }

  function disconnect() {
    kit.disconnect?.();
    setWallet(null);
    setMine(0n);
  }

  // ---- Pledge flow with full status tracking ----
  async function pledge() {
    setStatus(null);

    if (!wallet?.address) {
      setStatus({ kind: "error", msg: "Connect a wallet first." });
      return;
    }
    const n = Number(amount);
    if (!amount || isNaN(n) || n <= 0) {
      setStatus({ kind: "error", msg: "Enter an amount greater than zero." });
      return;
    }

    setBusy(true);
    try {
      setStatus({ kind: "pending", msg: "Building transaction & simulating…" });
      const xdr = await buildPledgeXdr(wallet.address, toStroops(amount));

      setStatus({ kind: "pending", msg: "Waiting for you to sign in the wallet…" });
      const signed = await signWithWallet(xdr, NETWORK.networkPassphrase);

      setStatus({ kind: "pending", msg: "Submitting to the network…" });
      const { hash } = await submitSignedXdr(signed);

      setStatus({
        kind: "success",
        msg: `Pledged ${amount} XLM! Confirmed on-chain.`,
        hash,
      });
      setAmount("");
      refresh();
    } catch (e) {
      setStatus({ kind: "error", msg: e.message || "Pledge failed." });
    } finally {
      setBusy(false);
    }
  }

  // ---- Derived campaign values ----
  const raised = state ? Number(state.raised) : 0;
  const goal = state ? Number(state.goal) : 0;
  const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const deadline = state ? new Date(Number(state.deadline) * 1000) : null;
  const ended = deadline ? Date.now() > deadline.getTime() : false;

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <div className="mark">◎</div>
          <div>
            <h1>LumenFund</h1>
            <div className="tag">On-chain crowdfunding on Soroban</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="net-pill">Testnet</span>
          {wallet ? (
            <div className="wallet-chip">
              <span className="dot" />
              <code title={wallet.address}>{short(wallet.address)}</code>
              <button className="btn-ghost" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn-gold" onClick={connect}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <div className="grid">
        {/* ---- Left: campaign + pledge ---- */}
        <section className="card">
          <h2>
            Community Star Fund <span className="sub">· testnet demo</span>
          </h2>

          <div className="raised">
            <span className="big">{toXlm(raised)}</span>
            <span className="of">/ {toXlm(goal)} XLM raised</span>
          </div>

          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>

          <div className="stat-row">
            <div className="stat">
              <div className="k">{pct.toFixed(1)}%</div>
              <div className="l">of goal</div>
            </div>
            <div className="stat">
              <div className="k">{state ? state.backers : "—"}</div>
              <div className="l">backers</div>
            </div>
            <div className="stat">
              <div className="k">{ended ? "Closed" : "Open"}</div>
              <div className="l">
                {deadline
                  ? `until ${deadline.toLocaleDateString()}`
                  : "loading…"}
              </div>
            </div>
            {wallet && (
              <div className="stat">
                <div className="k">{toXlm(Number(mine))}</div>
                <div className="l">your pledge</div>
              </div>
            )}
          </div>

          <div style={{ height: 22 }} />

          <div className="field">
            <label>Pledge amount</label>
            <div className="amount-input">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                placeholder="0.0"
                value={amount}
                disabled={busy || ended}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="unit">XLM</span>
            </div>
          </div>

          <div className="quick">
            {[5, 25, 100].map((v) => (
              <button
                key={v}
                disabled={busy || ended}
                onClick={() => setAmount(String(v))}
              >
                {v} XLM
              </button>
            ))}
          </div>

          <button
            className="btn-gold full"
            onClick={pledge}
            disabled={busy || ended || !wallet}
          >
            {ended
              ? "Campaign closed"
              : !wallet
              ? "Connect a wallet to pledge"
              : busy
              ? "Processing…"
              : "Pledge XLM"}
          </button>

          {status && (
            <div className={`status ${status.kind}`}>
              {status.kind === "pending" && <span className="spinner" />}
              <div>
                {status.msg}
                {status.hash && (
                  <>
                    {" "}
                    <a
                      href={NETWORK.explorerTx(status.hash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View transaction ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ---- Right: live event feed ---- */}
        <section className="card">
          <div className="feed-head">
            <h2 style={{ margin: 0 }}>Activity</h2>
            <span className="live">
              <span className="pulse" /> Live
            </span>
          </div>

          <div className="feed">
            {events.length === 0 && (
              <div className="empty">
                No pledges yet — be the first to back this fund.
              </div>
            )}
            {events.map((ev) => (
              <div
                key={ev.id}
                className={`event ${ev.kind === "withdraw" ? "withdraw" : ""}`}
              >
                <div className="ico">{ev.kind === "withdraw" ? "🏦" : "✦"}</div>
                <div>
                  <div className="who">{short(ev.who)}</div>
                  <div className="meta">
                    {ev.kind === "withdraw" ? "withdrew funds" : "pledged"} · ledger{" "}
                    {ev.ledger}
                  </div>
                </div>
                <div className="amt">+{toXlm(Number(ev.amount))} XLM</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---- Contract facts ---- */}
      <section className="card facts" style={{ marginTop: 20 }}>
        <div className="fact">
          <span className="l">Contract</span>
          <a
            href={NETWORK.explorerContract(CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
          >
            {CONTRACT_ID}
          </a>
        </div>
        <div className="fact">
          <span className="l">Sample contract call (pledge)</span>
          <a href={NETWORK.explorerTx(SAMPLE_TX)} target="_blank" rel="noreferrer">
            {short(SAMPLE_TX)} ↗
          </a>
        </div>
        <div className="fact">
          <span className="l">Network</span>
          <code>Stellar Testnet · Soroban RPC</code>
        </div>
      </section>

      <footer className="foot">
        Level 2 · Yellow Belt — multi-wallet + deployed Soroban contract + live
        events. Testnet only; get free test XLM from{" "}
        <a href="https://friendbot.stellar.org" target="_blank" rel="noreferrer">
          Friendbot
        </a>
        .
      </footer>
    </div>
  );
}

# ✦ StarPay — Stellar Testnet Payment dApp

> **Level 1 · White Belt submission** — Stellar Journey to Mastery

StarPay is a beginner-friendly Stellar dApp running entirely on **Testnet**. It lets
you connect the Freighter wallet, fund your account, see your XLM balance, and send
an XLM payment to any address — with clear success / failure feedback and a link to
the transaction on a block explorer.

**Live demo:** https://nickthelegend.github.io/stellar-white-belt-paydapp/
_(goes live after the GitHub Pages deploy finishes — see [Deploy](#deploy))_

---

## What it does

| Requirement | How StarPay meets it |
| --- | --- |
| **Wallet setup** | Uses the [Freighter](https://www.freighter.app/) browser wallet on the Stellar **Testnet**. |
| **Wallet connect / disconnect** | "Connect Freighter" requests access; "Disconnect" clears the session in-app. Existing sessions are silently restored on reload. |
| **Fund your wallet** | One-click **Fund with Friendbot** creates & funds the account with test XLM. |
| **Balance handling** | Fetches the native XLM balance from Horizon and displays it, with a Refresh button. Unfunded accounts are handled gracefully. |
| **Transaction flow** | Builds a native payment, signs it in Freighter, submits to Testnet, and shows a **pending → success / error** state with the **transaction hash** and an explorer link. |
| **Error handling** | Address validation, wrong-network warning, self-send guard, friendly Horizon error messages (underfunded, missing destination, etc.). |

## Screenshots

| Wallet connected | Balance displayed | Successful transaction |
| --- | --- | --- |
| ![Wallet connected](screenshots/1-connected.png) | ![Balance displayed](screenshots/2-balance.png) | ![Successful transaction](screenshots/3-transaction.png) |

> Landing page:
>
> ![Landing page](screenshots/0-landing.png)

## Tech stack

- **React 18** + **Vite 6**
- [`@stellar/stellar-sdk`](https://github.com/stellar/js-stellar-sdk) — build & submit transactions, read balances via Horizon
- [`@stellar/freighter-api`](https://github.com/stellar/freighter) — wallet connect & signing
- Plain CSS (no UI framework)

## Project structure

```
level-1/
├── index.html
├── src/
│   ├── main.jsx        # React entry
│   ├── App.jsx         # UI: connect, balance, fund, send, tx feedback
│   ├── stellar.js      # Testnet config + SDK helpers (balance, build, submit)
│   └── index.css       # Space-themed styling
├── vite.config.js
└── package.json
```

## Setup — run locally

**Prerequisites:** Node.js 20+ and the [Freighter](https://www.freighter.app/) browser
extension set to **Testnet**.

```bash
# 1. Clone and enter the project
git clone https://github.com/nickthelegend/stellar-white-belt-paydapp.git
cd stellar-white-belt-paydapp/level-1

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open the printed URL (default http://localhost:5173) in a browser that has Freighter
installed.

### Using the app

1. **Connect Freighter** — approve the connection in the extension popup.
2. **Fund with Friendbot** — if the account is new, this gives you 10,000 test XLM.
3. **See your balance** — shown in the Balance card; hit **Refresh** any time.
4. **Send a payment** — paste a destination `G…` address, enter an amount, click
   **Send XLM**, and approve in Freighter. On success you'll see the transaction hash
   and an explorer link.

> Tip: to test a payment to yourself/a second account, create another account in
> Freighter, fund it with Friendbot, and send between them.

### Production build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

## Deploy

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds
`level-1/` and publishes it to **GitHub Pages** on every push to `main`.

To enable it: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
The workflow sets the correct base path automatically from the repo name.

You can also deploy the `level-1/dist/` folder to Netlify, Vercel, or any static host.

## Network

StarPay is **Testnet-only** by design.

- Horizon: `https://horizon-testnet.stellar.org`
- Network passphrase: `Test SDF Network ; September 2015`
- Friendbot: `https://friendbot.stellar.org`
- Explorer: `https://stellar.expert/explorer/testnet`

## License

MIT — do whatever you like with it.

# Screenshots to add

The README embeds four images from this folder. Drop your captures here with these
**exact filenames** and they'll show up automatically:

| Filename | What to capture |
| --- | --- |
| `0-landing.png` | The landing page before connecting (optional — a real one is nice). |
| `1-connected.png` | The app after clicking **Connect Freighter** — showing your shortened `G…` address in the top-right wallet chip. |
| `2-balance.png` | The **Balance card** showing your XLM balance after funding with Friendbot. |
| `3-transaction.png` | The green **success** state after sending XLM — showing the message + **transaction hash** and the "View on Explorer" link. |

## Fastest way to capture all four

1. `cd level-1 && npm run dev`, open the app with Freighter set to **Testnet**.
2. Click **Connect Freighter**, approve → screenshot → `1-connected.png`.
3. Click **Fund with Friendbot**, wait for the balance → screenshot → `2-balance.png`.
4. Send a small amount (e.g. `1` XLM) to a second testnet account, approve in
   Freighter, wait for the green success box with the hash → screenshot →
   `3-transaction.png`.

On macOS: `Cmd + Shift + 4` then drag to select the area. Save/rename into this folder.

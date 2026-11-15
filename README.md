# Holdfast

A local island-building and savings **demo**. Deposits, withdrawals and awarded cash rewards are simulated; no real money moves and no bank details are collected. Game gold is a separate, non-cash resource for building and decorating.

## Run

Use Node.js 22 or newer, then run:

```sh
node server.mjs
```

Open the local URL printed by the server (by default `http://127.0.0.1:3000`). The server listens only on the local computer; the `PORT` environment variable can select a different port. Run the automated checks with:

```sh
node --test tests/*.test.mjs
```

If npm is installed, `npm start` and `npm test` run the same commands. The project uses Node's built-in server and test tools. No payment credentials are needed for the demo.

## What is included

- A free starter cabin and island naming before any deposit.
- Construction and gold progress while away, including when savings are zero.
- Editable savings goals and a weekly plan. The plan does **not** initiate transfers.
- Short money lessons, island themes and decorations.
- Read-only island postcards that exclude financial balances.
- Withdrawal celebrations that preserve the island and earned items.
- A weekly recap of actual island progress and already awarded demo rewards.
- Deposit and shop icons beside their respective balances, with a £1 minimum deposit.

## State and rewards

The server owns demo wallet balances, transactions and cash awards, persisted in `.data/demo-wallets.json`. Browser storage holds the cosmetic island and personal plan; editing it must not change wallet funds. A private guest-session cookie identifies the wallet across restarts. Losing that cookie or using another browser profile creates a different demo wallet. A demo guest session is not a verified banking identity.

Legacy island progress is migrated without deleting the original local save. Old browser-controlled money amounts are not treated as authoritative server funds.

The welcome allowance and ongoing balance-time allowance are internal reward budgets. They are **not** advertised interest rates, guaranteed returns or a promised cash schedule. The interface reveals a cash surprise only after it has been awarded. Awards are not increased by splitting deposits or repeatedly withdrawing and redepositing. Already awarded rewards remain separate from savings and game gold.

## Banking integration

The existing regulated banking partnership is independent of this local demo. Live bank connection is intentionally deferred while the game experience is built. No live partner adapter is connected here. That later integration will use the provider's documented authentication, account mapping, confirmed payment events, idempotent webhooks, reconciliation and payout authorisation. The demo does not claim that a bank connection, real payout or automatic savings transfer is active.

## Verification

Automated verification runs in Node and includes model, ledger, HTTP and app-behavior checks. The app tests use a minimal DOM substitute, so they do not verify visual layout. Browser visual verification has not been performed: the available preview environment blocked local-file navigation. Do not bypass that browser policy.

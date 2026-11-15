# Holdfast

An island-building savings game built around **real deposits, withdrawals and cash rewards** through the existing banking partnership. Game gold is a separate, non-cash resource used to build and decorate the island.

## Current connection status

Bank integration is intentionally deferred while the game experience is completed. The provider adapter is not configured in this repository yet. Financial APIs remain unavailable until it is connected; they do not create substitute balances, deposits, withdrawals or cash awards. An unavailable balance is shown as unknown, rather than as an invented amount. Island building remains available.

## Run

Use Node.js 22 or newer:

```sh
node server.mjs
```

Open the local URL printed by the server, normally `http://127.0.0.1:3000`. The `PORT` environment variable selects a different local port. Running the server does not activate bank payments by itself.

Run the automated checks with:

```sh
node --test tests/*.test.mjs
```

`npm start` and `npm test` are equivalent aliases if npm is installed. No third-party packages are required.

## Game features

- A free starter cabin, island naming and progress while away, including at a zero savings balance.
- Editable savings goals and a weekly plan. The plan does not initiate transfers.
- Short money lessons, themes and decorations.
- Read-only island postcards that exclude savings, goals and wallet activity.
- Withdrawal celebrations that preserve earned island items.
- An island journal showing progress and confirmed cash awards.
- Deposit and shop icons beside their respective balances, with a £1 minimum deposit.

## Money and rewards

Verified customer identity, confirmed bank balances and payment receipts are authoritative. Browser storage contains the island and personal plan, not spendable money. A submitted deposit or withdrawal is a request; only confirmation from the banking backend can mark it completed or change the displayed financial balance. Pending payments remain pending.

Cash rewards are real, company-funded payments, separate from game gold. The £10 welcome allowance and up-to-10%-annually balance-time allowance are **internal spending ceilings**, not advertised rates, guaranteed returns or a promised payment schedule. A cash surprise appears only after the backend confirms it has been credited. Deposit attempts and game actions cannot mint cash rewards.

Legacy island progress is preserved. Previously generated local test money and browser-controlled money values are never imported as real balances; existing files are left intact.

## Provider integration

`lib/banking-service.mjs` defines the boundary between the game and the banking partner. The adapter supplies trusted customer authentication, confirmed GBP wallet snapshots, deposit and withdrawal requests, account connection and confirmed reward checks. Payment requests carry idempotency references. Bank authentication redirects must use configured HTTPS origins.

Set `BANKING_ADAPTER_MODULE` to the server-side ES module for the partner integration. It exports the adapter as its default export and an `allowedActionOrigins` array of approved HTTPS origins. Partner credentials and authentication stay on the server. With this setting absent, financial APIs return `BANKING_NOT_CONFIGURED` rather than generating money.

The partner-specific adapter, customer authentication and confirmed-payment handling still need to be connected using the existing provider's API. No live deposit or payout is claimed to be active before that connection is complete.

## Verification

Automated checks cover game progression, financial service contracts, request handling and application behaviour. Provider fixtures exist only in tests. Application tests use a minimal DOM substitute and do not verify layout. Browser visual verification has not been performed because the available preview environment blocked local-file navigation.

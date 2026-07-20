# Chess

Chess is an LNbits WebAssembly extension for paid public chess games where the
winner takes the pot minus the configured haircut.

An LNbits user enables the extension, chooses the haircut percentage, creates a
game with a join amount, and shares the public game link. Two players join by
entering a Lightning address and paying the generated invoice. Once both join
payments settle, the players are assigned white and black and play from the
public page. Checkmate or resignation marks the winner, and the admin can settle
the payout from the games table.

## Extension Details

- Extension ID: `chesswasm`
- Extension type: `wasm`
- Minimum LNbits version: `1.5.5`
- Admin route: `/ext/chesswasm`
- Public game route: `/ext/chesswasm/games/{game_id}`
- WASM module: `wasm/module.wasm`

## Permissions

This extension requests:

- `ext.storage.read` and `ext.storage.write` for settings, games, players, moves,
  and payout state.
- `ext.storage.read_public` for the public game page.
- `wallet.list` so the admin UI can use the installing user's wallet.
- `wallet.create_invoice_public` to create public join invoices.
- `wallet.pay_invoice` to pay the winner's Lightning address.

## How It Works

1. Open the Chess extension in LNbits.
2. Enable chess games and set the haircut percentage.
3. Create a game with a title and join amount.
4. Share the public game link with the two players.
5. Each player enters a Lightning address and pays the join invoice.
6. After payment, each player's browser keeps a private `#playerToken=...`
   fragment in the URL. That private player link is needed to make moves.
7. White moves first. Players drag or click pieces on the public board.
8. When the game ends, the admin settles the payout from the admin game list.

Admins can delete waiting, active, completed, or drawn games from the game list.
Completed games with a pending winner payout must be settled before deletion.

The copied public link removes the private player token, so it is safe to share
with the other player or spectators.

## Current Chess Rules

The backend validates all moves before recording them. The board supports legal
move hints, drag-and-drop, click-to-move, checkmate, stalemate, resignation, pawn
promotion to queen by default, and en passant. Castling is not implemented yet.

## Build

From this extension's development directory:

```bash
cd lnbits/extensions/chesswasm/dev
npm run build:wasm
```

The build writes the installable component to `../wasm/module.wasm`.

Static UI changes in `static/` do not require a WASM rebuild, but LNbits or the
browser may need a hard refresh to pick up changed assets.

## Install Notes

For local development inside an LNbits checkout, keep this directory at:

```text
lnbits/extensions/chesswasm
```

Then restart LNbits or reload the extension after rebuilding `wasm/module.wasm`.
If permissions change, update the installed extension permissions in LNbits so
the runtime grants the new host calls.

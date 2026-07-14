# Chess WASM

Chess WASM is an LNbits WebAssembly extension for paid public chess games.

An authenticated owner configures a receiving wallet, join amount, and haircut.
The owner creates a game and shares its public link with two players. Each
player enters a Lightning address and pays the join invoice. Once both payments
settle, players are assigned white and black, play from the public page, and the
winner is recorded. The owner can then settle the pending payout from the admin
table.

## Build

```bash
cd lnbits/extensions/chesswasm/dev
npm run build:wasm
```

The build writes `../wasm/module.wasm`.

## Notes

- Player turns use public extension API calls plus polling from the iframe.
- The browser stores the paid player's payment hash as a local move token.
- The backend validates moves and records pending payout after checkmate or resignation.
- Winner payouts are sent from the authenticated admin settle action.
- Castling is not implemented in this first component.

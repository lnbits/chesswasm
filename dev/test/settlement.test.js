import assertModule from 'assert'
import {promises as fs} from 'fs'

const assert = assertModule.strict
let source = await fs.readFile(new URL('../src/index.js', import.meta.url), 'utf8')
source = source.replace(/^import .*\n\n/, '').replace(/export function /g, 'function ')

const rows = new Map()
const storage = {
  get(table, id, fallback) {
    return rows.get(`${table}:${id}`) || fallback
  },
  getPaginated(table, options = {}) {
    const data = [...rows.entries()]
      .filter(([key, value]) =>
        key.startsWith(`${table}:`) &&
        Object.entries(options.filters || {}).every(
          ([field, expected]) => value[field] === expected
        )
      )
      .map(([, value]) => value)
    return {data, total: data.length}
  },
  set(table, row) {
    rows.set(`${table}:${row.id}`, row)
  }
}
let payoutCalls = 0
const wallet = {
  payLnurl(request) {
    payoutCalls += 1
    assert.equal(request.amount, 36)
    return {ok: true, checkingId: 'payout_1', paymentHash: 'hash_1', status: 'success'}
  }
}
const websocket = {publish() {}}
const system = {now: () => 1_784_736_605, log() {}}
const api = Function(
  'storage', 'system', 'wallet', 'websocket',
  `${source}; return {makeChessMove, settlePlayerChessPayout}`
)(storage, system, wallet, websocket)

rows.set('chess_settings:chesswasm-settings', {
  id: 'chesswasm-settings',
  wallet_id: 'wallet_1'
})
rows.set('chess_games:chess_1', {
  id: 'chess_1',
  settings_id: 'chesswasm-settings',
  wallet_id: 'wallet_1',
  name: 'Paid chess game',
  join_amount: 20,
  haircut: 10,
  players_count: 2,
  status: 'active',
  white_ln_address: 'white@example.com',
  black_ln_address: 'black@example.com',
  white_payment_hash: 'white_token',
  black_payment_hash: 'black_token',
  winner_color: '',
  winner_ln_address: '',
  payout_pending: false,
  payout_status: '',
  fen: '5bn1/2Q2Q2/k1N4r/1p6/pnB3pp/4R3/PPP3PP/RNBK4 w - - 1 30',
  pgn: '',
  turn: 'white',
  move_count: 58,
  completed_at: 0
})

const move = JSON.parse(api.makeChessMove(JSON.stringify({
  gameId: 'chess_1',
  playerToken: 'white_token',
  from: 'c7',
  to: 'a7'
})))
assert.equal(move.ok, true, move.error)
assert.equal(move.data.game.status, 'completed')
assert.equal(move.data.game.payoutStatus, 'pending')
assert.equal(move.data.payout.pending, true)
assert.equal(payoutCalls, 0, 'The final move must not pay inside its fuel budget.')

const settlement = JSON.parse(api.settlePlayerChessPayout(JSON.stringify({
  gameId: 'chess_1',
  playerToken: 'white_token'
})))
assert.equal(settlement.ok, true, settlement.error)
assert.equal(settlement.data.payout.ok, true)
assert.equal(settlement.data.game.payoutStatus, 'paid')
assert.equal(settlement.data.game.payoutPending, false)
assert.equal(payoutCalls, 1)

const repeated = JSON.parse(api.settlePlayerChessPayout(JSON.stringify({
  gameId: 'chess_1',
  playerToken: 'white_token'
})))
assert.equal(repeated.ok, true, repeated.error)
assert.equal(repeated.data.payout.alreadySettled, true)
assert.equal(payoutCalls, 1, 'A repeated settlement request must not pay twice.')

console.log('Chess split settlement tests passed')

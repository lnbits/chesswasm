import assertModule from 'assert'
import {promises as fs} from 'fs'

const assert = assertModule.strict
let source = await fs.readFile(new URL('../src/index.js', import.meta.url), 'utf8')
source = source.replace(/^import .*\n\n/, '').replace(/export function /g, 'function ')

const rows = new Map()
let failNextGameWrite = false
const storage = {
  get(table, id, fallback) {
    return rows.get(`${table}:${id}`) || fallback
  },
  getPublic(table, id, fallback) {
    return this.get(table, id, fallback)
  },
  getPaginated(table, options = {}) {
    const data = [...rows.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(`${table}:`) &&
          Object.entries(options.filters || {}).every(([field, expected]) => value[field] === expected)
      )
      .map(([, value]) => value)
    return {data, total: data.length}
  },
  set(table, row) {
    if (table === 'chess_games' && failNextGameWrite) {
      failNextGameWrite = false
      throw new Error('injected game-state write failure')
    }
    rows.set(`${table}:${row.id}`, row)
  }
}
const system = {now: () => 1_700_000_000, log() {}}
const websocket = {
  publish() {
    throw new Error('injected realtime delivery failure')
  }
}
const api = Function(
  'storage',
  'system',
  'wallet',
  'websocket',
  `${source}; return {makeChessMove, getPublicChessGame}`
)(storage, system, {}, websocket)

rows.set('chess_games:chess_1', {
  id: 'chess_1',
  name: 'Gameplay test',
  join_amount: 20,
  haircut: 0,
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
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn: '',
  turn: 'white',
  move_count: 0,
  state_version: 0,
  last_action_id: ''
})

const request = {
  gameId: 'chess_1',
  playerToken: 'white_token',
  from: 'e2',
  to: 'e4',
  actionId: 'move-action-1',
  expectedStateVersion: 0
}
const move = JSON.parse(api.makeChessMove(JSON.stringify(request)))
assert.equal(move.ok, true, move.error)
assert.equal(move.data.game.turn, 'black')
assert.equal(move.data.game.stateVersion, 1)
assert.equal(move.data.move.actionId, 'move-action-1')

const repeated = JSON.parse(api.makeChessMove(JSON.stringify(request)))
assert.equal(repeated.ok, true, repeated.error)
assert.equal(repeated.data.idempotent, true)
assert.equal(repeated.data.game.moveCount, 1)

const polled = JSON.parse(api.getPublicChessGame(JSON.stringify({gameId: 'chess_1'})))
assert.equal(polled.ok, true, polled.error)
assert.equal(polled.data.game.stateVersion, 1)
assert.equal(polled.data.game.lastActionId, 'move-action-1')
assert.equal(polled.data.moves[0].san, 'e2e4')

const stale = JSON.parse(
  api.makeChessMove(
    JSON.stringify({
      gameId: 'chess_1',
      playerToken: 'black_token',
      from: 'e7',
      to: 'e5',
      actionId: 'move-action-stale',
      expectedStateVersion: 0
    })
  )
)
assert.equal(stale.ok, false)
assert.match(stale.error, /changed before this move/)

failNextGameWrite = true
const interruptedRequest = {
  gameId: 'chess_1',
  playerToken: 'black_token',
  from: 'e7',
  to: 'e5',
  actionId: 'move-action-interrupted',
  expectedStateVersion: 1
}
const interrupted = JSON.parse(api.makeChessMove(JSON.stringify(interruptedRequest)))
assert.equal(interrupted.ok, false)
assert.match(interrupted.error, /injected game-state write failure/)
assert.equal(rows.get('chess_games:chess_1').state_version, 1)
assert.equal(
  [...rows.values()].some(row => row.action_id === 'move-action-interrupted'),
  true,
  'The move journal must survive an interrupted game-state write.'
)

const recovered = JSON.parse(api.makeChessMove(JSON.stringify(interruptedRequest)))
assert.equal(recovered.ok, true, recovered.error)
assert.equal(recovered.data.idempotent, true)
assert.equal(recovered.data.game.stateVersion, 2)
assert.equal(recovered.data.game.moveCount, 2)
assert.equal(recovered.data.game.turn, 'white')
assert.equal(rows.get('chess_games:chess_1').last_action_id, 'move-action-interrupted')

console.log('Chess versioned and idempotent gameplay tests passed')

import assertModule from 'assert'
import {promises as fs} from 'fs'

const assert = assertModule.strict
let source = await fs.readFile(new URL('../src/index.js', import.meta.url), 'utf8')
source = source
  .replace(/^import .*\n\n/, '')
  .replace(/export function /g, 'function ')
  .replace(
    'function hasLegalMove(state) {',
    'function hasLegalMove(state) { hasLegalMove.calls = (hasLegalMove.calls || 0) + 1;'
  )

const storage = {
  getPublicPaginated() {
    throw new Error('Public game rendering must not load full move rows.')
  }
}
const api = Function(
  'storage', 'system', 'wallet', 'websocket',
  `${source}; return {applyMove, boardStatusForGame, hasLegalMove, publicGame, publicMovesForGame}`
)(storage, {now: () => 0, log() {}}, {}, {})

const game = {
  id: 'chess_1',
  name: 'Fuel regression',
  status: 'active',
  turn: 'black',
  move_count: 21,
  fen: 'rnbq1bnr/4p1kp/1p1p4/p2B2N1/2p4P/8/PPPPPP2/RNBQK2R b - h3 0 11',
  pgn: '1. g2g4 f7f5 2. g4f5 g7g5 3. f5f6 g5g4 4. f6f7+ e8f7 5. g1f3 b7b6 6. f3g5+ f7g7 7. f1h3 c7c5 8. h3g4 a7a5 9. g4e6 c5c4 10. e6d5 d7d6 11. h2h4'
}

api.hasLegalMove.calls = 0
const publicGame = api.publicGame(game)
assert.equal(publicGame.inCheck, false)
assert.equal(api.hasLegalMove.calls, 0)

const moves = api.publicMovesForGame(game)
assert.equal(moves.length, 20)
assert.equal(moves[0].moveNumber, 2)
assert.equal(moves[19].moveNumber, 21)

const beforeLastMove = 'rnbq1bnr/4p1kp/1p1p4/p2B2N1/2p5/8/PPPPPP1P/RNBQK2R w - - 0 11'
api.hasLegalMove.calls = 0
const applied = api.applyMove(beforeLastMove, {from: 'h2', to: 'h4', promotion: ''})
assert.equal(applied.fen, game.fen)
assert.equal(api.hasLegalMove.calls, 1)

console.log('Chess WASM fuel regression tests passed')

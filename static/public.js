const state = {
  game: null,
  gameId: null,
  player: null,
  playerToken: '',
  selectedSquare: '',
  draggedSquare: '',
  dragGhost: null,
  suppressClick: false,
  legalTargets: new Map(),
  invoiceUnsubscribe: null,
  invoicePollTimer: null,
  qrApp: null,
  pollTimer: null,
  websocket: null,
  refreshTimer: null,
  rendering: false,
  renderAgain: false,
  movePending: false,
  notifiedStartAt: 0,
  notifiedCheckMove: 0,
  notifiedGameOverMove: 0
}

const client = window.createLNbitsExtensionClient({
  extensionId: 'chesswasm'
})

const gameSubtitle = document.querySelector('#game-subtitle')
const gameTitle = document.querySelector('#game-title')
const gameStatus = document.querySelector('#game-status')
const board = document.querySelector('#chess-board')
const joinForm = document.querySelector('#join-form')
const joinFormColumn = document.querySelector('#join-form-column')
const joinButton = document.querySelector('#join-button')
const copyGameButton = document.querySelector('#copy-game-button')
const resignButton = document.querySelector('#resign-button')
const playersStat = document.querySelector('#players-stat')
const amountStat = document.querySelector('#amount-stat')
const haircutStat = document.querySelector('#haircut-stat')
const playerList = document.querySelector('#player-list')
const moveList = document.querySelector('#move-list')
const invoiceDialog = document.querySelector('#invoice-dialog')
const invoiceQrCode = document.querySelector('#invoice-qrcode')
const invoiceStatus = document.querySelector('#invoice-status')
const copyInvoiceButton = document.querySelector('#copy-invoice-button')
const confettiLayer = document.querySelector('#confetti-layer')

joinButton.addEventListener('click', async event => {
  event.preventDefault()
  setJoinLoading(true)
  try {
    const invoice = await client.joinGame(state.gameId, {
      lnAddress: fieldValue(joinForm, 'lnAddress')
    })
    savePlayerToken(invoice.paymentHash)
    openInvoiceDialog(invoice)
    startInvoicePolling(invoice.paymentHash)
    await subscribeToPayment(invoice.paymentHash)
  } catch (error) {
    showError(error)
  } finally {
    setJoinLoading(false)
  }
})

copyGameButton.addEventListener('click', async () => {
  await copyText(publicGameUrl(), 'Game link copied.', 'Failed to copy game link.')
})

copyInvoiceButton.addEventListener('click', async () => {
  const invoice = copyInvoiceButton.dataset.invoice || ''
  if (!invoice) return
  await copyText(invoice, 'Invoice copied.', 'Failed to copy invoice.')
})

resignButton.addEventListener('click', async () => {
  if (!state.gameId || !playerToken()) return
  const confirmed = await confirmAction({
    title: 'Resign Match',
    message: 'Are you sure you want to resign this match?',
    okLabel: 'Resign'
  })
  if (!confirmed) return
  try {
    const result = await client.resign(state.gameId, {playerToken: playerToken()})
    await settleCompletedGame(result)
    await renderGame()
  } catch (error) {
    showError(error)
  }
})

for (const closeControl of document.querySelectorAll('[data-close-invoice]')) {
  closeControl.addEventListener('click', closeInvoiceDialog)
}

init().catch(showError)

async function init() {
  const context = await client.context()
  state.gameId = context.routeParams?.gameId || null
  state.playerToken = tokenFromUrl()
  await renderGame()
  state.pollTimer = window.setInterval(() => {
    renderGame().catch(error => console.warn('[chesswasm public] poll failed', error))
  }, 2500)
  window.addEventListener('beforeunload', cleanup)
}

async function renderGame() {
  if (state.rendering) {
    state.renderAgain = true
    return
  }
  state.rendering = true
  try {
  if (!state.gameId) {
    gameTitle.textContent = 'No game selected'
    gameStatus.textContent = 'Open a valid chess game link.'
    return
  }

  const previousGame = state.game
  const response = await client.getPublicGame(state.gameId, playerToken())
  const game = response?.game
  if (!game) throw new Error('Chess game not found.')
  state.game = game
  state.player = response.player || null
  notifyGameChanges(previousGame, game, state.player)
  gameTitle.textContent = game.name
  gameSubtitle.textContent = `${game.joinAmount} sats to join`
  gameStatus.textContent = statusText(game, state.player)
  playersStat.textContent = `${game.playersCount} / 2`
  amountStat.textContent = `${game.joinAmount} sats`
  haircutStat.textContent = `${game.haircut}%`
  joinFormColumn.hidden = response.canJoin !== true || !!state.player
  resignButton.hidden = !(state.player && game.status === 'active')

  renderBoard(game.fen, state.player?.color || '')
  renderPlayers(response.players || [], state.player)
  renderMoves(response.moves || [])
  await ensureRealtime()

  if (game.status === 'completed' || game.status === 'draw') {
    window.clearInterval(state.pollTimer)
  }
  } finally {
    state.rendering = false
    if (state.renderAgain) {
      state.renderAgain = false
      queueRenderGame()
    }
  }
}

async function ensureRealtime() {
  if (!state.gameId || state.websocket) return
  try {
    state.websocket = await client.subscribeWebsocket(`game:${state.gameId}`, event => {
      if (event.event === 'websocket.error') {
        state.websocket = null
        queueRenderGame()
        return
      }
      const data = event.data || {}
      if (data.type !== 'server') return
      queueRenderGame()
      if (data.game) notifyGameChanges(state.game, data.game, state.player)
    })
  } catch (error) {
    console.warn('[chesswasm public] websocket subscribe failed', error)
  }
}

function queueRenderGame(delay = 40) {
  if (state.refreshTimer) return
  state.refreshTimer = window.setTimeout(() => {
    state.refreshTimer = null
    renderGame().catch(showError)
  }, delay)
}

function renderBoard(fen, playerColor) {
  const pieces = fenToPieces(fen)
  const orientation = playerColor === 'black' ? 'black' : 'white'
  const ranks = orientation === 'black' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]
  const files = orientation === 'black' ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

  board.innerHTML = ''
  for (const rank of ranks) {
    for (const file of files) {
      const square = `${file}${rank}`
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = `board-square ${(files.indexOf(file) + rank) % 2 === 0 ? 'light' : 'dark'}`
      cell.dataset.square = square
      cell.setAttribute('aria-label', square)
      if (state.selectedSquare === square) cell.classList.add('selected')
      if (state.legalTargets.has(square)) {
        cell.classList.add('legal-target')
        if (state.legalTargets.get(square).capture) cell.classList.add('legal-capture')
      }
      const piece = pieces[square]
      if (piece) {
        cell.textContent = pieceGlyph(piece)
        cell.classList.add(pieceColor(piece) === 'white' ? 'piece-white' : 'piece-black')
        if (canMovePiece(piece)) {
          cell.classList.add('movable')
          cell.addEventListener('pointerdown', event => onPointerDown(event, square, piece))
        }
      }
      cell.addEventListener('click', () => onSquareClick(square, piece))
      board.append(cell)
    }
  }
}

async function onSquareClick(square, piece) {
  if (state.suppressClick) {
    state.suppressClick = false
    return
  }
  if (state.movePending || !state.game || state.game.status !== 'active' || !state.player) return
  if (state.game.turn !== state.player.color) return
  if (!state.selectedSquare) {
    if (!piece || pieceColor(piece) !== state.player.color) return
    state.selectedSquare = square
    state.legalTargets = legalTargetsForSquare(square)
    renderBoard(state.game.fen, state.player.color)
    return
  }
  const from = state.selectedSquare
  if (piece && pieceColor(piece) === state.player.color && from !== square) {
    state.selectedSquare = square
    state.legalTargets = legalTargetsForSquare(square)
    renderBoard(state.game.fen, state.player.color)
    return
  }
  const isLegalTarget = state.legalTargets.has(square)
  state.selectedSquare = ''
  state.legalTargets = new Map()
  if (from === square) {
    renderBoard(state.game.fen, state.player.color)
    return
  }
  if (!isLegalTarget) {
    renderBoard(state.game.fen, state.player.color)
    return
  }
  await submitMove(from, square)
}

function onPointerDown(event, square, piece) {
  if (event.button !== 0 || !canMovePiece(piece)) return
  event.preventDefault()
  state.draggedSquare = square
  state.selectedSquare = square
  state.legalTargets = legalTargetsForSquare(square)
  state.suppressClick = true
  createDragGhost(piece, event.clientX, event.clientY)
  updateBoardHighlights()

  const source = event.currentTarget
  let dragEnded = false
  try {
    source.setPointerCapture(event.pointerId)
  } catch (_) {
    // Some browsers can reject capture during fast pointer transitions.
  }
  source.classList.add('dragging-source')

  const cleanupDragListeners = () => {
    source.classList.remove('dragging-source')
    source.removeEventListener('pointermove', onMove)
    source.removeEventListener('pointerup', onEnd)
    source.removeEventListener('pointercancel', onCancel)
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onEnd)
    document.removeEventListener('pointercancel', onCancel)
    try {
      if (source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId)
    } catch (_) {
      // Capture may already have been released by the browser.
    }
  }

  const onMove = moveEvent => {
    moveEvent.preventDefault()
    moveDragGhost(moveEvent.clientX, moveEvent.clientY)
  }

  const onEnd = async endEvent => {
    if (dragEnded) return
    dragEnded = true
    endEvent.preventDefault()
    cleanupDragListeners()
    const targetSquare = squareFromClientPoint(endEvent.clientX, endEvent.clientY)
    await finishDragMove(square, targetSquare)
  }

  const onCancel = cancelEvent => {
    if (dragEnded) return
    dragEnded = true
    cancelEvent.preventDefault()
    cleanupDragListeners()
    resetDragState()
    renderBoard(state.game.fen, state.player.color)
  }

  source.addEventListener('pointermove', onMove)
  source.addEventListener('pointerup', onEnd)
  source.addEventListener('pointercancel', onCancel)
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onEnd)
  document.addEventListener('pointercancel', onCancel)
}

async function finishDragMove(from, to) {
  const legalTargets = new Map(state.legalTargets)
  resetDragState()
  if (!from || !to || from === to) {
    renderBoard(state.game.fen, state.player.color)
    return
  }
  if (!legalTargets.has(to)) {
    renderBoard(state.game.fen, state.player.color)
    return
  }
  await submitMove(from, to)
}

async function submitMove(from, to) {
  if (state.movePending) return
  const action = {
    actionId: newActionId('move'),
    expectedStateVersion: Number(state.game?.stateVersion || 0),
    expectedMoveCount: Number(state.game?.moveCount || 0),
    from,
    to,
    promotion: promotionForMove(from, to)
  }
  state.movePending = true
  renderBoard(state.game.fen, state.player.color)
  let result = null
  try {
    result = await makeMoveWithRecovery(action)
    await settleCompletedGame(result)
    await renderGame()
    if (!moveWasAccepted(action, result)) {
      throw new Error('The move response did not match the refreshed game state.')
    }
    if (state.game?.status === 'completed') showConfetti()
  } catch (error) {
    try {
      await renderGame()
    } catch (refreshError) {
      console.warn('[chesswasm public] move recovery refresh failed', refreshError)
    }
    if (moveWasAccepted(action, result)) {
      notifyInfo('Move accepted; game state was recovered after a response error.', 'positive')
    } else {
      showError(error)
    }
  } finally {
    state.movePending = false
    renderBoard(state.game.fen, state.player.color)
  }
}

async function makeMoveWithRecovery(action) {
  const payload = {
    playerToken: playerToken(),
    from: action.from,
    to: action.to,
    promotion: action.promotion,
    actionId: action.actionId,
    expectedStateVersion: action.expectedStateVersion
  }
  try {
    return await client.makeMove(state.gameId, payload)
  } catch (error) {
    try {
      await renderGame()
    } catch (refreshError) {
      console.warn('[chesswasm public] pre-retry refresh failed', refreshError)
    }
    if (moveWasAccepted(action)) {
      return {game: state.game, recovered: true}
    }
    if (
      Number(state.game?.stateVersion || 0) !== action.expectedStateVersion ||
      !canMoveIgnoringPending()
    ) {
      throw error
    }
    return client.makeMove(state.gameId, payload)
  }
}

function moveWasAccepted(action, result = null) {
  if (result?.move?.actionId === action.actionId) return true
  if (state.game?.lastActionId === action.actionId) return true
  if (Number(state.game?.moveCount || 0) <= action.expectedMoveCount) return false
  const moves = String(state.game?.pgn || '')
    .split(/\s+/)
    .filter(token => token && !/^\d+\.$/.test(token))
  const committed = moves[action.expectedMoveCount] || ''
  return committed.startsWith(`${action.from}${action.to}${action.promotion}`)
}

function canMoveIgnoringPending() {
  return !!(
    state.game &&
    state.game.status === 'active' &&
    state.player &&
    state.game.turn === state.player.color
  )
}

async function settleCompletedGame(result) {
  if (result?.game?.status !== 'completed' || result?.game?.payoutPending !== true) return
  try {
    const settlement = await client.settlePlayerPayout(state.gameId, {playerToken: playerToken()})
    if (settlement?.payout?.ok === false) {
      notifyInfo('Game completed. Payout is pending owner retry.', 'warning')
    }
  } catch (error) {
    console.warn('[chesswasm public] payout settlement failed after game completion', error)
    notifyInfo('Game completed. Payout is pending owner retry.', 'warning')
  }
}

function canMovePiece(piece) {
  if (state.movePending || !state.game || state.game.status !== 'active' || !state.player) return false
  return state.game.turn === state.player.color && pieceColor(piece) === state.player.color
}

function updateBoardHighlights() {
  for (const cell of board.querySelectorAll('.board-square')) {
    const square = cell.dataset.square || ''
    cell.classList.toggle('selected', state.selectedSquare === square)
    cell.classList.toggle('legal-target', state.legalTargets.has(square))
    cell.classList.toggle('legal-capture', state.legalTargets.get(square)?.capture === true)
  }
}

function createDragGhost(piece, x, y) {
  removeDragGhost()
  const ghost = document.createElement('div')
  ghost.className = `piece-drag-ghost ${pieceColor(piece) === 'white' ? 'piece-white' : 'piece-black'}`
  ghost.textContent = pieceGlyph(piece)
  document.body.append(ghost)
  state.dragGhost = ghost
  moveDragGhost(x, y)
}

function moveDragGhost(x, y) {
  if (!state.dragGhost) return
  state.dragGhost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`
}

function removeDragGhost() {
  if (!state.dragGhost) return
  state.dragGhost.remove()
  state.dragGhost = null
}

function resetDragState() {
  state.draggedSquare = ''
  state.selectedSquare = ''
  state.legalTargets = new Map()
  removeDragGhost()
}

function squareFromClientPoint(clientX, clientY) {
  const rect = board.getBoundingClientRect()
  if (
    clientX < rect.left ||
    clientX >= rect.right ||
    clientY < rect.top ||
    clientY >= rect.bottom ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return ''
  }
  const orientation = state.player?.color === 'black' ? 'black' : 'white'
  const col = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)))
  const row = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)))
  const file = orientation === 'black' ? 'hgfedcba'[col] : 'abcdefgh'[col]
  const rank = orientation === 'black' ? row + 1 : 8 - row
  return `${file}${rank}`
}

function renderPlayers(players, currentPlayer) {
  playerList.innerHTML = ''
  if (!players.length) {
    playerList.append(emptyText('Waiting for paid players.'))
    return
  }
  for (const player of players) {
    const row = document.createElement('div')
    row.className = 'player-row'
    const label = document.createElement('span')
    label.textContent = `${player.color || 'pending'}: ${player.lnAddress}`
    const status = document.createElement('span')
    status.className = 'muted'
    status.textContent = currentPlayer?.color === player.color ? 'you' : player.status
    row.append(label, status)
    playerList.append(row)
  }
}

function renderMoves(moves) {
  moveList.innerHTML = ''
  if (!moves.length) {
    moveList.append(emptyText('No moves yet.'))
    return
  }
  for (const move of moves.slice(-20)) {
    const row = document.createElement('div')
    row.className = 'move-row'
    row.textContent = `${move.moveNumber}. ${move.color} ${move.san}`
    moveList.append(row)
  }
}

function statusText(game, player) {
  if (game.status === 'waiting') return player ? 'Waiting for opponent' : 'Waiting for two paid players'
  if (game.status === 'draw') return 'Draw'
  if (game.status === 'completed') {
    const winner = game.winnerColor ? `${game.winnerColor} won` : 'Game complete'
    return game.payoutPending ? `${winner}; payout pending` : winner
  }
  if (game.inCheck && game.checkedColor) {
    if (player && player.color === game.checkedColor) return `You are ${player.color}; you are in check`
    return `${capitalize(game.checkedColor)} is in check`
  }
  if (!player) return `${capitalize(game.turn)} to move; open your private player link to play`
  const side = `You are ${player.color}`
  if (game.turn === player.color) return `${side}; your move`
  return `${side}; ${capitalize(game.turn)} to move`
}

function notifyGameChanges(previousGame, game, player) {
  if (!game) return
  const startedAt = Number(game.startedAt || 0)
  if (
    startedAt &&
    state.notifiedStartAt !== startedAt &&
    previousGame?.status === 'waiting' &&
    game.status === 'active'
  ) {
    state.notifiedStartAt = startedAt
    notifyInfo(player ? 'Game started. Your clock is ticking.' : 'Game started.')
  }

  const moveCount = Number(game.moveCount || 0)
  if (game.inCheck && game.status === 'active' && moveCount && state.notifiedCheckMove !== moveCount) {
    state.notifiedCheckMove = moveCount
    const message =
      player && player.color === game.checkedColor
        ? 'You are in check.'
        : `${capitalize(game.checkedColor || game.turn)} is in check.`
    notifyInfo(message, 'warning')
  }

  if (game.status === 'completed' && game.checkmate && moveCount && state.notifiedGameOverMove !== moveCount) {
    state.notifiedGameOverMove = moveCount
    const won = player && player.color === game.winnerColor
    if (won) showConfetti()
    const payoutText = game.payoutStatus === 'paid' ? ' Payout sent.' : game.payoutPending ? ' Payout pending.' : ''
    notifyInfo(won ? `Checkmate. You won.${payoutText}` : `Checkmate. ${capitalize(game.winnerColor)} won.${payoutText}`)
  }
}

function openInvoiceDialog(invoice) {
  if (!invoice?.paymentRequest || !invoice?.paymentHash) {
    throw new Error('Invalid invoice response.')
  }
  const paymentRequest = invoice.paymentRequest
  copyInvoiceButton.dataset.invoice = paymentRequest
  invoiceStatus.textContent = 'Waiting for payment'
  invoiceStatus.classList.remove('text-positive')
  renderQrCode(`lightning:${paymentRequest.toUpperCase()}`)
  invoiceDialog.hidden = false
}

function closeInvoiceDialog() {
  invoiceDialog.hidden = true
  cleanupPaymentSubscription()
  cleanupInvoicePolling()
  if (state.qrApp) {
    state.qrApp.unmount()
    state.qrApp = null
  }
  invoiceQrCode.innerHTML = ''
}

function renderQrCode(value) {
  if (!window.Vue || !window.QrcodeVue?.default) {
    throw new Error('QR code renderer is not available.')
  }
  if (state.qrApp) state.qrApp.unmount()
  invoiceQrCode.innerHTML = ''
  state.qrApp = window.Vue.createApp({
    render() {
      return window.Vue.h(window.QrcodeVue.default, {
        value,
        size: 260,
        margin: 3,
        level: 'Q',
        renderAs: 'svg',
        class: 'invoice-qrcode-svg'
      })
    }
  })
  state.qrApp.mount(invoiceQrCode)
}

async function subscribeToPayment(paymentHash) {
  cleanupPaymentSubscription()
  try {
    state.invoiceUnsubscribe = await client.subscribePayment(paymentHash, event => {
      if (event.event === 'payment.error') {
        invoiceStatus.textContent = 'Checking payment status'
        return
      }
      const payment = event.data || {}
      if (
        event.event === 'payment.settled' ||
        payment.pending === false ||
        ['success', 'settled', 'paid'].includes(String(payment.status || ''))
      ) {
        handleInvoicePaid()
      }
    })
  } catch (error) {
    console.warn('[chesswasm public] payment subscription unavailable', error)
    invoiceStatus.textContent = 'Checking payment status'
  }
}

function cleanupPaymentSubscription() {
  if (!state.invoiceUnsubscribe) return
  state.invoiceUnsubscribe()
  state.invoiceUnsubscribe = null
}

function startInvoicePolling(paymentHash) {
  cleanupInvoicePolling()
  state.invoicePollTimer = window.setInterval(async () => {
    try {
      const response = await client.getPublicGame(state.gameId, paymentHash)
      if (response?.player?.status === 'paid') {
        handleInvoicePaid()
      }
    } catch (error) {
      console.warn('[chesswasm public] invoice poll failed', error)
    }
  }, 2000)
}

function cleanupInvoicePolling() {
  if (!state.invoicePollTimer) return
  window.clearInterval(state.invoicePollTimer)
  state.invoicePollTimer = null
}

function handleInvoicePaid() {
  cleanupPaymentSubscription()
  cleanupInvoicePolling()
  invoiceStatus.textContent = 'Payment received'
  invoiceStatus.classList.add('text-positive')
  showConfetti()
  window.setTimeout(() => {
    closeInvoiceDialog()
    renderGame().catch(showError)
  }, 1800)
}

function fenToPieces(fen) {
  const result = {}
  const ranks = String(fen || '').split(' ')[0].split('/')
  ranks.forEach((rankText, index) => {
    let fileIndex = 0
    for (const char of rankText) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char)
      } else {
        result[`${'abcdefgh'[fileIndex]}${8 - index}`] = char
        fileIndex += 1
      }
    }
  })
  return result
}

function pieceGlyph(piece) {
  return {
    K: '♔',
    Q: '♕',
    R: '♖',
    B: '♗',
    N: '♘',
    P: '♙',
    k: '♚',
    q: '♛',
    r: '♜',
    b: '♝',
    n: '♞',
    p: '♟'
  }[piece] || ''
}

function pieceColor(piece) {
  return piece === piece.toUpperCase() ? 'white' : 'black'
}

function capitalize(value) {
  const text = String(value || '')
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : ''
}

function promotionForMove(from, to) {
  const pieces = fenToPieces(state.game.fen)
  const piece = pieces[from]
  if (!piece || piece.toLowerCase() !== 'p') return ''
  if (to[1] !== '1' && to[1] !== '8') return ''
  return 'q'
}

function legalTargetsForSquare(square) {
  try {
    const chessState = parseFenState(state.game?.fen || '')
    const pieces = fenToPieces(state.game?.fen || '')
    const moves = legalMoves(chessState).filter(move => move.from === square)
    const targets = new Map()
    for (const move of moves) {
      targets.set(move.to, {
        capture:
          !!pieces[move.to] ||
          (move.piece.toLowerCase() === 'p' && move.to === chessState.ep && !pieces[move.to])
      })
    }
    return targets
  } catch (error) {
    console.warn('[chesswasm public] failed to calculate legal moves', error)
    return new Map()
  }
}

function parseFenState(fen) {
  const parts = String(fen || '').split(/\s+/)
  if (parts.length < 4) throw new Error('Invalid chess position.')
  const boardMap = new Map()
  const ranks = parts[0].split('/')
  if (ranks.length !== 8) throw new Error('Invalid chess board.')
  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0
    for (const char of rankText) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char)
      } else {
        boardMap.set(`${'abcdefgh'[fileIndex]}${8 - rankIndex}`, char)
        fileIndex += 1
      }
    }
    if (fileIndex !== 8) throw new Error('Invalid chess board.')
  })
  return {
    board: boardMap,
    turn: parts[1] === 'b' ? 'b' : 'w',
    castling: parts[2] || '-',
    ep: parts[3] || '-',
    halfmove: Number(parts[4] || 0),
    fullmove: Number(parts[5] || 1)
  }
}

function legalMoves(chessState) {
  return pseudoMoves(chessState).filter(move => !isInCheck(makeLocalMove(chessState, move), chessState.turn))
}

function pseudoMoves(chessState) {
  const moves = []
  for (const [square, piece] of chessState.board.entries()) {
    if (fenPieceColor(piece) !== chessState.turn) continue
    const lower = piece.toLowerCase()
    if (lower === 'p') pawnMoves(chessState, square, piece, moves)
    if (lower === 'n') {
      stepMoves(chessState, square, piece, moves, [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]])
    }
    if (lower === 'b') slideMoves(chessState, square, piece, moves, [[1, 1], [1, -1], [-1, -1], [-1, 1]])
    if (lower === 'r') slideMoves(chessState, square, piece, moves, [[1, 0], [0, -1], [-1, 0], [0, 1]])
    if (lower === 'q') {
      slideMoves(chessState, square, piece, moves, [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 0], [0, -1], [-1, 0], [0, 1]])
    }
    if (lower === 'k') stepMoves(chessState, square, piece, moves, [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]])
  }
  return moves
}

function pawnMoves(chessState, square, piece, moves) {
  const color = fenPieceColor(piece)
  const direction = color === 'w' ? 1 : -1
  const startRank = color === 'w' ? 2 : 7
  const promotionRank = color === 'w' ? 8 : 1
  const [file, rank] = squareToPoint(square)
  const one = pointToSquare(file, rank + direction)
  if (one && !chessState.board.has(one)) {
    addPawnMove(square, one, piece, moves, promotionRank)
    const two = pointToSquare(file, rank + direction * 2)
    if (rank === startRank && two && !chessState.board.has(two)) {
      moves.push({from: square, to: two, piece})
    }
  }
  for (const df of [-1, 1]) {
    const target = pointToSquare(file + df, rank + direction)
    if (!target) continue
    const targetPiece = chessState.board.get(target)
    if ((targetPiece && fenPieceColor(targetPiece) !== color) || target === chessState.ep) {
      addPawnMove(square, target, piece, moves, promotionRank)
    }
  }
}

function addPawnMove(from, to, piece, moves, promotionRank) {
  if (Number(to[1]) === promotionRank) {
    for (const promotion of ['q', 'r', 'b', 'n']) moves.push({from, to, piece, promotion})
    return
  }
  moves.push({from, to, piece})
}

function stepMoves(chessState, square, piece, moves, deltas) {
  const color = fenPieceColor(piece)
  const [file, rank] = squareToPoint(square)
  for (const [df, dr] of deltas) {
    const target = pointToSquare(file + df, rank + dr)
    if (!target) continue
    const targetPiece = chessState.board.get(target)
    if (!targetPiece || fenPieceColor(targetPiece) !== color) moves.push({from: square, to: target, piece})
  }
}

function slideMoves(chessState, square, piece, moves, deltas) {
  const color = fenPieceColor(piece)
  const [file, rank] = squareToPoint(square)
  for (const [df, dr] of deltas) {
    let nextFile = file + df
    let nextRank = rank + dr
    while (true) {
      const target = pointToSquare(nextFile, nextRank)
      if (!target) break
      const targetPiece = chessState.board.get(target)
      if (!targetPiece) {
        moves.push({from: square, to: target, piece})
      } else {
        if (fenPieceColor(targetPiece) !== color) moves.push({from: square, to: target, piece})
        break
      }
      nextFile += df
      nextRank += dr
    }
  }
}

function makeLocalMove(chessState, move) {
  const next = {
    board: new Map(chessState.board),
    turn: oppositeFenColor(chessState.turn),
    castling: '-',
    ep: '-',
    halfmove: move.piece.toLowerCase() === 'p' || chessState.board.has(move.to) ? 0 : Number(chessState.halfmove || 0) + 1,
    fullmove: chessState.turn === 'b' ? Number(chessState.fullmove || 1) + 1 : Number(chessState.fullmove || 1)
  }
  next.board.delete(move.from)
  if (move.to === chessState.ep && move.piece.toLowerCase() === 'p' && !chessState.board.has(move.to)) {
    const [file, rank] = squareToPoint(move.to)
    next.board.delete(pointToSquare(file, rank + (chessState.turn === 'w' ? -1 : 1)))
  }
  const [fromFile, fromRank] = squareToPoint(move.from)
  const [, toRank] = squareToPoint(move.to)
  if (move.piece.toLowerCase() === 'p' && Math.abs(toRank - fromRank) === 2) {
    next.ep = pointToSquare(fromFile, (fromRank + toRank) / 2)
  }
  const promoted = move.promotion
    ? chessState.turn === 'w'
      ? move.promotion.toUpperCase()
      : move.promotion
    : move.piece
  next.board.set(move.to, promoted)
  return next
}

function isInCheck(chessState, color) {
  const king = color === 'w' ? 'K' : 'k'
  let kingSquare = ''
  for (const [square, piece] of chessState.board.entries()) {
    if (piece === king) kingSquare = square
  }
  if (!kingSquare) return true
  return isSquareAttacked(chessState, kingSquare, oppositeFenColor(color))
}

function isSquareAttacked(chessState, square, byColor) {
  const [file, rank] = squareToPoint(square)
  const pawnRank = byColor === 'w' ? rank - 1 : rank + 1
  const pawn = byColor === 'w' ? 'P' : 'p'
  for (const pawnFile of [file - 1, file + 1]) {
    if (chessState.board.get(pointToSquare(pawnFile, pawnRank)) === pawn) return true
  }

  const knight = byColor === 'w' ? 'N' : 'n'
  for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
    if (chessState.board.get(pointToSquare(file + df, rank + dr)) === knight) return true
  }

  if (isAttackedOnLine(chessState, file, rank, byColor, [[1, 1], [1, -1], [-1, -1], [-1, 1]], ['b', 'q'])) return true
  if (isAttackedOnLine(chessState, file, rank, byColor, [[1, 0], [0, -1], [-1, 0], [0, 1]], ['r', 'q'])) return true

  const king = byColor === 'w' ? 'K' : 'k'
  for (const [df, dr] of [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]) {
    if (chessState.board.get(pointToSquare(file + df, rank + dr)) === king) return true
  }
  return false
}

function isAttackedOnLine(chessState, file, rank, byColor, deltas, attackers) {
  for (const [df, dr] of deltas) {
    let nf = file + df
    let nr = rank + dr
    while (true) {
      const target = pointToSquare(nf, nr)
      if (!target) break
      const piece = chessState.board.get(target)
      if (piece) {
        if (fenPieceColor(piece) === byColor && attackers.includes(piece.toLowerCase())) return true
        break
      }
      nf += df
      nr += dr
    }
  }
  return false
}

function squareToPoint(square) {
  return ['abcdefgh'.indexOf(square[0]) + 1, Number(square[1])]
}

function pointToSquare(file, rank) {
  if (file < 1 || file > 8 || rank < 1 || rank > 8) return ''
  return `${'abcdefgh'[file - 1]}${rank}`
}

function fenPieceColor(piece) {
  return piece === piece.toUpperCase() ? 'w' : 'b'
}

function oppositeFenColor(color) {
  return color === 'w' ? 'b' : 'w'
}

function savePlayerToken(token) {
  if (!token || !state.gameId) return
  state.playerToken = token
  writeTokenToUrl(token)
}

function playerToken() {
  if (!state.gameId) return ''
  if (state.playerToken) return state.playerToken
  state.playerToken = tokenFromUrl()
  return state.playerToken
}

function newActionId(prefix) {
  const id = window.crypto?.randomUUID?.()
  if (id) return `${prefix}:${id}`
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function tokenFromUrl() {
  const fragment = String(window.location.hash || '').replace(/^#/, '')
  const params = new URLSearchParams(fragment)
  return params.get('playerToken') || ''
}

function writeTokenToUrl(token) {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  params.set('playerToken', token)
  url.hash = params.toString()
  window.history.replaceState({}, '', url.toString())
}

function publicGameUrl() {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  params.delete('playerToken')
  const fragment = params.toString()
  url.hash = fragment ? fragment : ''
  return url.toString()
}

function showConfetti() {
  confettiLayer.innerHTML = ''
  for (let index = 1; index <= 32; index += 1) {
    const piece = document.createElement('span')
    piece.className = `confetti-piece confetti-piece-${index}`
    confettiLayer.append(piece)
  }
  window.setTimeout(() => {
    confettiLayer.innerHTML = ''
  }, 1800)
}

function fieldValue(container, name) {
  return String(container.querySelector(`[name="${name}"]`)?.value || '')
}

function emptyText(text) {
  const node = document.createElement('p')
  node.className = 'muted q-my-none'
  node.textContent = text
  return node
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[chesswasm public]', message, error)
  client.notifyError(message).catch(notifyError => {
    console.error('[chesswasm public] failed to notify error', notifyError)
  })
}

function notifyInfo(message, level = 'info') {
  client.notify(message, level).catch(error => {
    console.error('[chesswasm public] failed to notify', error)
  })
}

async function copyText(value, successMessage, failureMessage) {
  try {
    await navigator.clipboard.writeText(value)
    await client.notify(successMessage, 'positive')
  } catch (error) {
    console.warn('[chesswasm public] copy failed', error)
    await client.notify(failureMessage, 'negative')
  }
}

function confirmAction({title, message, okLabel = 'OK'}) {
  return new Promise(resolve => {
    const dialog = document.createElement('div')
    dialog.className = 'confirm-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')

    const backdrop = document.createElement('button')
    backdrop.type = 'button'
    backdrop.className = 'confirm-dialog-backdrop'
    backdrop.setAttribute('aria-label', 'Cancel')

    const card = document.createElement('div')
    card.className = 'confirm-dialog-card panel q-card q-card--dark q-pa-md'

    const heading = document.createElement('h2')
    heading.className = 'text-h6 text-weight-bold q-my-none'
    heading.textContent = title

    const body = document.createElement('p')
    body.className = 'muted q-mt-sm'
    body.textContent = message

    const actions = document.createElement('div')
    actions.className = 'row justify-end q-gutter-sm q-mt-md'

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'q-btn subtle-button'
    cancel.textContent = 'Cancel'

    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'q-btn danger-button'
    ok.textContent = okLabel

    const close = result => {
      dialog.remove()
      resolve(result)
    }

    backdrop.addEventListener('click', () => close(false))
    cancel.addEventListener('click', () => close(false))
    ok.addEventListener('click', () => close(true))
    actions.append(cancel, ok)
    card.append(heading, body, actions)
    dialog.append(backdrop, card)
    document.body.append(dialog)
    cancel.focus()
  })
}

function setJoinLoading(loading) {
  joinButton.disabled = loading
  joinButton.setAttribute('aria-busy', loading ? 'true' : 'false')
}

function cleanup() {
  cleanupPaymentSubscription()
  cleanupInvoicePolling()
  if (state.refreshTimer) window.clearTimeout(state.refreshTimer)
  state.refreshTimer = null
  state.websocket?.unsubscribe?.()
  state.websocket = null
  window.clearInterval(state.pollTimer)
}

import {
  createInvoice,
  createInvoicePublic,
  extensionApiRequest,
  httpRequest,
  listUserWallets,
  log,
  now,
  payInvoice,
  payLnurl,
  randomId,
  storageDelete,
  storageGet,
  storageGetPublic,
  storageGetPaginated,
  storageGetPublicPaginated,
  storageSet,
  websocketPublish
} from 'lnbits:extension/host'
import {
  convert as utilsCurrenciesConvert,
  fiatToSats as utilsCurrenciesFiatToSats,
  listCurrencies as utilsCurrenciesList,
  rate as utilsCurrenciesRate,
  satsToFiat as utilsCurrenciesSatsToFiat
} from 'lnbits:extension/utils-currencies'
import {
  decodeInvoice as utilsLightningDecodeInvoice,
  invoiceAmountMsat as utilsLightningInvoiceAmountMsat,
  invoiceExpiry as utilsLightningInvoiceExpiry,
  invoiceMemo as utilsLightningInvoiceMemo,
  invoicePaymentHash as utilsLightningInvoicePaymentHash,
  randomSecretAndHash as utilsLightningRandomSecretAndHash,
  validateInvoice as utilsLightningValidateInvoice,
  verifyPreimage as utilsLightningVerifyPreimage
} from 'lnbits:extension/utils-lightning'
import {health as utilsServerHealth} from 'lnbits:extension/utils-server'

const extensionApi = {
  storage: {
    get(input) {
      return storageGet(input)
    },

    getPublic(input) {
      return storageGetPublic(input)
    },

    set(input) {
      return storageSet({
        table: input.table,
        dataJson: JSON.stringify(input.data || {})
      })
    },

    getPaginated(input) {
      return storageGetPaginated({
        table: input.table,
        filtersJson: JSON.stringify(input.filters || {}),
        search: input.search || '',
        searchFields: input.searchFields || [],
        sortBy: input.sortBy || '',
        descending: input.descending === true,
        limit: input.limit || 25,
        offset: input.offset || 0
      })
    },

    getPublicPaginated(input) {
      return storageGetPublicPaginated({
        table: input.table,
        sourceId: input.sourceId || '',
        filtersJson: JSON.stringify(input.filters || {}),
        search: input.search || '',
        searchFields: input.searchFields || [],
        sortBy: input.sortBy || '',
        descending: input.descending === true,
        limit: input.limit || 25,
        offset: input.offset || 0
      })
    },

    delete(input) {
      return storageDelete(input)
    }
  },

  wallet: {
    createInvoice(input) {
      return createInvoice({
        ...input,
        amount: Number(input.amount),
        extra: Object.entries(input.extra || {}).map(([key, value]) => [
          key,
          String(value)
        ])
      })
    },

    createInvoicePublic(input) {
      return createInvoicePublic({
        sourceId: input.sourceId,
        amount: Number(input.amount),
        currency: input.currency || 'sat',
        memo: input.memo || '',
        extra: Object.entries(input.extra || {}).map(([key, value]) => [
          key,
          String(value)
        ])
      })
    },

    listUserWallets() {
      return listUserWallets()
    },

    payInvoice(input) {
      return payInvoice({
        walletId: input.walletId,
        paymentRequest: input.paymentRequest,
        maxSat: input.maxSat ?? undefined,
        description: input.description || '',
        extra: Object.entries(input.extra || {}).map(([key, value]) => [
          key,
          String(value)
        ])
      })
    },

    payLnurl(input) {
      return payLnurl({
        walletId: input.walletId,
        lnurl: input.lnurl,
        amount: Number(input.amount),
        currency: input.currency || 'sat',
        comment: input.comment || undefined,
        maxSat: input.maxSat > 0 ? BigInt(input.maxSat) : undefined,
        description: input.description || '',
        extra: Object.entries(input.extra || {}).map(([key, value]) => [
          key,
          String(value)
        ])
      })
    }
  },

  http: {
    request(input) {
      return httpRequest({
        method: input.method || 'GET',
        url: input.url,
        headers: Object.entries(input.headers || {}).map(([key, value]) => [
          key,
          String(value)
        ]),
        body: input.body ?? undefined
      })
    }
  },

  extension: {
    request(input) {
      return extensionApiRequest({
        extensionId: input.extensionId,
        method: input.method || 'GET',
        path: input.path,
        body: input.body ?? undefined
      })
    }
  },

  utils: {
    currencies: {
      list() {
        return utilsCurrenciesList()
      },

      rate(input) {
        return utilsCurrenciesRate(input)
      },

      convert(input) {
        return utilsCurrenciesConvert(input)
      },

      fiatToSats(input) {
        return utilsCurrenciesFiatToSats(input)
      },

      satsToFiat(input) {
        return utilsCurrenciesSatsToFiat(input)
      }
    },

    server: {
      health() {
        return utilsServerHealth()
      }
    },

    lightning: {
      decodeInvoice(input) {
        return utilsLightningDecodeInvoice(input)
      },

      validateInvoice(input) {
        return utilsLightningValidateInvoice(input)
      },

      invoicePaymentHash(input) {
        return utilsLightningInvoicePaymentHash(input)
      },

      invoiceAmountMsat(input) {
        return utilsLightningInvoiceAmountMsat(input)
      },

      invoiceExpiry(input) {
        return utilsLightningInvoiceExpiry(input)
      },

      invoiceMemo(input) {
        return utilsLightningInvoiceMemo(input)
      },

      verifyPreimage(input) {
        return utilsLightningVerifyPreimage(input)
      },

      randomSecretAndHash(input) {
        return utilsLightningRandomSecretAndHash(input)
      }
    }
  },

  system: {
    id(input) {
      return randomId(typeof input === 'string' ? {prefix: input} : input)
    },

    now() {
      const response = now()
      const timestamp =
        response && typeof response === 'object'
          ? response.timestamp ?? response['timestamp'] ?? response.value
          : response
      const number = Number(timestamp)
      if (!Number.isFinite(number) || number <= 0) {
        return Math.floor(Date.now() / 1000)
      }
      return Math.trunc(number)
    },

    log(input) {
      return log(typeof input === 'string' ? {level: 'info', message: input} : input)
    }
  }
}

const websocket = {
  publish(itemId, data) {
    return websocketPublish({
      itemId,
      dataJson: JSON.stringify(data || {})
    }).sent
  }
}

const storage = {
  get(table, id, fallback = null) {
    const {dataJson} = extensionApi.storage.get({table, id})
    if (!dataJson) return fallback
    return JSON.parse(dataJson)
  },

  getPublic(table, id, fallback = null) {
    const {dataJson} = extensionApi.storage.getPublic({table, id})
    if (!dataJson) return fallback
    return JSON.parse(dataJson)
  },

  set(table, data) {
    extensionApi.storage.set({table, data})
    return data
  },

  getPaginated(table, options = {}) {
    const {rowsJson, total} = extensionApi.storage.getPaginated({
      table,
      filters: options.filters || {},
      search: options.search || '',
      searchFields: options.searchFields || [],
      sortBy: options.sortBy || '',
      descending: options.descending === true,
      limit: options.limit || 25,
      offset: options.offset || 0
    })
    return {
      data: JSON.parse(rowsJson || '[]'),
      total: Number(total || 0)
    }
  },

  getPublicPaginated(table, options = {}) {
    const {rowsJson, total} = extensionApi.storage.getPublicPaginated({
      table,
      sourceId: options.sourceId || '',
      filters: options.filters || {},
      search: options.search || '',
      searchFields: options.searchFields || [],
      sortBy: options.sortBy || '',
      descending: options.descending === true,
      limit: options.limit || 25,
      offset: options.offset || 0
    })
    return {
      data: JSON.parse(rowsJson || '[]'),
      total: Number(total || 0)
    }
  },

  delete(table, id) {
    extensionApi.storage.delete({table, id})
  }
}

const wallet = {
  listUserWallets() {
    return extensionApi.wallet.listUserWallets().wallets || []
  },

  createInvoice({walletId, amount, currency = 'sat', memo, tag, extra = {}}) {
    const invoiceExtra = {
      tag,
      ...extra
    }

    return extensionApi.wallet.createInvoice({
      walletId,
      amount,
      currency,
      memo,
      tag,
      extra: invoiceExtra
    })
  },

  createInvoicePublic({sourceId, amount, currency = 'sat', memo = '', extra = {}}) {
    return extensionApi.wallet.createInvoicePublic({
      sourceId,
      amount,
      currency,
      memo,
      extra
    })
  },

  payInvoice({walletId, paymentRequest, maxSat = null, description = '', extra = {}}) {
    return extensionApi.wallet.payInvoice({
      walletId,
      paymentRequest,
      maxSat,
      description,
      extra
    })
  },

  payLnurl({walletId, lnurl, amount, currency = 'sat', comment = '', maxSat = 0, description = '', extra = {}}) {
    return extensionApi.wallet.payLnurl({
      walletId,
      lnurl,
      amount,
      currency,
      comment,
      maxSat,
      description,
      extra
    })
  }
}

const http = {
  request({method = 'GET', url, headers = {}, body = undefined}) {
    const response = extensionApi.http.request({
      method,
      url,
      headers,
      body
    })
    return {
      statusCode: Number(response.statusCode || 0),
      headers: Object.fromEntries(response.headers || []),
      body: response.body || ''
    }
  }
}

const extension = {
  request({extensionId, method = 'GET', path, body = undefined}) {
    const response = extensionApi.extension.request({
      extensionId,
      method,
      path,
      body
    })
    return {
      statusCode: Number(response.statusCode || 0),
      headers: Object.fromEntries(response.headers || []),
      body: response.body || ''
    }
  }
}

const utils = {
  currencies: {
    list() {
      return ['sat', ...(extensionApi.utils.currencies.list().currencies || [])]
    },

    rate(currency) {
      return extensionApi.utils.currencies.rate({currency})
    },

    convert({amount, from, to}) {
      const response = extensionApi.utils.currencies.convert({
        amount,
        fromCurrency: from,
        to
      })
      return Object.fromEntries(response.amounts || [])
    },

    fiatToSats(amount, currency) {
      return Number(
        extensionApi.utils.currencies.fiatToSats({
          amount,
          currency
        }).amountSat || 0
      )
    },

    satsToFiat(amount, currency) {
      return Number(
        extensionApi.utils.currencies.satsToFiat({
          amount,
          currency
        }).amount || 0
      )
    }
  },

  server: {
    health() {
      return extensionApi.utils.server.health()
    }
  },

  lightning: {
    decodeInvoice(bolt11) {
      return extensionApi.utils.lightning.decodeInvoice({bolt11})
    },

    validateInvoice(bolt11) {
      return extensionApi.utils.lightning.validateInvoice({bolt11})
    },

    invoicePaymentHash(bolt11) {
      return extensionApi.utils.lightning.invoicePaymentHash({bolt11}).paymentHash
    },

    invoiceAmountMsat(bolt11) {
      return Number(
        extensionApi.utils.lightning.invoiceAmountMsat({bolt11}).amountMsat || 0
      )
    },

    invoiceExpiry(bolt11) {
      return Number(
        extensionApi.utils.lightning.invoiceExpiry({bolt11}).expiresAt || 0
      )
    },

    invoiceMemo(bolt11) {
      return extensionApi.utils.lightning.invoiceMemo({bolt11}).memo || ''
    },

    verifyPreimage(preimage, paymentHash) {
      return extensionApi.utils.lightning.verifyPreimage({
        preimage,
        paymentHash
      }).valid
    },

    randomSecretAndHash(length = 32) {
      return extensionApi.utils.lightning.randomSecretAndHash({length})
    }
  }
}

const system = {
  id(prefix) {
    return extensionApi.system.id({prefix}).id
  },

  now() {
    const response = extensionApi.system.now()
    const timestamp =
      response && typeof response === 'object'
        ? response.timestamp ?? response['timestamp'] ?? response.value
        : response
    const number = Number(timestamp)
    if (!Number.isFinite(number) || number <= 0) {
      return Math.floor(Date.now() / 1000)
    }
    return Math.trunc(number)
  },

  log(message, level = 'info') {
    extensionApi.system.log({level, message})
  }
}


const SETTINGS_TABLE = 'chess_settings'
const GAMES_TABLE = 'chess_games'
const PLAYERS_TABLE = 'chess_players'
const MOVES_TABLE = 'chess_moves'
const MIN_JOIN_SATS = 20
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const GAME_SEARCH_FIELDS = ['name', 'winner_ln_address', 'status']
const FILES = 'abcdefgh'

export function getChessSettings(_requestJson) {
  return runJson(() => ({settings: publicSettings(getSettings())}))
}

export function saveChessSettings(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const existing = getSettings()
    const now = system.now()
    const walletId = cleanText(request.walletId ?? request.wallet_id, 128)
    const walletName = cleanText(request.walletName ?? request.wallet_name, 120)
    const settings = {
      id: existing.id || newSettingsId(),
      wallet_id: walletId,
      wallet_name: walletName || walletId,
      enabled: request.enabled === true,
      haircut: normalizePercent(request.haircut, 0),
      join_amount: Number(existing.join_amount || 100),
      max_bet: Number(existing.max_bet || 100000000),
      created_at: existing.created_at || now,
      updated_at: now
    }

    if (settings.enabled && !settings.wallet_id) {
      throw new Error('walletId is required when chess games are enabled.')
    }
    storage.set(SETTINGS_TABLE, settings)
    system.log('chesswasm: saved settings')
    return {settings: publicSettings(settings)}
  })
}

export function listChessWallets(_requestJson) {
  return runJson(() => ({wallets: wallet.listUserWallets()}))
}

export function createChessGame(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const settings = getSettings()
    if (!settings.enabled) throw new Error('Chess games are disabled.')
    if (!settings.wallet_id) throw new Error('Chess wallet is not configured.')

    const joinAmount = normalizeInteger(
      request.joinAmount ?? request.join_amount,
      100,
      MIN_JOIN_SATS,
      Number.MAX_SAFE_INTEGER
    )
    const now = system.now()
    const game = {
      id: cleanId(request.id) || system.id('chess').id || system.id('chess'),
      settings_id: settings.id,
      wallet_id: settings.wallet_id,
      name: cleanText(request.name, 80) || 'Paid chess game',
      join_amount: joinAmount,
      haircut: Number(settings.haircut || 0),
      players_count: 0,
      status: 'waiting',
      white_ln_address: '',
      black_ln_address: '',
      white_payment_hash: '',
      black_payment_hash: '',
      winner_color: '',
      winner_ln_address: '',
      payout_pending: false,
      payout_status: '',
      fen: START_FEN,
      pgn: '',
      turn: 'white',
      move_count: 0,
      state_version: 0,
      last_action_id: '',
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null
    }

    storage.set(GAMES_TABLE, game)
    system.log(`chesswasm: created game ${game.id}`)
    return {game: publicGame(game), publicUrl: `/chesswasm/games/${game.id}`}
  })
}

export function listChessGames(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const rowsPerPage = normalizePageSize(request.rowsPerPage)
    const page = normalizePage(request.page)
    const response = storage.getPaginated(GAMES_TABLE, {
      search: cleanText(request.search, 256),
      searchFields: GAME_SEARCH_FIELDS,
      sortBy: normalizeGameSortBy(request.sortBy),
      descending: request.descending === true || request.descending === 'true',
      limit: rowsPerPage,
      offset: (page - 1) * rowsPerPage
    })
    return {games: response.data.map(publicGame), total: response.total}
  })
}

export function deleteChessGame(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const gameId = requiredText(request.gameId, 'gameId', 128)
    const game = getGame(gameId)
    if (game.status === 'completed' && game.payout_pending === true) {
      throw new Error('Settle the pending payout before deleting this chess game.')
    }

    const moveCount = Number(game.move_count || 0)
    for (let moveNumber = 1; moveNumber <= moveCount; moveNumber += 1) {
      storage.delete(MOVES_TABLE, `${gameId}-${moveNumber}`)
    }
    if (game.white_payment_hash) storage.delete(PLAYERS_TABLE, game.white_payment_hash)
    if (game.black_payment_hash) storage.delete(PLAYERS_TABLE, game.black_payment_hash)
    storage.delete(GAMES_TABLE, gameId)
    system.log(`chesswasm: deleted game ${gameId}`)
    return {deleted: true, gameId}
  })
}

export function getPublicChessGame(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const gameId = requiredText(request.gameId, 'gameId', 128)
    const game = getPublicGame(gameId)
    const player = playerForToken(game, cleanText(request.playerToken ?? request.player_token, 128))
    return {
      game: publicGame(game),
      players: publicPlayersFromGame(game),
      moves: publicMovesForGame(game),
      player: player ? publicPlayer(player, true) : null,
      canJoin: game.status === 'waiting' && Number(game.players_count || 0) < 2
    }
  })
}

export function joinChessGame(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const gameId = requiredText(request.gameId, 'gameId', 128)
    const lnAddress = normalizeLnAddress(request.lnAddress ?? request.ln_address)
    const game = getGame(gameId)
    if (game.status !== 'waiting') throw new Error('This chess game has already started.')
    if (Number(game.players_count || 0) >= 2) throw new Error('This chess game is already full.')

    const invoice = wallet.createInvoicePublic({
      sourceId: game.id,
      amount: Number(game.join_amount),
      currency: 'sat',
      memo: `Chess ${game.name} for ${lnAddress}`,
      extra: {
        game_id: game.id,
        ln_address: lnAddress
      }
    })

    return {
      paymentHash: invoice.paymentHash,
      paymentRequest: invoice.paymentRequest,
      checkingId: invoice.checkingId
    }
  })
}

export function recordChessPayment(eventJson) {
  return runJson(() => {
    const event = parseJsonObject(eventJson)
    const paymentHash = eventPaymentHash(event)
    const extensionExtra = event.extra?.extra_chesswasm || event.payment?.extra?.extra_chesswasm || {}
    const gameId = cleanText(
      extensionExtra.game_id || event.extra?.game_id || event.payment?.extra?.game_id,
      128
    )
    const lnAddress = normalizeLnAddress(
      extensionExtra.ln_address || event.extra?.ln_address || event.payment?.extra?.ln_address
    )
    if (!paymentHash) throw new Error('paymentHash is required.')
    if (!gameId) throw new Error('game_id is required.')

    const game = getGame(gameId)
    const existing = storage.get(PLAYERS_TABLE, paymentHash, null)
    if (existing) {
      return {game: publicGame(game), player: publicPlayer(existing, true), status: existing.status}
    }

    const paidSat = Math.abs(Number(event.amount || event.payment?.amount || 0)) / 1000
    if (paidSat && Math.trunc(paidSat) !== Number(game.join_amount)) {
      const player = markPlayer(paymentHash, gameId, lnAddress, '', 'amount-mismatch')
      const refund = refundPlayer(game, lnAddress, Math.trunc(paidSat), gameId, 'amount-mismatch')
      if (refund.ok) {
        player.status = 'refunded'
        storage.set(PLAYERS_TABLE, player)
      }
      return {game: publicGame(game), player: publicPlayer(player, true), status: player.status, refund}
    }
    if (game.status !== 'waiting' || Number(game.players_count || 0) >= 2) {
      const player = markPlayer(paymentHash, gameId, lnAddress, '', 'refund-pending')
      const refund = refundPlayer(game, lnAddress, Math.trunc(paidSat), gameId, 'full')
      if (refund.ok) {
        player.status = 'refunded'
        storage.set(PLAYERS_TABLE, player)
      }
      return {game: publicGame(game), player: publicPlayer(player, true), status: player.status, refund}
    }

    const paidPlayers = paidPlayersForGame(gameId)
    const color = paidPlayers.length === 0 ? 'white' : 'black'
    const player = markPlayer(paymentHash, gameId, lnAddress, color, 'paid')
    const now = system.now()
    const updatedGame = {
      ...game,
      players_count: paidPlayers.length + 1,
      white_ln_address: color === 'white' ? lnAddress : game.white_ln_address,
      black_ln_address: color === 'black' ? lnAddress : game.black_ln_address,
      white_payment_hash: color === 'white' ? paymentHash : game.white_payment_hash,
      black_payment_hash: color === 'black' ? paymentHash : game.black_payment_hash,
      status: paidPlayers.length + 1 === 2 ? 'active' : 'waiting',
      state_version: gameStateVersion(game) + 1,
      started_at: paidPlayers.length + 1 === 2 ? now : game.started_at,
      updated_at: now
    }
    storage.set(GAMES_TABLE, updatedGame)
    publishGame(updatedGame, 'player-paid')
    return {game: publicGame(updatedGame), player: publicPlayer(player, true), status: 'paid'}
  })
}

export function makeChessMove(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const gameId = requiredText(request.gameId, 'gameId', 128)
    const token = requiredText(request.playerToken ?? request.player_token, 'playerToken', 128)
    const from = normalizeSquare(request.from)
    const to = normalizeSquare(request.to)
    const promotion = normalizePromotion(request.promotion)
    const game = getGame(gameId)
    const player = requireActivePlayer(game, token)
    const actionId =
      normalizeActionId(request.actionId ?? request.action_id) ||
      `legacy-${gameStateVersion(game)}-${player.color}-${from}-${to}-${promotion}`
    const priorAction = moveForAction(gameId, actionId)
    if (priorAction) {
      return idempotentMoveResult(game, player, priorAction, {
        from,
        to,
        promotion
      })
    }
    const expectedVersion = optionalStateVersion(
      request.expectedStateVersion ?? request.expected_state_version
    )
    if (expectedVersion !== null && expectedVersion !== gameStateVersion(game)) {
      throw new Error('The game changed before this move. Refresh and try again.')
    }
    if (game.status !== 'active') throw new Error('This chess game is not active.')
    if (player.color !== game.turn) throw new Error(`It is ${game.turn}'s turn.`)

    const move = applyMove(game.fen, {from, to, promotion})
    const now = system.now()
    const moveNumber = Number(game.move_count || 0) + 1
    const status = move.checkmate ? 'completed' : move.draw ? 'draw' : 'active'
    const winnerColor = move.checkmate ? player.color : ''
    const winnerLnAddress = move.checkmate ? player.ln_address : ''
    const completed = move.checkmate || move.draw
    const updatedGame = versionedGame(game, {
      ...game,
      status,
      winner_color: winnerColor,
      winner_ln_address: winnerLnAddress,
      payout_pending: move.checkmate,
      payout_status: move.checkmate ? 'pending' : '',
      fen: move.fen,
      pgn: appendPgn(game.pgn, moveNumber, player.color, move.san),
      turn: move.turn,
      move_count: moveNumber,
      last_action_id: actionId,
      updated_at: now,
      completed_at: completed ? now : null
    })
    const moveRecord = {
      id: `${gameId}-${moveNumber}`,
      game_id: gameId,
      move_number: moveNumber,
      action_id: actionId,
      state_version: gameStateVersion(game) + 1,
      game_status: status,
      next_turn: move.turn,
      winner_color: winnerColor,
      color: player.color,
      from_square: from,
      to_square: to,
      promotion,
      san: move.san,
      fen: move.fen,
      created_at: now
    }
    storage.set(MOVES_TABLE, moveRecord)
    storage.set(GAMES_TABLE, updatedGame)
    system.log(
      `chesswasm: committed move ${gameId} ${actionId} version ${updatedGame.state_version}`
    )
    publishGame(updatedGame, 'move')
    return {
      game: publicGame(updatedGame),
      move: publicMove(moveRecord),
      player: publicPlayer(player, true),
      payout: {ok: true, pending: move.checkmate}
    }
  })
}

export function resignChessGame(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const gameId = requiredText(request.gameId, 'gameId', 128)
    const token = requiredText(request.playerToken ?? request.player_token, 'playerToken', 128)
    const game = getGame(gameId)
    const player = requireActivePlayer(game, token)
    if (game.status !== 'active') throw new Error('Only active chess games can be resigned.')
    const winnerColor = player.color === 'white' ? 'black' : 'white'
    const winner = playerFromGameByColor(game, winnerColor)
    if (!winner) throw new Error('Opponent is missing.')
    const now = system.now()
    const updatedGame = versionedGame(game, {
      ...game,
      status: 'completed',
      winner_color: winnerColor,
      winner_ln_address: winner.ln_address,
      payout_pending: true,
      payout_status: 'pending',
      updated_at: now,
      completed_at: now
    })
    storage.set(GAMES_TABLE, updatedGame)
    publishGame(updatedGame, 'resigned')
    return {
      game: publicGame(updatedGame),
      player: publicPlayer(player, true),
      payout: {ok: true, pending: true}
    }
  })
}

export function settlePlayerChessPayout(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const gameId = requiredText(request.gameId, 'gameId', 128)
    const token = requiredText(request.playerToken ?? request.player_token, 'playerToken', 128)
    const game = getGame(gameId)
    requireActivePlayer(game, token)
    if (game.status !== 'completed') throw new Error('Only completed chess games can be settled.')
    if (!game.winner_ln_address || !game.winner_color) throw new Error('Chess winner is missing.')
    if (game.payout_pending !== true) {
      return {
        game: publicGame(game),
        payout: {ok: game.payout_status === 'paid', pending: false, alreadySettled: true}
      }
    }
    if (game.payout_status === 'processing') {
      return {
        game: publicGame(game),
        payout: {ok: true, pending: true, processing: true}
      }
    }
    const settlement = settleChessPayout(game, 'settled')
    return {game: publicGame(settlement.game), payout: settlement.payout}
  })
}

export function settleChessGame(requestJson) {
  return runJson(() => {
    const request = parseJsonObject(requestJson)
    const gameId = requiredText(request.gameId, 'gameId', 128)
    const game = getGame(gameId)
    if (game.status !== 'completed') throw new Error('Only completed chess games can be settled.')
    if (!game.winner_ln_address || !game.winner_color) throw new Error('Chess winner is missing.')
    if (game.payout_pending !== true) throw new Error('This chess game is already settled.')
    if (game.payout_status === 'processing') throw new Error('Payout is already processing.')
    const settlement = settleChessPayout(game, 'settled')
    return {game: publicGame(settlement.game), payout: settlement.payout}
  })
}

function settleChessPayout(game, event) {
  const processingGame = versionedGame(game, {
    ...game,
    status: 'completed',
    payout_pending: true,
    payout_status: 'processing',
    updated_at: system.now(),
    completed_at: game.completed_at || system.now()
  })
  storage.set(GAMES_TABLE, processingGame)

  const settings = getSettingsById(processingGame.settings_id)
  let payout
  try {
    payout = payWinner({
      walletId: processingGame.wallet_id || settings.wallet_id,
      lnAddress: processingGame.winner_ln_address,
      maxSat: payoutAmount(processingGame),
      description: `Chess winnings for ${processingGame.name}`,
      gameId: processingGame.id,
      color: processingGame.winner_color
    })
  } catch (error) {
    payout = {ok: false, error: errorMessage(error)}
  }
  const updatedGame = versionedGame(processingGame, {
    ...processingGame,
    payout_pending: !payout.ok,
    payout_status: payout.ok ? 'paid' : 'failed',
    updated_at: system.now()
  })
  storage.set(GAMES_TABLE, updatedGame)
  publishGame(updatedGame, event)
  return {game: updatedGame, payout}
}

function publishGame(game, event) {
  try {
    websocket.publish(`game:${game.id}`, {
      type: 'server',
      event,
      game: publicGame(game)
    })
  } catch (error) {
    system.log(`chesswasm websocket publish failed: ${errorMessage(error)}`, 'warning')
  }
}

function runJson(fn) {
  try {
    return JSON.stringify({ok: true, data: fn()})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ok: false, error: message})
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function parseJsonObject(value) {
  if (!value) return {}
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request must be a JSON object.')
  }
  return parsed
}

function getSettings() {
  const response = storage.getPaginated(SETTINGS_TABLE, {
    sortBy: 'created_at',
    descending: false,
    limit: 1,
    offset: 0
  })
  return response.data[0] || defaultSettings()
}

function getSettingsById(settingsId) {
  const settings = settingsId
    ? storage.get(SETTINGS_TABLE, settingsId, null)
    : getSettings()
  if (!settings) throw new Error('Chess settings not found.')
  return settings
}

function newSettingsId() {
  const generatedId = system.id('chess-settings')
  const settingsId = typeof generatedId === 'string' ? generatedId : generatedId?.id
  if (!settingsId) throw new Error('Could not generate a chess settings ID.')
  return settingsId
}

function defaultSettings() {
  const now = system.now()
  return {
    id: '',
    wallet_id: '',
    wallet_name: '',
    enabled: false,
    haircut: 0,
    join_amount: 100,
    max_bet: 100000000,
    created_at: now,
    updated_at: now
  }
}

function getGame(gameId) {
  const game = storage.get(GAMES_TABLE, gameId, null)
  if (!game) throw new Error('Chess game not found.')
  return game
}

function gameStateVersion(game) {
  return Math.max(0, Number(game.state_version || 0))
}

function versionedGame(game, updatedGame) {
  return {
    ...updatedGame,
    state_version: gameStateVersion(game) + 1,
    last_action_id: updatedGame.last_action_id || game.last_action_id || ''
  }
}

function getPublicGame(gameId) {
  const game = storage.getPublic(GAMES_TABLE, gameId, null)
  if (!game) throw new Error('Chess game not found.')
  return game
}

function markPlayer(paymentHash, gameId, lnAddress, color, status) {
  const existing = storage.get(PLAYERS_TABLE, paymentHash, null)
  const now = system.now()
  const player = {
    id: paymentHash,
    game_id: gameId,
    ln_address: existing?.ln_address || lnAddress,
    payment_hash: paymentHash,
    color: existing?.color || color,
    status,
    created_at: existing?.created_at || now,
    paid_at: ['paid', 'refund-pending'].includes(status) ? existing?.paid_at || now : existing?.paid_at || null
  }
  storage.set(PLAYERS_TABLE, player)
  return player
}

function paidPlayersForGame(gameId) {
  return storage.getPaginated(PLAYERS_TABLE, {
    filters: {game_id: gameId, status: 'paid'},
    sortBy: 'paid_at',
    descending: false,
    limit: 10,
    offset: 0
  }).data
}

function publicPlayersForGame(gameId) {
  return paidPlayersForGame(gameId).map(player => publicPlayer(player, false))
}

function publicPlayersFromGame(game) {
  const players = []
  if (game.white_ln_address) {
    players.push(publicPlayer({
      id: '',
      game_id: game.id,
      ln_address: game.white_ln_address,
      payment_hash: '',
      color: 'white',
      status: 'paid',
      paid_at: 0
    }, false))
  }
  if (game.black_ln_address) {
    players.push(publicPlayer({
      id: '',
      game_id: game.id,
      ln_address: game.black_ln_address,
      payment_hash: '',
      color: 'black',
      status: 'paid',
      paid_at: 0
    }, false))
  }
  return players
}

function publicMovesForGame(game) {
  return publicMovesFromPgn(game, 20)
}

function moveForAction(gameId, actionId) {
  return storage.getPaginated(MOVES_TABLE, {
    filters: {game_id: gameId, action_id: actionId},
    sortBy: 'move_number',
    descending: false,
    limit: 1,
    offset: 0
  }).data[0] || null
}

function idempotentMoveResult(game, player, move, request) {
  if (
    move.color !== player.color ||
    move.from_square !== request.from ||
    move.to_square !== request.to ||
    (move.promotion || '') !== request.promotion
  ) {
    throw new Error('That move action ID was already used for a different move.')
  }
  const reconciledGame = reconcileMove(game, player, move)
  return {
    game: publicGame(reconciledGame),
    move: publicMove(move),
    player: publicPlayer(player, true),
    payout: {ok: true, pending: reconciledGame.payout_pending === true},
    idempotent: true
  }
}

function reconcileMove(game, player, move) {
  if (game.last_action_id === move.action_id) return game
  const moveNumber = Number(move.move_number || 0)
  if (moveNumber !== Number(game.move_count || 0) + 1) {
    throw new Error('That move was superseded by newer game state. Refresh the game.')
  }
  const moveVersion = Math.max(
    gameStateVersion(game) + 1,
    Number(move.state_version || 0)
  )
  const status = move.game_status || 'active'
  const winnerColor = move.winner_color || ''
  const completed = status === 'completed' || status === 'draw'
  const reconciledGame = {
    ...game,
    status,
    winner_color: winnerColor,
    winner_ln_address: winnerColor ? player.ln_address : '',
    payout_pending: winnerColor !== '',
    payout_status: winnerColor ? 'pending' : '',
    fen: move.fen,
    pgn: appendPgn(game.pgn, moveNumber, move.color, move.san),
    turn: move.next_turn || (move.color === 'white' ? 'black' : 'white'),
    move_count: moveNumber,
    state_version: moveVersion,
    last_action_id: move.action_id,
    updated_at: move.created_at,
    completed_at: completed ? move.created_at : null
  }
  storage.set(GAMES_TABLE, reconciledGame)
  system.log(
    `chesswasm: recovered move ${game.id} ${move.action_id} version ${moveVersion}`,
    'warning'
  )
  publishGame(reconciledGame, 'move')
  return reconciledGame
}

function publicMovesFromPgn(game, limit = 20) {
  const tokens = cleanText(game.pgn || '', 4000)
    .split(/\s+/)
    .filter(token => token && !/^\d+\.$/.test(token))
  const start = Math.max(0, tokens.length - limit)
  return tokens.slice(start).map((token, index) => ({
    id: `${game.id}-${start + index + 1}`,
    gameId: game.id,
    moveNumber: start + index + 1,
    color: (start + index) % 2 === 0 ? 'white' : 'black',
    from: token.slice(0, 2),
    to: token.slice(2, 4),
    promotion: token.slice(4, 5),
    san: token,
    fen: '',
    createdAt: 0
  }))
}

function playerForToken(game, token) {
  if (!token) return null
  if (token === game.white_payment_hash) {
    return {
      id: token,
      game_id: game.id,
      ln_address: game.white_ln_address,
      payment_hash: token,
      color: 'white',
      status: 'paid',
      paid_at: 0
    }
  }
  if (token === game.black_payment_hash) {
    return {
      id: token,
      game_id: game.id,
      ln_address: game.black_ln_address,
      payment_hash: token,
      color: 'black',
      status: 'paid',
      paid_at: 0
    }
  }
  return null
}

function playerByColor(gameId, color) {
  return paidPlayersForGame(gameId).find(player => player.color === color) || null
}

function playerFromGameByColor(game, color) {
  return playerForToken(game, color === 'white' ? game.white_payment_hash : game.black_payment_hash)
}

function requireActivePlayer(game, token) {
  const player = playerForToken(game, token)
  if (!player || player.status !== 'paid' || !['white', 'black'].includes(player.color)) {
    throw new Error('A paid player token is required.')
  }
  return player
}

function payoutAmount(game) {
  const total = Number(game.join_amount || 0) * 2
  const haircut = total * (Number(game.haircut || 0) / 100)
  return Math.max(0, Math.trunc(total - haircut))
}

function payWinner({walletId, lnAddress, maxSat, description, gameId, color}) {
  if (!walletId) return {ok: false, error: 'Chess wallet is not configured.'}
  if (!lnAddress) return {ok: false, error: 'Lightning address is missing.'}
  if (!Number.isInteger(maxSat) || maxSat <= 0) {
    return {ok: false, error: 'Payout amount must be greater than zero.'}
  }
  const response = wallet.payLnurl({
    walletId,
    lnurl: lnAddress,
    amount: maxSat,
    currency: 'sat',
    comment: 'Chess winnings',
    maxSat,
    description,
    extra: {
      chess_game_id: gameId,
      chess_winner_color: color
    }
  })
  return {
    ok: response.ok === true,
    error: response.error || '',
    checkingId: response.checkingId || '',
    paymentHash: response.paymentHash || '',
    status: response.status || '',
    amountMsat: Number(response.amountMsat || 0),
    feeMsat: Number(response.feeMsat || 0)
  }
}

function refundPlayer(game, lnAddress, amountSats, gameId, reason) {
  if (!Number.isInteger(amountSats) || amountSats <= 0) {
    return {ok: false, error: 'Refund amount must be greater than zero.'}
  }
  if (!game.wallet_id) return {ok: false, error: 'Chess wallet is not configured.'}
  if (!lnAddress) return {ok: false, error: 'Lightning address is missing.'}
  const response = wallet.payLnurl({
    walletId: game.wallet_id,
    lnurl: lnAddress,
    amount: amountSats,
    currency: 'sat',
    comment: 'Chess refund',
    maxSat: amountSats,
    description: `Chess refund for ${game.name}`,
    extra: {
      chess_game_id: gameId,
      chess_refund_reason: reason
    }
  })
  return {
    ok: response.ok === true,
    error: response.error || '',
    checkingId: response.checkingId || '',
    paymentHash: response.paymentHash || '',
    status: response.status || ''
  }
}

function publicSettings(settings) {
  return {
    id: settings.id,
    enabled: settings.enabled === true,
    haircut: Number(settings.haircut || 0),
    walletId: settings.wallet_id || '',
    walletName: settings.wallet_name || '',
    createdAt: Number(settings.created_at || 0),
    updatedAt: Number(settings.updated_at || 0)
  }
}

function publicGame(game) {
  const boardStatus = boardStatusForGame(game)
  return {
    id: game.id,
    settingsId: game.settings_id,
    name: game.name,
    joinAmount: Number(game.join_amount || 0),
    haircut: Number(game.haircut || 0),
    playersCount: Number(game.players_count || 0),
    status: game.status || 'waiting',
    winnerColor: game.winner_color || '',
    winnerLnAddress: maskLnAddress(game.winner_ln_address || ''),
    payoutPending: game.payout_pending === true,
    payoutStatus: game.payout_status || '',
    inCheck: boardStatus.inCheck,
    checkmate: boardStatus.checkmate,
    checkedColor: boardStatus.checkedColor,
    fen: game.fen || START_FEN,
    pgn: game.pgn || '',
    turn: game.turn || 'white',
    moveCount: Number(game.move_count || 0),
    stateVersion: gameStateVersion(game),
    lastActionId: game.last_action_id || '',
    createdAt: Number(game.created_at || 0),
    updatedAt: Number(game.updated_at || 0),
    startedAt: Number(game.started_at || 0),
    completedAt: Number(game.completed_at || 0)
  }
}

function publicPlayer(player, includeToken) {
  return {
    id: includeToken ? player.id : '',
    gameId: player.game_id,
    lnAddress: maskLnAddress(player.ln_address),
    color: player.color || '',
    status: player.status || 'pending',
    paidAt: Number(player.paid_at || 0)
  }
}

function publicMove(move) {
  if (!move) return null
  return {
    id: move.id,
    gameId: move.game_id,
    moveNumber: Number(move.move_number || 0),
    actionId: move.action_id || '',
    color: move.color,
    from: move.from_square,
    to: move.to_square,
    promotion: move.promotion || '',
    san: move.san || '',
    fen: move.fen,
    createdAt: Number(move.created_at || 0)
  }
}

function applyMove(fen, request) {
  const state = parseFen(fen)
  const legal = legalMoveForRequest(state, request)
  if (!legal) throw new Error('Illegal chess move.')
  const next = makeMove(state, legal)
  const inCheck = isInCheck(next, next.turn)
  const hasReply = hasLegalMove(next)
  const checkmate = inCheck && !hasReply
  return {
    fen: toFen(next),
    san: moveLabel(legal, {check: inCheck, checkmate}),
    turn: next.turn === 'w' ? 'white' : 'black',
    check: inCheck,
    checkmate,
    draw: !inCheck && !hasReply
  }
}

function boardStatusForGame(game) {
  try {
    const state = parseFen(game.fen || START_FEN)
    const inCheck = isInCheck(state, state.turn)
    const lastMove = cleanText(game.pgn || '', 4000).split(/\s+/).pop() || ''
    const checkmate = game.status === 'completed' && lastMove.endsWith('#')
    return {
      inCheck,
      checkmate,
      draw: game.status === 'draw',
      checkedColor: inCheck ? colorName(state.turn) : ''
    }
  } catch (_) {
    return {inCheck: false, checkmate: false, draw: false, checkedColor: ''}
  }
}

function parseFen(fen) {
  const parts = String(fen || START_FEN).split(/\s+/)
  if (parts.length < 4) throw new Error('Invalid chess position.')
  const board = new Map()
  const ranks = parts[0].split('/')
  if (ranks.length !== 8) throw new Error('Invalid chess board.')
  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0
    for (const char of rankText) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char)
      } else {
        board.set(`${FILES[fileIndex]}${8 - rankIndex}`, char)
        fileIndex += 1
      }
    }
    if (fileIndex !== 8) throw new Error('Invalid chess board.')
  })
  return {
    board,
    turn: parts[1] === 'b' ? 'b' : 'w',
    castling: parts[2] || '-',
    ep: parts[3] || '-',
    halfmove: Number(parts[4] || 0),
    fullmove: Number(parts[5] || 1)
  }
}

function toFen(state) {
  const ranks = []
  for (let rank = 8; rank >= 1; rank -= 1) {
    let text = ''
    let empty = 0
    for (const file of FILES) {
      const piece = state.board.get(`${file}${rank}`)
      if (piece) {
        if (empty) text += String(empty)
        empty = 0
        text += piece
      } else {
        empty += 1
      }
    }
    if (empty) text += String(empty)
    ranks.push(text)
  }
  return `${ranks.join('/')} ${state.turn} ${state.castling || '-'} ${state.ep || '-'} ${state.halfmove || 0} ${state.fullmove || 1}`
}

function legalMoveForRequest(state, request) {
  const piece = state.board.get(request.from)
  if (!piece || pieceColor(piece) !== state.turn) return null
  const moves = generatePieceMoves(state, request.from, piece).filter(
    move => move.to === request.to && (move.promotion || '') === request.promotion
  )
  for (const move of moves) {
    if (!isInCheck(makeMove(state, move), state.turn)) return move
  }
  return null
}

function hasLegalMove(state) {
  for (const [square, piece] of state.board.entries()) {
    if (pieceColor(piece) !== state.turn) continue
    for (const move of generatePieceMoves(state, square, piece)) {
      if (!isInCheck(makeMove(state, move), state.turn)) return true
    }
  }
  return false
}

function generatePieceMoves(state, square, piece) {
  const moves = []
  const lower = piece.toLowerCase()
  if (lower === 'p') pawnMoves(state, square, piece, moves)
  if (lower === 'n') stepMoves(state, square, piece, moves, [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]])
  if (lower === 'b') slideMoves(state, square, piece, moves, [[1, 1], [1, -1], [-1, -1], [-1, 1]])
  if (lower === 'r') slideMoves(state, square, piece, moves, [[1, 0], [0, -1], [-1, 0], [0, 1]])
  if (lower === 'q') slideMoves(state, square, piece, moves, [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 0], [0, -1], [-1, 0], [0, 1]])
  if (lower === 'k') kingMoves(state, square, piece, moves)
  return moves
}

function pawnMoves(state, square, piece, moves) {
  const color = pieceColor(piece)
  const direction = color === 'w' ? 1 : -1
  const startRank = color === 'w' ? 2 : 7
  const promotionRank = color === 'w' ? 8 : 1
  const [file, rank] = squareToPoint(square)
  const one = pointToSquare(file, rank + direction)
  if (one && !state.board.has(one)) {
    addPawnMove(square, one, piece, moves, promotionRank)
    const two = pointToSquare(file, rank + direction * 2)
    if (rank === startRank && two && !state.board.has(two)) {
      moves.push({from: square, to: two, piece})
    }
  }
  for (const df of [-1, 1]) {
    const target = pointToSquare(file + df, rank + direction)
    if (!target) continue
    const targetPiece = state.board.get(target)
    if ((targetPiece && pieceColor(targetPiece) !== color) || target === state.ep) {
      addPawnMove(square, target, piece, moves, promotionRank)
    }
  }
}

function addPawnMove(from, to, piece, moves, promotionRank) {
  const rank = Number(to[1])
  if (rank === promotionRank) {
    for (const promotion of ['q', 'r', 'b', 'n']) moves.push({from, to, piece, promotion})
  } else {
    moves.push({from, to, piece})
  }
}

function stepMoves(state, square, piece, moves, deltas) {
  const color = pieceColor(piece)
  const [file, rank] = squareToPoint(square)
  for (const [df, dr] of deltas) {
    const target = pointToSquare(file + df, rank + dr)
    if (!target) continue
    const targetPiece = state.board.get(target)
    if (!targetPiece || pieceColor(targetPiece) !== color) moves.push({from: square, to: target, piece})
  }
}

function slideMoves(state, square, piece, moves, deltas) {
  const color = pieceColor(piece)
  const [file, rank] = squareToPoint(square)
  for (const [df, dr] of deltas) {
    let nf = file + df
    let nr = rank + dr
    while (true) {
      const target = pointToSquare(nf, nr)
      if (!target) break
      const targetPiece = state.board.get(target)
      if (!targetPiece) {
        moves.push({from: square, to: target, piece})
      } else {
        if (pieceColor(targetPiece) !== color) moves.push({from: square, to: target, piece})
        break
      }
      nf += df
      nr += dr
    }
  }
}

function kingMoves(state, square, piece, moves) {
  stepMoves(state, square, piece, moves, [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]])
}

function makeMove(state, move) {
  const next = {
    board: new Map(state.board),
    turn: opposite(state.turn),
    castling: '-',
    ep: '-',
    halfmove: move.piece.toLowerCase() === 'p' || state.board.has(move.to) ? 0 : Number(state.halfmove || 0) + 1,
    fullmove: state.turn === 'b' ? Number(state.fullmove || 1) + 1 : Number(state.fullmove || 1)
  }
  next.board.delete(move.from)
  if (move.to === state.ep && move.piece.toLowerCase() === 'p' && !state.board.has(move.to)) {
    const [file, rank] = squareToPoint(move.to)
    next.board.delete(pointToSquare(file, rank + (state.turn === 'w' ? -1 : 1)))
  }
  const [fromFile, fromRank] = squareToPoint(move.from)
  const [toFile, toRank] = squareToPoint(move.to)
  if (move.piece.toLowerCase() === 'p' && Math.abs(toRank - fromRank) === 2) {
    next.ep = pointToSquare(fromFile, (fromRank + toRank) / 2)
  }
  const promoted = move.promotion
    ? state.turn === 'w'
      ? move.promotion.toUpperCase()
      : move.promotion
    : move.piece
  next.board.set(move.to, promoted)
  return next
}

function isInCheck(state, color) {
  const king = color === 'w' ? 'K' : 'k'
  let kingSquare = ''
  for (const [square, piece] of state.board.entries()) {
    if (piece === king) kingSquare = square
  }
  if (!kingSquare) return true
  return isSquareAttacked(state, kingSquare, opposite(color))
}

function isSquareAttacked(state, square, byColor) {
  const [file, rank] = squareToPoint(square)
  const pawnRank = byColor === 'w' ? rank - 1 : rank + 1
  const pawn = byColor === 'w' ? 'P' : 'p'
  for (const pawnFile of [file - 1, file + 1]) {
    if (state.board.get(pointToSquare(pawnFile, pawnRank)) === pawn) return true
  }

  const knight = byColor === 'w' ? 'N' : 'n'
  for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
    if (state.board.get(pointToSquare(file + df, rank + dr)) === knight) return true
  }

  if (isAttackedOnLine(state, file, rank, byColor, [[1, 1], [1, -1], [-1, -1], [-1, 1]], ['b', 'q'])) return true
  if (isAttackedOnLine(state, file, rank, byColor, [[1, 0], [0, -1], [-1, 0], [0, 1]], ['r', 'q'])) return true

  const king = byColor === 'w' ? 'K' : 'k'
  for (const [df, dr] of [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]) {
    if (state.board.get(pointToSquare(file + df, rank + dr)) === king) return true
  }
  return false
}

function isAttackedOnLine(state, file, rank, byColor, deltas, attackers) {
  for (const [df, dr] of deltas) {
    let nf = file + df
    let nr = rank + dr
    while (true) {
      const target = pointToSquare(nf, nr)
      if (!target) break
      const piece = state.board.get(target)
      if (piece) {
        if (pieceColor(piece) === byColor && attackers.includes(piece.toLowerCase())) return true
        break
      }
      nf += df
      nr += dr
    }
  }
  return false
}

function squareToPoint(square) {
  return [FILES.indexOf(square[0]) + 1, Number(square[1])]
}

function pointToSquare(file, rank) {
  if (file < 1 || file > 8 || rank < 1 || rank > 8) return ''
  return `${FILES[file - 1]}${rank}`
}

function pieceColor(piece) {
  return piece === piece.toUpperCase() ? 'w' : 'b'
}

function opposite(color) {
  return color === 'w' ? 'b' : 'w'
}

function colorName(color) {
  return color === 'w' ? 'white' : 'black'
}

function moveLabel(move, result = {}) {
  const suffix = result.checkmate ? '#' : result.check ? '+' : ''
  return `${move.from}${move.to}${move.promotion || ''}${suffix}`
}

function appendPgn(pgn, moveNumber, color, san) {
  const prefix = color === 'white' ? `${Math.floor((moveNumber + 1) / 2)}. ` : ''
  return `${cleanText(pgn, 4000)}${pgn ? ' ' : ''}${prefix}${san}`.trim()
}

function normalizeInteger(value, fallback, min, max) {
  const number = Number(value ?? fallback)
  if (!Number.isInteger(number)) throw new Error('value must be an integer.')
  if (number < min) throw new Error(`value must be at least ${min}.`)
  if (number > max) throw new Error(`value must be at most ${max}.`)
  return number
}

function normalizePercent(value, fallback) {
  const number = Number(value ?? fallback)
  if (!Number.isFinite(number)) throw new Error('haircut must be a number.')
  if (number < 0 || number > 100) throw new Error('haircut must be between 0 and 100.')
  return number
}

function normalizePageSize(value) {
  const size = Number(value || 10)
  if (!Number.isInteger(size) || size <= 0) return 10
  return Math.min(size, 100)
}

function normalizePage(value) {
  const page = Number(value || 1)
  if (!Number.isInteger(page) || page <= 0) return 1
  return page
}

function normalizeGameSortBy(value) {
  return (
    {
      name: 'name',
      joinAmount: 'join_amount',
      playersCount: 'players_count',
      status: 'status',
      createdAt: 'created_at'
    }[value] || 'created_at'
  )
}

function normalizeLnAddress(value) {
  const lnAddress = cleanText(value, 180).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lnAddress)) {
    throw new Error('A valid Lightning address is required.')
  }
  return lnAddress
}

function normalizeSquare(value) {
  const square = cleanText(value, 2).toLowerCase()
  if (!/^[a-h][1-8]$/.test(square)) throw new Error('A valid chess square is required.')
  return square
}

function normalizePromotion(value) {
  const promotion = cleanText(value, 1).toLowerCase()
  if (!promotion) return ''
  if (!['q', 'r', 'b', 'n'].includes(promotion)) throw new Error('Invalid promotion piece.')
  return promotion
}

function normalizeActionId(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96)
}

function optionalStateVersion(value) {
  if (value === undefined || value === null || value === '') return null
  const version = Number(value)
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('expectedStateVersion must be a non-negative integer.')
  }
  return version
}

function eventPaymentHash(event) {
  return (
    cleanText(event.paymentHash, 128) ||
    cleanText(event.payment_hash, 128) ||
    cleanText(event.extra?.paymentHash, 128) ||
    cleanText(event.payment?.payment_hash, 128) ||
    cleanText(event.payment?.paymentHash, 128)
  )
}

function cleanId(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function requiredText(value, field, maxLength) {
  const text = cleanText(value, maxLength)
  if (!text) throw new Error(`${field} is required.`)
  return text
}

function maskLnAddress(lnAddress) {
  const value = cleanText(lnAddress, 180)
  const [name, domain] = value.split('@')
  if (!name || !domain) return value
  return `${name.slice(0, 3)}${name.length > 3 ? '...' : ''}@${domain}`
}

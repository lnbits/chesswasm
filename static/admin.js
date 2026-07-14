const client = window.createLNbitsExtensionClient({
  extensionId: 'chesswasm'
})

const app = Vue.createApp({
  data() {
    return {
      loading: false,
      saving: false,
      creating: false,
      settings: {
        enabled: false,
        haircut: 0,
        walletId: ''
      },
      gameForm: {
        name: 'Paid chess game',
        joinAmount: 100
      },
      wallets: [],
      games: [],
      pagination: {
        sortBy: 'createdAt',
        descending: true,
        page: 1,
        rowsPerPage: 10,
        rowsNumber: 0
      },
      search: '',
      columns: [
        {name: 'name', label: 'Game', field: 'name', align: 'left', sortable: true},
        {name: 'joinAmount', label: 'Join sats', field: 'joinAmount', align: 'right', sortable: true},
        {name: 'players', label: 'Players', field: 'playersCount', align: 'left', sortable: false},
        {name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true},
        {name: 'winner', label: 'Winner', field: 'winnerLnAddress', align: 'left', sortable: false},
        {name: 'actions', label: '', field: 'id', align: 'right', sortable: false}
      ]
    }
  },

  computed: {
    selectedWalletName() {
      return this.wallets.find(wallet => wallet.id === this.effectiveWalletId)?.name || ''
    },

    canSave() {
      return !this.settings.enabled || !!this.effectiveWalletId
    },

    canCreate() {
      return (
        this.settings.enabled &&
        this.effectiveWalletId &&
        this.gameForm.name &&
        Number(this.gameForm.joinAmount) > 0
      )
    },

    effectiveWalletId() {
      return this.settings.walletId || this.wallets[0]?.id || ''
    }
  },

  async mounted() {
    this.loading = true
    try {
      await Promise.all([this.fetchWallets(), this.fetchSettings(), this.fetchGames()])
    } finally {
      this.loading = false
    }
  },

  methods: {
    async fetchWallets() {
      try {
        const response = await client.listWallets()
        this.wallets = response.wallets || []
      } catch (error) {
        this.showError(error)
      }
    },

    async fetchSettings() {
      try {
        const response = await client.getSettings()
        this.settings = {...this.settings, ...(response.settings || {})}
        if (!this.settings.walletId && this.wallets.length) {
          this.settings.walletId = this.wallets[0].id
        }
      } catch (error) {
        this.showError(error)
      }
    },

    async saveSettings() {
      if (!this.canSave) return
      this.saving = true
      try {
        const response = await client.saveSettings({
          enabled: this.settings.enabled,
          walletId: this.effectiveWalletId,
          haircut: Number(this.settings.haircut),
          walletName: this.selectedWalletName
        })
        this.settings = response.settings
        this.notify('Chess settings saved.', 'positive')
      } catch (error) {
        this.showError(error)
      } finally {
        this.saving = false
      }
    },

    async createGame() {
      if (!this.canCreate) return
      this.creating = true
      try {
        await client.createGame({
          name: this.gameForm.name,
          joinAmount: Number(this.gameForm.joinAmount)
        })
        this.notify('Chess game created.', 'positive')
        await this.fetchGames()
      } catch (error) {
        this.showError(error)
      } finally {
        this.creating = false
      }
    },

    async fetchGames(props = {}) {
      const pagination = props.pagination || this.pagination
      try {
        const response = await client.listGames({
          page: pagination.page,
          rowsPerPage: pagination.rowsPerPage,
          sortBy: pagination.sortBy,
          descending: pagination.descending,
          search: this.search
        })
        this.games = response.games || []
        this.pagination = {...pagination, rowsNumber: response.total || 0}
      } catch (error) {
        this.showError(error)
      }
    },

    publicUrl(game) {
      return new URL(`/ext/chesswasm/games/${encodeURIComponent(game.id)}`, window.location.href).href
    },

    async copyGame(game) {
      await navigator.clipboard?.writeText(this.publicUrl(game)).then(() => {
        this.notify('Game link copied.', 'positive')
      }).catch(error => {
        console.warn('[chesswasm admin] failed to copy game link', error)
      })
    },

    async settleGame(game) {
      try {
        await client.settleGame(game.id)
        this.notify('Winner payout sent.', 'positive')
        await this.fetchGames()
      } catch (error) {
        this.showError(error)
      }
    },

    statusLabel(game) {
      if (game.status === 'completed' && game.payoutPending) return 'Payout pending'
      if (game.status === 'completed') return 'Complete'
      if (game.status === 'draw') return 'Draw'
      if (game.status === 'active') return 'Active'
      return 'Waiting'
    },

    notify(message, type = 'info') {
      Quasar.Notify.create({type, message})
    },

    showError(error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[chesswasm admin]', message, error)
      Quasar.Notify.create({type: 'negative', message})
    }
  },

  render() {
    const h = Vue.h
    const component = name => Vue.resolveComponent(name)
    const QBadge = component('q-badge')
    const QBtn = component('q-btn')
    const QCard = component('q-card')
    const QInput = component('q-input')
    const QLayout = component('q-layout')
    const QTable = component('q-table')
    const QTd = component('q-td')
    const QToggle = component('q-toggle')
    const QTooltip = component('q-tooltip')

    const settingsInput = (field, props = {}) =>
      h(QInput, {
        modelValue: this.settings[field],
        'onUpdate:modelValue': value => {
          this.settings[field] = Number(value)
        },
        filled: true,
        dense: true,
        dark: true,
        ...props
      })

    const gameInput = (field, props = {}, parse = value => value) =>
      h(QInput, {
        modelValue: this.gameForm[field],
        'onUpdate:modelValue': value => {
          this.gameForm[field] = parse(value)
        },
        filled: true,
        dense: true,
        dark: true,
        ...props
      })

    return h(QLayout, {view: 'hHh lpR fFf', class: 'shell q-pa-md'}, () => [
      h('div', {class: 'row items-center q-mb-md q-gutter-sm'}, [
        h('div', {class: 'chess-mark', 'aria-hidden': 'true'}, '♞'),
        h('div', [
          h('h1', {class: 'text-h4 text-weight-bold q-my-none'}, 'Chess'),
          h('p', {class: 'text-subtitle2 text-grey-5 q-my-none'}, 'Paid public chess games.')
        ])
      ]),

      h('div', {class: 'row q-col-gutter-md'}, [
        h('div', {class: 'col-12 col-md-5'}, [
          h(QCard, {dark: true, class: 'panel q-pa-md'}, () => [
            h('h2', {class: 'text-h6 text-weight-bold q-my-none q-mb-md'}, 'Settings'),
            h(QToggle, {
              modelValue: this.settings.enabled,
              'onUpdate:modelValue': value => {
                this.settings.enabled = value
              },
              label: 'Enable chess games',
              color: 'primary'
            }),
            h('div', {class: 'row q-col-gutter-sm q-mt-xs'}, [
              h('div', {class: 'col-12 col-sm-6'}, [
                settingsInput('haircut', {type: 'number', min: 0, max: 100, label: 'Haircut %'})
              ])
            ]),
            h(QBtn, {
              class: 'q-mt-md',
              color: 'primary',
              loading: this.saving,
              disable: !this.canSave,
              onClick: this.saveSettings
            }, () => 'Save Settings')
          ]),

          h(QCard, {dark: true, class: 'panel q-pa-md q-mt-md'}, () => [
            h('h2', {class: 'text-h6 text-weight-bold q-my-none q-mb-md'}, 'New Game'),
            gameInput('name', {label: 'Title'}, value => String(value || '').trim()),
            gameInput('joinAmount', {type: 'number', min: 1, label: 'Join sats', class: 'q-mt-sm'}, Number),
            h(QBtn, {
              class: 'q-mt-md',
              color: 'primary',
              loading: this.creating,
              disable: !this.canCreate,
              onClick: this.createGame
            }, () => 'Create Game')
          ])
        ]),

        h('div', {class: 'col-12 col-md-7'}, [
          h(QCard, {dark: true, class: 'panel q-pa-md'}, () => [
            h('div', {class: 'row items-center q-col-gutter-sm q-mb-md'}, [
              h('div', {class: 'col'}, [
                h('h2', {class: 'text-h6 text-weight-bold q-my-none'}, 'Games')
              ]),
              h('div', {class: 'col-12 col-sm-5'}, [
                h(QInput, {
                  modelValue: this.search,
                  'onUpdate:modelValue': value => {
                    this.search = value
                  },
                  debounce: 300,
                  filled: true,
                  dense: true,
                  dark: true,
                  clearable: true,
                  label: 'Search',
                  onClear: () => {
                    this.search = ''
                    this.fetchGames()
                  },
                  onKeyup: event => {
                    if (event.key === 'Enter') this.fetchGames()
                  }
                })
              ])
            ]),
            h(QTable, {
              dark: true,
              flat: true,
              rows: this.games,
              columns: this.columns,
              rowKey: 'id',
              loading: this.loading,
              pagination: this.pagination,
              'onUpdate:pagination': value => {
                this.pagination = value
              },
              onRequest: this.fetchGames
            }, {
              'body-cell-players': props =>
                h(QTd, {props}, () => `${props.row.playersCount} / 2`),
              'body-cell-status': props =>
                h(QTd, {props}, () =>
                  h(QBadge, {
                    color: props.row.status === 'completed' ? 'positive' : props.row.status === 'active' ? 'primary' : 'grey'
                  }, () => this.statusLabel(props.row))
                ),
              'body-cell-winner': props =>
                h(QTd, {props}, () => props.row.winnerLnAddress || ''),
              'body-cell-actions': props =>
                h(QTd, {props, class: 'text-right'}, () => [
                  h(QBtn, {
                    dense: true,
                    round: true,
                    flat: true,
                    icon: 'content_copy',
                    onClick: () => this.copyGame(props.row)
                  }, () => h(QTooltip, () => 'Copy public link')),
                  props.row.status === 'completed' && props.row.payoutPending
                    ? h(QBtn, {
                        dense: true,
                        round: true,
                        flat: true,
                        color: 'primary',
                        icon: 'payments',
                        onClick: () => this.settleGame(props.row)
                      }, () => h(QTooltip, () => 'Pay winner'))
                    : null,
                  h(QBtn, {
                    dense: true,
                    round: true,
                    flat: true,
                    icon: 'open_in_new',
                    href: this.publicUrl(props.row),
                    target: '_blank'
                  }, () => h(QTooltip, () => 'Open public game'))
                ])
            })
          ])
        ])
      ])
    ])
  }
})

app.use(Quasar)
app.mount('#chess-admin-app')

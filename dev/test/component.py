"""Guest contract tests. Run with the same Python/Wasmtime environment as LNbits."""

import json
import unittest
from pathlib import Path

from wasmtime import Config, Engine, Store, WasiConfig
from wasmtime.component import Component, Linker, Record

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "config.json").read_text())
PUBLIC_FIELDS = next(
    p["public_fields"]
    for perm in MANIFEST["permissions"]
    if perm["id"] == "ext.storage.read_public"
    for p in perm["policies"]
    if p["table_name"] == "chess_games"
)


def record(**fields):
    result = Record()
    for name, value in fields.items():
        setattr(result, name.replace("_", "-"), value)
    return result


class Host:
    def __init__(self):
        self.rows = {}
        self.calls = []
        self.events = []
        self.invoices = []
        self.payouts = []
        self.fail_game_write = False

    def invoke(self, name, request):
        self.calls.append(name)
        if name == "now":
            return record(timestamp=1_700_000_000)
        if name == "log":
            return record(ok=True)
        if name == "random-id":
            return record(id="id-" + request["prefix"])
        if name == "list-user-wallets":
            return record(wallets=[record(id="w1", name="Wallet", currency="sat")])
        if name in ("storage-get", "storage-get-public"):
            row = self.rows.get((request["table"], request["id"]))
            if row is not None and name == "storage-get-public":
                row = {k: v for k, v in row.items() if k in PUBLIC_FIELDS}
            return record(data_json=json.dumps(row) if row is not None else None)
        if name == "storage-set":
            if self.fail_game_write and request["table"] == "chess_games":
                self.fail_game_write = False
                return record(ok=False)
            row = json.loads(request["data-json"])
            self.rows[request["table"], row["id"]] = row
            return record(ok=True)
        if name == "storage-get-paginated":
            filters = json.loads(request["filters-json"])
            rows = [
                row
                for (table, _), row in self.rows.items()
                if table == request["table"]
                and all(row.get(k) == v for k, v in filters.items())
            ]
            start = request["offset"]
            return record(
                rows_json=json.dumps(rows[start : start + request["limit"]]),
                total=len(rows),
            )
        if name == "storage-delete":
            self.rows.pop((request["table"], request["id"]), None)
            return record(ok=True)
        if name == "create-invoice-public":
            self.invoices.append(request)
            return record(
                payment_hash="join-hash", payment_request="invoice", checking_id="join"
            )
        if name == "pay-lnurl":
            self.payouts.append(request)
            return record(
                ok=True,
                error=None,
                checking_id="pay-1",
                payment_hash="outgoing",
                status="success",
                amount_msat=-request["max-sat"] * 1000,
                fee_msat=0,
                pending=False,
                success=True,
            )
        if name == "websocket-publish":
            self.events.append(json.loads(request["data-json"]))
            return record(sent=False)
        raise AssertionError(f"Unexpected host call {name}")

    def callback(self, name):
        def invoke(_store, request=None):
            return self.invoke(name, vars(request) if request is not None else {})

        return invoke


class ComponentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config = Config()
        config.consume_fuel = True
        cls.engine = Engine(config)
        cls.component = Component.from_file(
            cls.engine, ROOT / MANIFEST["wasm"]["module"]
        )

    def setUp(self):
        self.host = Host()
        self.linker = Linker(self.engine)
        self.linker.add_wasip2()
        imports = self.component.type.imports(self.engine)
        with self.linker.root() as root:
            with root.add_instance("lnbits:extension/host") as host:
                for name in imports["lnbits:extension/host"].exports(self.engine):
                    host.add_func(name, self.host.callback(name))

    def call(self, export, /, *, error=None, **request):
        # LNbits uses a fresh instance per invocation.
        store = Store(self.engine)
        store.set_fuel(100_000_000)
        store.set_wasi(WasiConfig())
        instance = self.linker.instantiate(store, self.component)
        func = instance.get_func(store, export)
        result = json.loads(func(store, json.dumps(request)))
        func.post_return(store)
        if error is not None:
            self.assertFalse(result["ok"])
            self.assertIn(error, result["error"])
            return
        self.assertTrue(result["ok"], result)
        return result["data"]

    def create(self):
        self.call("save-chess-settings", enabled=True, walletId="w1", haircut=15)
        self.call("create-chess-game", id="game", joinAmount=101)

    def pay_join(self, color, msat=101000):
        return self.call(
            "record-chess-payment",
            payment_hash=color + "-hash",
            amount=msat,
            extra={
                "extra_chesswasm": {
                    "game_id": "game",
                    "ln_address": f"{color}@example.com",
                }
            },
        )

    def start(self):
        self.create()
        self.pay_join("white")
        self.pay_join("black")

    def test_settings_and_join_amounts(self):
        self.assertFalse(self.call("get-chess-settings")["settings"]["enabled"])
        self.assertEqual(self.call("list-chess-wallets")["wallets"][0]["id"], "w1")
        self.create()
        settings = self.call("get-chess-settings")["settings"]
        saved = self.call(
            "save-chess-settings", enabled=True, wallet_id="w2", haircut=15
        )["settings"]
        self.assertEqual(saved["id"], settings["id"])
        self.assertEqual(saved["walletId"], "w2")
        self.call("create-chess-game", joinAmount=19, error="at least 20")
        for amount in (20, 100_000_001):
            game = self.call("create-chess-game", joinAmount=amount)["game"]
            self.assertEqual(game["joinAmount"], amount)
            row = self.host.rows["chess_games", game["id"]]
            self.assertEqual(
                (row["join_amount"], row["wallet_id"], row["haircut"]),
                (amount, "w2", 15),
            )

    def test_join_refund_resign_settle_delete(self):
        self.create()
        g = {"gameId": "game"}
        self.assertTrue(self.call("get-public-chess-game", **g)["canJoin"])
        invoice = self.call("join-chess-game", **g, lnAddress="WHITE@example.com")
        self.assertEqual(invoice["paymentRequest"], "invoice")
        request = self.host.invoices[0]
        self.assertEqual(
            (request["source-id"], request["amount"], request["currency"]),
            ("game", 101, "sat"),
        )
        self.assertEqual(dict(request["extra"])["ln_address"], "white@example.com")
        self.assertEqual(self.pay_join("wrong", 20000)["status"], "refunded")
        self.assertEqual(self.pay_join("white")["player"]["color"], "white")
        self.assertEqual(self.pay_join("black")["game"]["status"], "active")
        self.assertEqual(self.pay_join("black")["game"]["playersCount"], 2)
        self.assertEqual(self.pay_join("extra")["status"], "refunded")
        self.assertEqual([p["max-sat"] for p in self.host.payouts], [20, 101])
        spectator = self.call("get-public-chess-game", **g)
        self.assertIsNone(spectator["player"])
        self.assertNotIn("white-hash", json.dumps(spectator))
        self.assertEqual(
            self.call("get-public-chess-game", **g, playerToken="white-hash")["player"][
                "color"
            ],
            "white",
        )
        self.call("resign-chess-game", **g, playerToken="black-hash")
        self.call("delete-chess-game", **g, error="pending payout")
        self.call(
            "settle-player-chess-payout",
            **g,
            playerToken="visitor",
            error="paid player token",
        )
        self.assertTrue(self.call("settle-chess-game", **g)["payout"]["ok"])
        payout = self.host.payouts[-1]
        self.assertEqual(
            (payout["wallet-id"], payout["lnurl"], payout["max-sat"]),
            ("w1", "white@example.com", 171),
        )
        self.assertTrue(
            self.call("settle-player-chess-payout", **g, playerToken="white-hash")[
                "payout"
            ]["alreadySettled"]
        )
        self.assertEqual(len(self.host.payouts), 3)
        self.assertTrue(self.call("delete-chess-game", **g)["deleted"])
        self.assertEqual(self.call("list-chess-games")["total"], 0)

    def test_retry_after_interrupted_write(self):
        self.start()
        request = {
            "gameId": "game",
            "playerToken": "white-hash",
            "actionId": "move-1",
            "expectedStateVersion": 2,
            "from": "e2",
            "to": "e4",
        }
        self.host.fail_game_write = True
        self.call("make-chess-move", **request, error="save chess state")
        self.assertEqual(self.host.rows["chess_games", "game"]["state_version"], 2)
        self.assertEqual(self.host.rows["chess_moves", "game-1"]["action_id"], "move-1")
        for _ in range(2):
            result = self.call("make-chess-move", **request)
            self.assertTrue(result["idempotent"])
            self.assertEqual(
                (result["game"]["turn"], result["game"]["stateVersion"]), ("black", 3)
            )
        self.call("make-chess-move", **{**request, "to": "e3"}, error="different move")
        self.call(
            "make-chess-move",
            **{**request, "actionId": "stale"},
            error="changed before this move",
        )
        self.assertEqual(
            self.call("get-public-chess-game", gameId="game")["moves"][0]["san"], "e2e4"
        )

    def test_legacy_game_checkmate_defers_payment(self):
        self.start()
        row = self.host.rows["chess_games", "game"]
        row.update(
            fen="5bn1/2Q2Q2/k1N4r/1p6/pnB3pp/4R3/PPP3PP/RNBK4 w - - 1 30",
            join_amount=20,
            haircut=10,
            move_count=58,
        )
        del row["state_version"], row["last_action_id"]
        result = self.call(
            "make-chess-move",
            **{"gameId": "game", "playerToken": "white-hash", "from": "c7", "to": "a7"},
        )
        self.assertTrue(result["game"]["checkmate"])
        self.assertTrue(result["payout"]["pending"])
        self.assertEqual(self.host.payouts, [])
        settled = self.call(
            "settle-player-chess-payout", gameId="game", playerToken="white-hash"
        )
        self.assertEqual(settled["game"]["payoutStatus"], "paid")
        self.assertEqual([p["amount"] for p in self.host.payouts], [36])

    def test_public_poll_reads_only_the_game(self):
        self.create()
        self.host.rows["chess_games", "game"].update(
            status="active",
            turn="black",
            move_count=21,
            fen="rnbq1bnr/4p1kp/1p1p4/p2B2N1/2p4P/8/PPPPPP2/RNBQK2R b - h3 0 11",
            pgn="1. g2g4 f7f5 2. g4f5 g7g5 3. f5f6 g5g4 4. f6f7+ e8f7 5. g1f3 b7b6 "
            "6. f3g5+ f7g7 7. f1h3 c7c5 8. h3g4 a7a5 9. g4e6 c5c4 10. e6d5 d7d6 11. h2h4",
        )
        self.host.calls.clear()
        result = self.call("get-public-chess-game", gameId="game")
        self.assertEqual(self.host.calls, ["storage-get-public"])
        self.assertFalse(result["game"]["inCheck"])
        self.assertEqual([m["moveNumber"] for m in result["moves"]], list(range(2, 22)))


if __name__ == "__main__":
    unittest.main()

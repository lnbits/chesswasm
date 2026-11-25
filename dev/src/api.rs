use crate::game::{Game, Move, MoveRequest};
use crate::lnbits::extension::host;
use crate::notation::clean;
use crate::records::public_settings;
use crate::storage::{self, GAMES, MOVES, PLAYERS, SETTINGS};
use crate::Reply;
use serde_json::{json, Value};

pub use crate::wallet::{
    join_chess_game, record_chess_payment, settle_chess_game, settle_player_chess_payout,
};

pub fn get_chess_settings(_: &Value) -> Reply {
    Ok(json!({"settings": public_settings(&storage::settings()?)}))
}

pub fn save_chess_settings(req: &Value) -> Reply {
    let mut row = storage::settings()?;
    let wallet_id = clean(string(alias(req, "walletId", "wallet_id")), 128);
    let wallet_name = clean(string(alias(req, "walletName", "wallet_name")), 120);
    let enabled = req["enabled"] == true;
    if enabled && wallet_id.is_empty() {
        return Err("walletId is required when chess games are enabled.".into());
    }
    let haircut = number(&req["haircut"], 0.0);
    if !haircut.is_finite() {
        return Err("haircut must be a number.".into());
    }
    if !(0.0..=100.0).contains(&haircut) {
        return Err("haircut must be between 0 and 100.".into());
    }
    if string(&row["id"]).is_empty() {
        row["id"] = new_id("chess-settings")?.into();
    }
    row["wallet_name"] = if wallet_name.is_empty() {
        wallet_id.clone()
    } else {
        wallet_name
    }
    .into();
    row["wallet_id"] = wallet_id.into();
    row["enabled"] = enabled.into();
    row["haircut"] = haircut.into();
    let now = host::now().timestamp;
    if row["created_at"].as_u64().unwrap_or(0) == 0 {
        row["created_at"] = now.into();
    }
    row["updated_at"] = now.into();
    if row["join_amount"].as_u64().unwrap_or(0) == 0 {
        row["join_amount"] = 100.into();
    }
    if row["max_bet"].as_u64().unwrap_or(0) == 0 {
        row["max_bet"] = 100_000_000.into();
    }
    storage::set(SETTINGS, &row)?;
    storage::log("info", "chesswasm: saved settings".into());
    Ok(json!({"settings": public_settings(&row)}))
}

pub fn list_chess_wallets(_: &Value) -> Reply {
    let wallets: Vec<_> = host::list_user_wallets()
        .wallets
        .into_iter()
        .map(|w| {
            let mut row = json!({"id": w.id, "name": w.name});
            if let Some(currency) = w.currency {
                row["currency"] = currency.into();
            }
            row
        })
        .collect();
    Ok(json!({"wallets": wallets}))
}

pub fn create_chess_game(req: &Value) -> Reply {
    let settings = storage::settings()?;
    if settings["enabled"] != true {
        return Err("Chess games are disabled.".into());
    }
    let wallet = string(&settings["wallet_id"]);
    if wallet.is_empty() {
        return Err("Chess wallet is not configured.".into());
    }
    let amount = number(alias(req, "joinAmount", "join_amount"), 100.0);
    if !amount.is_finite() || amount.fract() != 0.0 {
        return Err("value must be an integer.".into());
    }
    if amount < 20.0 {
        return Err("value must be at least 20.".into());
    }
    if amount > 9_007_199_254_740_991.0 {
        return Err("value must be at most 9007199254740991.".into());
    }
    let mut id: String = string(&req["id"])
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
        .take(64)
        .collect();
    if id.is_empty() {
        id = new_id("chess")?;
    }
    let name = clean(string(&req["name"]), 80);
    let game = Game::waiting(
        id,
        if name.is_empty() {
            "Paid chess game".into()
        } else {
            name
        },
        string(&settings["id"]).into(),
        wallet.into(),
        amount as u64,
        number(&settings["haircut"], 0.0),
        host::now().timestamp,
    );
    storage::set(GAMES, &game.row())?;
    storage::log("info", format!("chesswasm: created game {}", game.id));
    Ok(json!({"game": game.public(), "publicUrl": format!("/chesswasm/games/{}", game.id)}))
}

pub fn list_chess_games(req: &Value) -> Reply {
    let size = page_number(&req["rowsPerPage"], 10).min(100);
    let page = page_number(&req["page"], 1);
    let sort = match string(&req["sortBy"]) {
        "name" => "name",
        "joinAmount" => "join_amount",
        "playersCount" => "players_count",
        "status" => "status",
        _ => "created_at",
    };
    let mut query = storage::query(GAMES, json!({}), sort, size);
    query.search = clean(string(&req["search"]), 256);
    query.search_fields = ["name", "winner_ln_address", "status"]
        .map(String::from)
        .into();
    query.descending = req["descending"] == true || req["descending"] == "true";
    query.offset = (page - 1).saturating_mul(size);
    let (rows, total) = storage::page(&query)?;
    let games = rows
        .into_iter()
        .map(|row| Game::from_row(row).map(|g| g.public()))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({"games": games, "total": total}))
}

pub fn delete_chess_game(req: &Value) -> Reply {
    let game = load_game(req, false)?;
    if game.status == "completed" && game.payout_pending {
        return Err("Settle the pending payout before deleting this chess game.".into());
    }
    for number in 1..=game.move_count {
        storage::delete(MOVES, &format!("{}-{number}", game.id))?;
    }
    for hash in [&game.white_payment_hash, &game.black_payment_hash] {
        if !hash.is_empty() {
            storage::delete(PLAYERS, hash)?;
        }
    }
    storage::delete(GAMES, &game.id)?;
    storage::log("info", format!("chesswasm: deleted game {}", game.id));
    Ok(json!({"deleted": true, "gameId": game.id}))
}

pub fn get_public_chess_game(req: &Value) -> Reply {
    let game = load_game(req, true)?;
    let token = player_token(req);
    let player = game
        .player_color(&token)
        .ok()
        .map(|color| game.seated_player(color, &token));
    let players: Vec<_> = ["white", "black"]
        .into_iter()
        .filter(|c| !game.address(c).is_empty())
        .map(|c| game.seated_player(c, ""))
        .collect();
    Ok(json!({
        "game": game.public(),
        "players": players,
        "moves": game.recent_moves(),
        "player": player,
        "canJoin": game.status == "waiting" && game.players_count < 2,
    }))
}

pub fn make_chess_move(req: &Value) -> Reply {
    let mut game = load_game(req, false)?;
    let token = require_token(req)?;
    let color = game.player_color(&token)?;
    let mut request = MoveRequest::new(
        string(&req["from"]),
        string(&req["to"]),
        string(&req["promotion"]),
        string(alias(req, "actionId", "action_id")),
    )?;
    request.fill_legacy_id(color, game.state_version);
    let query = storage::query(
        MOVES,
        json!({"game_id": game.id, "action_id": request.action_id}),
        "move_number",
        1,
    );
    let (rows, _) = storage::page(&query)?;
    let prior = rows.into_iter().next();
    let replay = prior.is_some();
    let record = if let Some(row) = prior {
        let record = Move::from_row(row)?;
        if !request.matches_record(&record, color) {
            return Err("That move action ID was already used for a different move.".into());
        }
        record
    } else {
        let raw = alias(req, "expectedStateVersion", "expected_state_version");
        let version = if raw.is_null() || raw == "" {
            None
        } else {
            let n = number(raw, 0.0);
            if !n.is_finite() || n < 0.0 || n.fract() != 0.0 {
                return Err("expectedStateVersion must be a non-negative integer.".into());
            }
            Some(n as u64)
        };
        let record = game.next_move(color, &request, version, host::now().timestamp)?;
        storage::set(MOVES, &record.row())?;
        record
    };
    if !replay || record.action_id != game.last_action_id {
        game.apply_record(&record)?;
        storage::set(GAMES, &game.row())?;
        let action = if replay { "recovered" } else { "committed" };
        storage::log(
            if replay { "warning" } else { "info" },
            format!(
                "chesswasm: {action} move {} {} version {}",
                game.id, record.action_id, game.state_version
            ),
        );
        publish(&game, "move");
    }
    let mut response = json!({
        "game": game.public(),
        "move": record.public(),
        "player": game.seated_player(color, &token),
        "payout": {"ok": true, "pending": game.payout_pending},
    });
    if replay {
        response["idempotent"] = true.into();
    }
    Ok(response)
}

pub fn resign_chess_game(req: &Value) -> Reply {
    let mut game = load_game(req, false)?;
    let token = require_token(req)?;
    let color = game.player_color(&token)?;
    game.resign(color, host::now().timestamp)?;
    storage::set(GAMES, &game.row())?;
    publish(&game, "resigned");
    Ok(json!({
        "game": game.public(),
        "player": game.seated_player(color, &token),
        "payout": {"ok": true, "pending": true},
    }))
}

pub(crate) fn load_game(req: &Value, public: bool) -> Result<Game, String> {
    let id = clean(string(&req["gameId"]), 128);
    if id.is_empty() {
        return Err("gameId is required.".into());
    }
    game_by_id(&id, public)
}

pub(crate) fn game_by_id(id: &str, public: bool) -> Result<Game, String> {
    Game::from_row(storage::get(GAMES, id, public)?.ok_or("Chess game not found.")?)
}

pub(crate) fn publish(game: &Game, event: &str) {
    let sent = host::websocket_publish(&host::WebsocketPublishRequest {
        item_id: format!("game:{}", game.id),
        data_json: json!({"type": "server", "event": event, "game": game.public()}).to_string(),
    })
    .sent;
    if !sent {
        storage::log("warning", "chesswasm websocket publish failed".into());
    }
}

pub(crate) fn alias<'a>(req: &'a Value, camel: &str, snake: &str) -> &'a Value {
    if req[camel].is_null() {
        &req[snake]
    } else {
        &req[camel]
    }
}

pub(crate) fn string(value: &Value) -> &str {
    value.as_str().unwrap_or_default()
}

pub(crate) fn number(value: &Value, default: f64) -> f64 {
    match value {
        Value::Null => default,
        Value::String(s) if s.trim().is_empty() => 0.0,
        Value::String(s) => s.trim().parse().unwrap_or(f64::NAN),
        Value::Bool(b) => f64::from(u8::from(*b)),
        _ => value.as_f64().unwrap_or(f64::NAN),
    }
}

pub(crate) fn require_token(req: &Value) -> Result<String, String> {
    let token = player_token(req);
    if token.is_empty() {
        Err("playerToken is required.".into())
    } else {
        Ok(token)
    }
}

fn player_token(req: &Value) -> String {
    clean(string(alias(req, "playerToken", "player_token")), 128)
}

fn page_number(value: &Value, default: u32) -> u32 {
    let n = number(value, default.into());
    if n.is_finite() && n >= 1.0 && n.fract() == 0.0 {
        n as u32
    } else {
        default
    }
}

fn new_id(prefix: &str) -> Result<String, String> {
    let id = host::random_id(&host::RandomIdRequest {
        prefix: prefix.into(),
    })
    .id;
    if id.is_empty() {
        Err(format!("Could not generate a {prefix} ID."))
    } else {
        Ok(id)
    }
}

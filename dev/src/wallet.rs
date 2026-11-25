use crate::api::{alias, game_by_id, load_game, number, publish, require_token, string};
use crate::lnbits::extension::host;
use crate::notation::{clean, valid_address};
use crate::payments::{Payment, Settlement};
use crate::records::paid_player;
use crate::storage::{self, GAMES, PLAYERS, SETTINGS};
use crate::Reply;
use serde_json::{json, Value};

pub fn join_chess_game(req: &Value) -> Reply {
    let address = lightning_address(string(alias(req, "lnAddress", "ln_address")))?;
    let game = load_game(req, false)?;
    if game.status != "waiting" {
        return Err("This chess game has already started.".into());
    }
    if game.players_count >= 2 {
        return Err("This chess game is already full.".into());
    }
    let invoice = host::create_invoice_public(&host::InvoicePublicRequest {
        source_id: game.id.clone(),
        amount: game.join_amount as f64,
        currency: "sat".into(),
        memo: format!("Chess {} for {address}", game.name),
        extra: vec![("game_id".into(), game.id), ("ln_address".into(), address)],
    });
    Ok(json!({
        "paymentHash": invoice.payment_hash,
        "paymentRequest": invoice.payment_request,
        "checkingId": invoice.checking_id,
    }))
}

pub fn record_chess_payment(event: &Value) -> Reply {
    let payment = &event["payment"];
    let extra = &event["extra"];
    let payment_extra = &payment["extra"];
    let nested = if extra["extra_chesswasm"].is_object() {
        &extra["extra_chesswasm"]
    } else {
        &payment_extra["extra_chesswasm"]
    };
    let field = |name: &str| {
        [&nested[name], &extra[name], &payment_extra[name]]
            .into_iter()
            .map(string)
            .find(|v| !v.is_empty())
            .unwrap_or("")
    };
    let hash = [
        &event["paymentHash"],
        &event["payment_hash"],
        &extra["paymentHash"],
        &payment["payment_hash"],
        &payment["paymentHash"],
    ]
    .into_iter()
    .map(|v| clean(string(v), 128))
    .find(|v| !v.is_empty())
    .ok_or("paymentHash is required.")?;
    let game_id = clean(field("game_id"), 128);
    if game_id.is_empty() {
        return Err("game_id is required.".into());
    }
    let address = lightning_address(field("ln_address"))?;
    let mut game = game_by_id(&game_id, false)?;
    if let Some(player) = storage::get(PLAYERS, &hash, false)? {
        return Ok(json!({
            "game": game.public(),
            "player": paid_player(&player),
            "status": player["status"],
        }));
    }
    let amount = number(&event["amount"], 0.0);
    let msat = if amount == 0.0 {
        number(&payment["amount"], 0.0)
    } else {
        amount
    };
    if !msat.is_finite() {
        return Err("Invalid payment amount.".into());
    }
    let sats = msat.abs() / 1000.0;
    let now = host::now().timestamp;
    let mut player = json!({
        "id": hash,
        "game_id": game_id,
        "ln_address": address,
        "payment_hash": hash,
        "color": "",
        "status": "paid",
        "created_at": now,
        "paid_at": now,
    });

    let reason = if sats != 0.0 && sats as u64 != game.join_amount {
        Some("amount-mismatch")
    } else if game.status != "waiting" || game.players_count >= 2 {
        Some("full")
    } else {
        None
    };
    if let Some(reason) = reason {
        if reason == "amount-mismatch" {
            player["status"] = "amount-mismatch".into();
            player["paid_at"] = Value::Null;
        } else {
            player["status"] = "refund-pending".into();
        }
        storage::set(PLAYERS, &player)?;
        let refund = send_payment(game.refund(&address, sats as u64, reason), false);
        if refund["ok"] == true {
            player["status"] = "refunded".into();
            storage::set(PLAYERS, &player)?;
        }
        return Ok(json!({
            "game": game.public(),
            "player": paid_player(&player),
            "status": player["status"],
            "refund": refund,
        }));
    }

    let query = storage::query(
        PLAYERS,
        json!({"game_id": game_id, "status": "paid"}),
        "paid_at",
        10,
    );
    let (assigned, _) = storage::page(&query)?;
    player["color"] = if assigned.is_empty() {
        "white"
    } else {
        "black"
    }
    .into();
    storage::set(PLAYERS, &player)?;
    game.seat_player(assigned.len(), &address, &hash, host::now().timestamp);
    storage::set(GAMES, &game.row())?;
    publish(&game, "player-paid");
    Ok(json!({
        "game": game.public(),
        "player": paid_player(&player),
        "status": "paid",
    }))
}

pub fn settle_player_chess_payout(req: &Value) -> Reply {
    settle(req, true)
}

pub fn settle_chess_game(req: &Value) -> Reply {
    settle(req, false)
}

fn settle(req: &Value, player_request: bool) -> Reply {
    let mut game = load_game(req, false)?;
    if player_request {
        game.player_color(&require_token(req)?)?;
    }
    let payout = match game.settlement(player_request)? {
        Settlement::AlreadySettled { paid } => {
            json!({"ok": paid, "pending": false, "alreadySettled": true})
        }
        Settlement::Processing => json!({"ok": true, "pending": true, "processing": true}),
        Settlement::Pay => {
            let settings = if game.settings_id.is_empty() {
                storage::settings()?
            } else {
                storage::get(SETTINGS, &game.settings_id, false)?
                    .ok_or("Chess settings not found.")?
            };
            game.start_payout(host::now().timestamp);
            storage::set(GAMES, &game.row())?;
            let payout = send_payment(game.winnings(string(&settings["wallet_id"])), true);
            game.finish_payout(payout["ok"] == true, host::now().timestamp);
            storage::set(GAMES, &game.row())?;
            publish(&game, "settled");
            payout
        }
    };
    Ok(json!({"game": game.public(), "payout": payout}))
}

fn send_payment(payment: Result<Payment, &str>, include_amounts: bool) -> Value {
    let payment = match payment {
        Ok(p) => p,
        Err(message) => return json!({"ok": false, "error": message}),
    };
    let result = host::pay_lnurl(&host::PayLnurlRequest {
        wallet_id: payment.wallet_id,
        lnurl: payment.lnurl,
        amount: payment.amount as f64,
        currency: "sat".into(),
        comment: Some(payment.comment.into()),
        description: payment.description,
        max_sat: Some(payment.amount),
        extra: payment.extra.into(),
    });
    let mut response = json!({
        "ok": result.ok,
        "error": result.error.unwrap_or_default(),
        "checkingId": result.checking_id.unwrap_or_default(),
        "paymentHash": result.payment_hash.unwrap_or_default(),
        "status": result.status.unwrap_or_default(),
    });
    if include_amounts {
        response["amountMsat"] = result.amount_msat.into();
        response["feeMsat"] = result.fee_msat.into();
    }
    response
}

fn lightning_address(raw: &str) -> Result<String, String> {
    let address = clean(raw, 180).to_lowercase();
    if valid_address(&address) {
        Ok(address)
    } else {
        Err("A valid Lightning address is required.".into())
    }
}

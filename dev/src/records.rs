use crate::{
    board::{Board, START_FEN},
    game::{Game, Move},
    notation::{clean, mask},
};
use serde_json::{json, Value};

impl Game {
    pub fn public(&self) -> Value {
        let fen = if self.fen.is_empty() {
            START_FEN
        } else {
            &self.fen
        };
        let board = Board::from_fen(fen).ok();
        let checked_color = board
            .as_ref()
            .filter(|b| b.in_check())
            .map(Board::turn)
            .unwrap_or("");
        let checkmate = board.is_some()
            && self.status == "completed"
            && clean(&self.pgn, 4000).trim_end().ends_with('#');
        json!({
            "id": self.id,
            "settingsId": self.settings_id,
            "name": self.name,
            "joinAmount": self.join_amount,
            "haircut": self.haircut,
            "playersCount": self.players_count,
            "status": if self.status.is_empty() { "waiting" } else { &self.status },
            "winnerColor": self.winner_color,
            "winnerLnAddress": mask(&self.winner_ln_address),
            "payoutPending": self.payout_pending,
            "payoutStatus": self.payout_status,
            "inCheck": !checked_color.is_empty(),
            "checkmate": checkmate,
            "checkedColor": checked_color,
            "fen": fen,
            "pgn": self.pgn,
            "turn": if self.turn.is_empty() { "white" } else { &self.turn },
            "moveCount": self.move_count,
            "stateVersion": self.state_version,
            "lastActionId": self.last_action_id,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "startedAt": self.started_at.unwrap_or(0),
            "completedAt": self.completed_at.unwrap_or(0),
        })
    }

    pub fn seated_player(&self, color: &str, token: &str) -> Value {
        json!({
            "id": token,
            "gameId": self.id,
            "lnAddress": mask(self.address(color)),
            "color": color,
            "status": "paid",
            "paidAt": 0,
        })
    }

    pub fn recent_moves(&self) -> Vec<Value> {
        // Public polling uses only the game projection, including its coordinate PGN.
        let pgn = clean(&self.pgn, 4000);
        let tokens: Vec<_> = pgn
            .split_whitespace()
            .filter(|t| {
                !t.strip_suffix('.')
                    .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
            })
            .collect();
        let start = tokens.len().saturating_sub(20);
        tokens
            .into_iter()
            .enumerate()
            .skip(start)
            .map(|(i, token)| {
                let number = i + 1;
                json!({
                    "id": format!("{}-{number}", self.id),
                    "gameId": self.id,
                    "moveNumber": number,
                    "color": if i % 2 == 0 { "white" } else { "black" },
                    "from": token.chars().take(2).collect::<String>(),
                    "to": token.chars().skip(2).take(2).collect::<String>(),
                    "promotion": token.chars().skip(4).take(1).collect::<String>(),
                    "san": token,
                    "fen": "",
                    "createdAt": 0,
                })
            })
            .collect()
    }
}

impl Move {
    pub fn public(&self) -> Value {
        json!({
            "id": self.id,
            "gameId": self.game_id,
            "moveNumber": self.move_number,
            "actionId": self.action_id,
            "color": self.color,
            "from": self.from_square,
            "to": self.to_square,
            "promotion": self.promotion,
            "san": self.san,
            "fen": self.fen,
            "createdAt": self.created_at,
        })
    }
}

pub fn public_settings(row: &Value) -> Value {
    json!({
        "id": row["id"],
        "enabled": row["enabled"] == true,
        "haircut": row["haircut"].as_f64().unwrap_or_default(),
        "walletId": row["wallet_id"].as_str().unwrap_or_default(),
        "walletName": row["wallet_name"].as_str().unwrap_or_default(),
        "createdAt": row["created_at"].as_u64().unwrap_or_default(),
        "updatedAt": row["updated_at"].as_u64().unwrap_or_default(),
    })
}

pub fn paid_player(row: &Value) -> Value {
    json!({
        "id": row["id"],
        "gameId": row["game_id"],
        "lnAddress": mask(row["ln_address"].as_str().unwrap_or_default()),
        "color": row["color"].as_str().unwrap_or_default(),
        "status": row["status"].as_str().unwrap_or("pending"),
        "paidAt": row["paid_at"].as_u64().unwrap_or_default(),
    })
}

use crate::board::{Board, Square, START_FEN};
use crate::notation::{append_pgn, clean};

#[derive(Default)]
pub struct Game {
    pub id: String,
    pub settings_id: String,
    pub wallet_id: String,
    pub name: String,
    pub join_amount: u64,
    pub haircut: f64,
    pub players_count: u32,
    pub status: String,
    pub white_ln_address: String,
    pub black_ln_address: String,
    pub white_payment_hash: String,
    pub black_payment_hash: String,
    pub winner_color: String,
    pub winner_ln_address: String,
    pub payout_pending: bool,
    pub payout_status: String,
    pub fen: String,
    pub pgn: String,
    pub turn: String,
    pub move_count: u64,
    pub state_version: u64,
    pub last_action_id: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
}

pub struct Move {
    pub id: String,
    pub game_id: String,
    pub move_number: u64,
    pub action_id: String,
    pub state_version: u64,
    pub game_status: String,
    pub next_turn: String,
    pub winner_color: String,
    pub color: String,
    pub from_square: String,
    pub to_square: String,
    pub promotion: String,
    pub san: String,
    pub fen: String,
    pub created_at: u64,
}

pub struct MoveRequest {
    pub from: String,
    pub to: String,
    pub promotion: String,
    pub action_id: String,
}

impl Game {
    pub fn waiting(
        id: String,
        name: String,
        settings_id: String,
        wallet_id: String,
        join_amount: u64,
        haircut: f64,
        now: u64,
    ) -> Self {
        Self {
            id,
            name,
            settings_id,
            wallet_id,
            join_amount,
            haircut,
            status: "waiting".into(),
            fen: START_FEN.into(),
            turn: "white".into(),
            created_at: now,
            updated_at: now,
            ..Self::default()
        }
    }

    pub fn player_color(&self, token: &str) -> Result<&'static str, &'static str> {
        if !token.is_empty() {
            if token == self.white_payment_hash {
                return Ok("white");
            }
            if token == self.black_payment_hash {
                return Ok("black");
            }
        }
        Err("A paid player token is required.")
    }

    pub fn address(&self, color: &str) -> &str {
        if color == "white" {
            &self.white_ln_address
        } else {
            &self.black_ln_address
        }
    }

    pub fn seat_player(&mut self, assigned: usize, address: &str, hash: &str, now: u64) {
        if assigned == 0 {
            self.white_ln_address = address.into();
            self.white_payment_hash = hash.into();
        } else {
            self.black_ln_address = address.into();
            self.black_payment_hash = hash.into();
        }
        self.players_count = assigned as u32 + 1;
        if self.players_count == 2 {
            self.status = "active".into();
            self.started_at = Some(now);
        }
        self.touch(now);
    }

    pub fn next_move(
        &self,
        color: &str,
        request: &MoveRequest,
        expected_version: Option<u64>,
        now: u64,
    ) -> Result<Move, String> {
        if expected_version.is_some_and(|v| v != self.state_version) {
            return Err("The game changed before this move. Refresh and try again.".into());
        }
        if self.status != "active" {
            return Err("This chess game is not active.".into());
        }
        if self.turn != color {
            return Err(format!("It is {}'s turn.", self.turn));
        }
        let board = Board::from_fen(if self.fen.is_empty() {
            START_FEN
        } else {
            &self.fen
        })?;
        let played = board.play(
            Square::parse(&request.from)?,
            Square::parse(&request.to)?,
            &request.promotion,
        )?;
        let number = self.move_count + 1;
        Ok(Move {
            id: format!("{}-{number}", self.id),
            game_id: self.id.clone(),
            move_number: number,
            action_id: request.action_id.clone(),
            state_version: self.state_version + 1,
            game_status: if played.checkmate {
                "completed"
            } else if played.draw {
                "draw"
            } else {
                "active"
            }
            .into(),
            next_turn: played.turn.into(),
            winner_color: if played.checkmate { color } else { "" }.into(),
            color: color.into(),
            from_square: request.from.clone(),
            to_square: request.to.clone(),
            promotion: request.promotion.clone(),
            san: played.label,
            fen: played.fen,
            created_at: now,
        })
    }

    /// Reapply a durable move when its game-row update was interrupted.
    pub fn apply_record(&mut self, record: &Move) -> Result<(), &'static str> {
        if record.move_number != self.move_count + 1 {
            return Err("That move was superseded by newer game state. Refresh the game.");
        }
        self.status = if record.game_status.is_empty() {
            "active".into()
        } else {
            record.game_status.clone()
        };
        self.winner_color.clone_from(&record.winner_color);
        self.payout_pending = !self.winner_color.is_empty();
        self.winner_ln_address = if self.payout_pending {
            self.address(&self.winner_color).into()
        } else {
            String::new()
        };
        self.payout_status = if self.payout_pending { "pending" } else { "" }.into();
        self.fen.clone_from(&record.fen);
        self.pgn = append_pgn(&self.pgn, record.move_number, &record.color, &record.san);
        self.turn = if record.next_turn.is_empty() {
            opponent(&record.color).into()
        } else {
            record.next_turn.clone()
        };
        self.move_count = record.move_number;
        self.last_action_id.clone_from(&record.action_id);
        self.completed_at =
            matches!(self.status.as_str(), "completed" | "draw").then_some(record.created_at);
        self.touch(record.created_at);
        self.state_version = self.state_version.max(record.state_version);
        Ok(())
    }

    pub fn resign(&mut self, color: &str, now: u64) -> Result<(), &'static str> {
        if self.status != "active" {
            return Err("Only active chess games can be resigned.");
        }
        let winner = opponent(color);
        let hash = if winner == "white" {
            &self.white_payment_hash
        } else {
            &self.black_payment_hash
        };
        if hash.is_empty() {
            return Err("Opponent is missing.");
        }
        self.status = "completed".into();
        self.winner_color = winner.into();
        self.winner_ln_address = self.address(winner).into();
        self.payout_pending = true;
        self.payout_status = "pending".into();
        self.completed_at = Some(now);
        self.touch(now);
        Ok(())
    }

    pub fn touch(&mut self, now: u64) {
        self.updated_at = now;
        self.state_version += 1;
    }
}

impl MoveRequest {
    pub fn new(
        from: &str,
        to: &str,
        promotion: &str,
        action_id: &str,
    ) -> Result<Self, &'static str> {
        let from = clean(from, 2).to_ascii_lowercase();
        let to = clean(to, 2).to_ascii_lowercase();
        Square::parse(&from)?;
        Square::parse(&to)?;
        let promotion = clean(promotion, 1).to_ascii_lowercase();
        if !matches!(promotion.as_str(), "" | "q" | "r" | "b" | "n") {
            return Err("Invalid promotion piece.");
        }
        let action_id = action_id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '_' | '-'))
            .take(96)
            .collect();
        Ok(Self {
            from,
            to,
            promotion,
            action_id,
        })
    }

    pub fn fill_legacy_id(&mut self, color: &str, version: u64) {
        if self.action_id.is_empty() {
            self.action_id = format!(
                "legacy-{version}-{color}-{}-{}-{}",
                self.from, self.to, self.promotion
            );
        }
    }

    pub fn matches_record(&self, record: &Move, color: &str) -> bool {
        record.color == color
            && record.from_square == self.from
            && record.to_square == self.to
            && record.promotion == self.promotion
    }
}

fn opponent(color: &str) -> &'static str {
    if color == "white" {
        "black"
    } else {
        "white"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::payments::Settlement;

    fn started() -> Game {
        let mut game = Game::waiting(
            "game".into(),
            "Match".into(),
            "settings".into(),
            "wallet".into(),
            101,
            15.0,
            1,
        );
        game.seat_player(0, "white@example.com", "w-token", 2);
        game.seat_player(1, "black@example.com", "b-token", 3);
        game
    }

    #[test]
    fn retry_after_interrupted_game_write() {
        let mut game = started();
        let request = MoveRequest::new("e2", "e4", "", "move-1").unwrap();
        let record = game.next_move("white", &request, Some(2), 4).unwrap();
        assert!(request.matches_record(&record, "white"));
        assert!(!request.matches_record(&record, "black"));
        assert_eq!(game.state_version, 2);
        game.apply_record(&record).unwrap();
        assert_eq!(game.turn, "black");
        assert_eq!(game.pgn, "1. e2e4");
        assert_eq!(game.last_action_id, "move-1");
        assert_eq!(game.state_version, 3);
        assert!(game.apply_record(&record).is_err());
        assert!(game.next_move("black", &request, Some(2), 4).is_err());
    }

    #[test]
    fn resignation_and_settlement_retry() {
        let mut game = started();
        assert!(game.player_color("").is_err());
        assert!(game.player_color("visitor").is_err());
        game.resign(game.player_color("b-token").unwrap(), 4)
            .unwrap();
        assert_eq!(game.settlement(true).unwrap(), Settlement::Pay);
        let payment = game.winnings("other-wallet").unwrap();
        assert_eq!(payment.amount, 171);
        assert_eq!(payment.wallet_id, "wallet");
        assert_eq!(payment.lnurl, "white@example.com");
        game.start_payout(5);
        assert_eq!(game.settlement(true).unwrap(), Settlement::Processing);
        assert!(game.settlement(false).is_err());
        game.finish_payout(false, 6);
        assert_eq!(game.settlement(false).unwrap(), Settlement::Pay);
        game.start_payout(7);
        game.finish_payout(true, 8);
        assert_eq!(
            game.settlement(true).unwrap(),
            Settlement::AlreadySettled { paid: true }
        );
        assert!(game.settlement(false).is_err());
    }
}

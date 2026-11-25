use crate::game::Game;
use crate::notation::payout_amount;

pub struct Payment {
    pub wallet_id: String,
    pub lnurl: String,
    pub amount: u64,
    pub comment: &'static str,
    pub description: String,
    pub extra: [(String, String); 2],
}

#[derive(Debug, PartialEq)]
pub enum Settlement {
    Pay,
    Processing,
    AlreadySettled { paid: bool },
}

impl Game {
    pub fn settlement(&self, player_request: bool) -> Result<Settlement, &'static str> {
        if self.status != "completed" {
            return Err("Only completed chess games can be settled.");
        }
        if self.winner_ln_address.is_empty() || self.winner_color.is_empty() {
            return Err("Chess winner is missing.");
        }
        if !self.payout_pending {
            return if player_request {
                Ok(Settlement::AlreadySettled {
                    paid: self.payout_status == "paid",
                })
            } else {
                Err("This chess game is already settled.")
            };
        }
        if self.payout_status == "processing" {
            return if player_request {
                Ok(Settlement::Processing)
            } else {
                Err("Payout is already processing.")
            };
        }
        Ok(Settlement::Pay)
    }

    pub fn start_payout(&mut self, now: u64) {
        self.payout_status = "processing".into();
        self.completed_at.get_or_insert(now);
        self.touch(now);
    }

    pub fn finish_payout(&mut self, paid: bool, now: u64) {
        self.payout_pending = !paid;
        self.payout_status = if paid { "paid" } else { "failed" }.into();
        self.touch(now);
    }

    pub fn winnings(&self, settings_wallet: &str) -> Result<Payment, &'static str> {
        let wallet = if self.wallet_id.is_empty() {
            settings_wallet
        } else {
            &self.wallet_id
        };
        if wallet.is_empty() {
            return Err("Chess wallet is not configured.");
        }
        if self.winner_ln_address.is_empty() {
            return Err("Lightning address is missing.");
        }
        let amount = payout_amount(self.join_amount as f64, self.haircut);
        if amount == 0 {
            return Err("Payout amount must be greater than zero.");
        }
        Ok(Payment {
            wallet_id: wallet.into(),
            lnurl: self.winner_ln_address.clone(),
            amount,
            comment: "Chess winnings",
            description: format!("Chess winnings for {}", self.name),
            extra: [
                ("chess_game_id".into(), self.id.clone()),
                ("chess_winner_color".into(), self.winner_color.clone()),
            ],
        })
    }

    pub fn refund(&self, address: &str, sats: u64, reason: &str) -> Result<Payment, &'static str> {
        if sats == 0 {
            return Err("Refund amount must be greater than zero.");
        }
        if self.wallet_id.is_empty() {
            return Err("Chess wallet is not configured.");
        }
        if address.is_empty() {
            return Err("Lightning address is missing.");
        }
        Ok(Payment {
            wallet_id: self.wallet_id.clone(),
            lnurl: address.into(),
            amount: sats,
            comment: "Chess refund",
            description: format!("Chess refund for {}", self.name),
            extra: [
                ("chess_game_id".into(), self.id.clone()),
                ("chess_refund_reason".into(), reason.into()),
            ],
        })
    }
}

//! Chess rules used by the public board. Move notation is coordinate-based.
pub const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Square(usize);

impl Square {
    pub fn parse(name: &str) -> Result<Self, &'static str> {
        match name.as_bytes() {
            [file @ b'a'..=b'h', rank @ b'1'..=b'8'] => {
                Ok(Self(usize::from((rank - b'1') * 8 + file - b'a')))
            }
            _ => Err("A valid chess square is required."),
        }
    }

    fn name(self) -> String {
        format!("{}{}", char::from(b'a' + self.0 as u8 % 8), self.0 / 8 + 1)
    }

    fn file(self) -> i8 {
        (self.0 % 8) as i8
    }
    fn rank(self) -> i8 {
        (self.0 / 8) as i8
    }
}

#[derive(Clone)]
pub struct Board {
    pieces: [u8; 64],
    white: bool,
    ep: Option<Square>,
    halfmove: u64,
    fullmove: u64,
}

pub struct PlayedMove {
    pub fen: String,
    pub label: String,
    pub turn: &'static str,
    pub checkmate: bool,
    pub draw: bool,
}

impl Board {
    pub fn from_fen(fen: &str) -> Result<Self, &'static str> {
        let mut fields = fen.split_whitespace();
        let ranks = fields.next().ok_or("Invalid chess position.")?;
        let white = fields.next().ok_or("Invalid chess position.")? != "b";
        fields.next().ok_or("Invalid chess position.")?; // Castling is unsupported.
        let ep = fields.next().ok_or("Invalid chess position.")?;
        let mut pieces = [0; 64];
        let mut rows = ranks.split('/');
        for rank in (0..8).rev() {
            let mut file = 0;
            for c in rows.next().ok_or("Invalid chess board.")?.bytes() {
                match c {
                    b'1'..=b'8' => file += usize::from(c - b'0'),
                    _ if file < 8 && b"prnbqkPRNBQK".contains(&c) => {
                        pieces[rank * 8 + file] = c;
                        file += 1;
                    }
                    _ => return Err("Invalid chess board."),
                }
            }
            if file != 8 {
                return Err("Invalid chess board.");
            }
        }
        if rows.next().is_some() {
            return Err("Invalid chess board.");
        }
        Ok(Self {
            pieces,
            white,
            ep: Square::parse(ep).ok(),
            halfmove: fields
                .next()
                .unwrap_or("0")
                .parse()
                .map_err(|_| "Invalid chess position.")?,
            fullmove: fields
                .next()
                .unwrap_or("1")
                .parse()
                .map_err(|_| "Invalid chess position.")?,
        })
    }

    pub fn turn(&self) -> &'static str {
        if self.white {
            "white"
        } else {
            "black"
        }
    }
    pub fn in_check(&self) -> bool {
        self.king_attacked(self.white)
    }

    pub fn play(
        &self,
        from: Square,
        to: Square,
        promotion: &str,
    ) -> Result<PlayedMove, &'static str> {
        let promotes =
            self.pieces[from.0].eq_ignore_ascii_case(&b'p') && matches!(to.rank(), 0 | 7);
        if promotes == promotion.is_empty() {
            return Err("Illegal chess move.");
        }
        let next = self
            .legal_move(from, to, promotion.as_bytes().first().copied())
            .ok_or("Illegal chess move.")?;
        let check = next.in_check();
        let no_reply = !next.has_reply();
        let checkmate = check && no_reply;
        let suffix = if checkmate {
            "#"
        } else if check {
            "+"
        } else {
            ""
        };
        Ok(PlayedMove {
            fen: next.fen(),
            label: format!("{}{}{promotion}{suffix}", from.name(), to.name()),
            turn: next.turn(),
            checkmate,
            draw: !check && no_reply,
        })
    }

    fn has_reply(&self) -> bool {
        for (i, &piece) in self.pieces.iter().enumerate() {
            if piece == 0 || piece.is_ascii_uppercase() != self.white {
                continue;
            }
            // Any promotion occupies the same square for the moving king's safety.
            if (0..64).any(|j| self.legal_move(Square(i), Square(j), None).is_some()) {
                return true;
            }
        }
        false
    }

    fn legal_move(&self, from: Square, to: Square, promotion: Option<u8>) -> Option<Self> {
        let piece = self.pieces[from.0];
        let target = self.pieces[to.0];
        if piece == 0
            || piece.is_ascii_uppercase() != self.white
            || (target != 0 && target.is_ascii_uppercase() == self.white)
            || !self.reaches(from, to, false)
        {
            return None;
        }
        let pawn = piece.eq_ignore_ascii_case(&b'p');
        let mut next = self.clone();
        next.pieces[from.0] = 0;
        if pawn && Some(to) == self.ep && target == 0 {
            next.pieces[(from.rank() * 8 + to.file()) as usize] = 0;
        }
        next.pieces[to.0] = match promotion {
            Some(p) if self.white => p.to_ascii_uppercase(),
            Some(p) => p,
            None => piece,
        };
        if next.king_attacked(self.white) {
            return None;
        }
        next.ep = if pawn && (to.rank() - from.rank()).abs() == 2 {
            Some(Square((from.0 + to.0) / 2))
        } else {
            None
        };
        next.halfmove = if pawn || target != 0 {
            0
        } else {
            self.halfmove.saturating_add(1)
        };
        next.fullmove = self.fullmove.saturating_add(u64::from(!self.white));
        next.white = !self.white;
        Some(next)
    }

    fn king_attacked(&self, white: bool) -> bool {
        let king = if white { b'K' } else { b'k' };
        let Some(target) = self.pieces.iter().position(|p| *p == king) else {
            return true;
        };
        self.pieces.iter().enumerate().any(|(from, &p)| {
            p != 0
                && p.is_ascii_uppercase() != white
                && self.reaches(Square(from), Square(target), true)
        })
    }

    fn reaches(&self, from: Square, to: Square, attack: bool) -> bool {
        if from == to {
            return false;
        }
        let dx = to.file() - from.file();
        let dy = to.rank() - from.rank();
        let (x, y) = (dx.abs(), dy.abs());
        let piece = self.pieces[from.0];
        match piece.to_ascii_lowercase() {
            b'p' => {
                let dir = if piece.is_ascii_uppercase() { 1 } else { -1 };
                if x == 1 && dy == dir {
                    return attack || self.pieces[to.0] != 0 || Some(to) == self.ep;
                }
                if attack || x != 0 || self.pieces[to.0] != 0 {
                    return false;
                }
                let start = if dir == 1 { 1 } else { 6 };
                return dy == dir
                    || (dy == 2 * dir
                        && from.rank() == start
                        && self.pieces[(from.0 + to.0) / 2] == 0);
            }
            b'n' => return (x == 1 && y == 2) || (x == 2 && y == 1),
            b'k' => return x <= 1 && y <= 1,
            b'b' if x == y => (),
            b'r' if x == 0 || y == 0 => (),
            b'q' if x == y || x == 0 || y == 0 => (),
            _ => return false,
        }
        let step = dx.signum() + 8 * dy.signum();
        let mut i = from.0 as i8 + step;
        while i != to.0 as i8 {
            if self.pieces[i as usize] != 0 {
                return false;
            }
            i += step;
        }
        true
    }

    fn fen(&self) -> String {
        let mut text = String::new();
        for rank in (0..8).rev() {
            if rank < 7 {
                text.push('/');
            }
            let mut empty = 0;
            for &piece in &self.pieces[rank * 8..rank * 8 + 8] {
                if piece == 0 {
                    empty += 1;
                    continue;
                }
                if empty > 0 {
                    text.push(char::from(b'0' + empty));
                    empty = 0;
                }
                text.push(char::from(piece));
            }
            if empty > 0 {
                text.push(char::from(b'0' + empty));
            }
        }
        let ep = self.ep.map(Square::name).unwrap_or_else(|| "-".into());
        format!(
            "{text} {} - {ep} {} {}",
            if self.white { "w" } else { "b" },
            self.halfmove,
            self.fullmove
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play(fen: &str, from: &str, to: &str, promotion: &str) -> Result<PlayedMove, &'static str> {
        Board::from_fen(fen)?.play(Square::parse(from)?, Square::parse(to)?, promotion)
    }

    #[test]
    fn fuel_regression_position() {
        let before = "rnbq1bnr/4p1kp/1p1p4/p2B2N1/2p5/8/PPPPPP1P/RNBQK2R w - - 0 11";
        let after = "rnbq1bnr/4p1kp/1p1p4/p2B2N1/2p4P/8/PPPPPP2/RNBQK2R b - h3 0 11";
        let result = play(before, "h2", "h4", "").unwrap();
        assert_eq!(result.fen, after);
        assert!(!Board::from_fen(after).unwrap().in_check());
        assert_eq!(result.turn, "black");
    }

    #[test]
    fn mate_and_stalemate() {
        let mate = play(
            "5bn1/2Q2Q2/k1N4r/1p6/pnB3pp/4R3/PPP3PP/RNBK4 w - - 1 30",
            "c7",
            "a7",
            "",
        )
        .unwrap();
        assert!(mate.checkmate);
        assert_eq!(mate.label, "c7a7#");
        let draw = play("7k/5K2/8/5Q2/8/8/8/8 w - - 0 1", "f5", "g6", "").unwrap();
        assert!(draw.draw);
        assert!(!draw.checkmate);
    }

    #[test]
    fn en_passant_and_promotion() {
        let ep = play("7k/8/8/3pP3/8/8/8/K7 w - d6 0 2", "e5", "d6", "").unwrap();
        assert_eq!(ep.fen, "7k/8/3P4/8/8/8/8/K7 b - - 0 2");
        let knight = play("7k/P7/8/8/8/8/8/K7 w - - 0 1", "a7", "a8", "n").unwrap();
        assert_eq!(knight.fen, "N6k/8/8/8/8/8/8/K7 b - - 0 1");
        assert!(play(START_FEN, "e2", "e4", "q").is_err());
    }

    #[test]
    fn rejects_self_check_and_castling() {
        assert!(play("4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1", "e2", "d2", "").is_err());
        assert!(play("4k3/8/8/8/8/8/8/4K2R w K - 0 1", "e1", "g1", "").is_err());
    }
}

/// Normalize text from requests and legacy rows the same way as the public UI.
pub fn clean(text: &str, limit: usize) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(limit)
        .collect()
}

pub fn valid_address(address: &str) -> bool {
    let Some((name, domain)) = address.split_once('@') else {
        return false;
    };
    !name.is_empty()
        && !domain.contains('@')
        && !address.chars().any(char::is_whitespace)
        && domain
            .char_indices()
            .any(|(i, c)| c == '.' && i > 0 && i + 1 < domain.len())
}

pub fn mask(address: &str) -> String {
    let address = clean(address, 180);
    let Some((name, domain)) = address.split_once('@') else {
        return address;
    };
    if name.chars().count() <= 3 || domain.is_empty() {
        return address;
    }
    format!("{}...@{domain}", name.chars().take(3).collect::<String>())
}

pub fn append_pgn(pgn: &str, number: u64, color: &str, san: &str) -> String {
    let mut text = clean(pgn, 4000);
    if !text.is_empty() {
        text.push(' ');
    }
    if color == "white" {
        text.push_str(&format!("{}. ", number.div_ceil(2)));
    }
    text.push_str(san);
    text
}

pub fn payout_amount(join_amount: f64, percent: f64) -> u64 {
    let total = join_amount * 2.0;
    (total - total * (percent / 100.0)).trunc() as u64
}

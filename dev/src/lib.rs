mod api;
mod board;
mod game;
mod notation;
mod payments;
mod records;
mod storage;
mod wallet;

use serde_json::{json, Value};

wit_bindgen::generate!({ path: "../wasm/lnbits-extension.wit", world: "chesswasm", generate_all });
struct Chess;

type Reply = Result<Value, String>;

fn run(input: &str, handler: fn(&Value) -> Reply) -> String {
    let request = if input.is_empty() {
        Ok(json!({}))
    } else {
        serde_json::from_str(input)
    };
    let result = match request {
        Ok(value) if value.is_object() => handler(&value),
        _ => Err("request must be a JSON object.".into()),
    };
    match result {
        Ok(data) => json!({"ok": true, "data": data}),
        Err(error) => json!({"ok": false, "error": error}),
    }
    .to_string()
}

// Each WIT export has the same JSON envelope.
macro_rules! routes {
    ($($name:ident),+ $(,)?) => {
        impl Guest for Chess {
            $(fn $name(input:String) -> String { run(&input, api::$name) })+
        }
    };
}
routes!(
    get_chess_settings,
    save_chess_settings,
    list_chess_wallets,
    create_chess_game,
    list_chess_games,
    delete_chess_game,
    get_public_chess_game,
    join_chess_game,
    make_chess_move,
    resign_chess_game,
    settle_player_chess_payout,
    settle_chess_game,
    record_chess_payment
);
export!(Chess);

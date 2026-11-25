use crate::lnbits::extension::host;
use serde_json::{json, Value};

pub const SETTINGS: &str = "chess_settings";
pub const GAMES: &str = "chess_games";
pub const PLAYERS: &str = "chess_players";
pub const MOVES: &str = "chess_moves";

pub fn get(table: &str, id: &str, public: bool) -> Result<Option<Value>, String> {
    let request = host::StorageGetRequest {
        table: table.into(),
        id: id.into(),
    };
    let result = if public {
        host::storage_get_public(&request)
    } else {
        host::storage_get(&request)
    };
    result
        .data_json
        .map(|raw| serde_json::from_str(&raw).map_err(|_| "Invalid stored row.".into()))
        .transpose()
}

pub fn set(table: &str, value: &Value) -> Result<(), String> {
    if host::storage_set(&host::StorageSetRequest {
        table: table.into(),
        data_json: value.to_string(),
    })
    .ok
    {
        Ok(())
    } else {
        Err("Could not save chess state.".into())
    }
}

pub fn delete(table: &str, id: &str) -> Result<(), String> {
    if host::storage_delete(&host::StorageDeleteRequest {
        table: table.into(),
        id: id.into(),
    })
    .ok
    {
        Ok(())
    } else {
        Err("Could not delete chess state.".into())
    }
}

pub fn query(table: &str, filters: Value, sort: &str, limit: u32) -> host::StoragePaginatedRequest {
    host::StoragePaginatedRequest {
        table: table.into(),
        filters_json: filters.to_string(),
        sort_by: sort.into(),
        limit,
        search: String::new(),
        search_fields: Vec::new(),
        descending: false,
        offset: 0,
    }
}

pub fn page(query: &host::StoragePaginatedRequest) -> Result<(Vec<Value>, u64), String> {
    let response = host::storage_get_paginated(query);
    let rows = serde_json::from_str(&response.rows_json).map_err(|_| "Invalid stored rows.")?;
    Ok((rows, response.total))
}

pub fn settings() -> Result<Value, String> {
    let (rows, _) = page(&query(SETTINGS, json!({}), "created_at", 1))?;
    Ok(rows.into_iter().next().unwrap_or_else(|| {
        let now = host::now().timestamp;
        json!({
            "id": "",
            "wallet_id": "",
            "wallet_name": "",
            "enabled": false,
            "haircut": 0,
            "join_amount": 100,
            "max_bet": 100000000,
            "created_at": now,
            "updated_at": now,
        })
    }))
}

pub fn log(level: &str, message: String) {
    host::log(&host::LogRequest {
        level: level.into(),
        message,
    });
}

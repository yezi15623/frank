use crate::shaco::{model::ws::LcuSubscriptionType, ws};
use futures_util::stream::StreamExt;
use tauri::{AppHandle, Emitter, EventTarget};

/// 监听 LOL 客户端的 gameflow 状态变化。
///
/// 订阅的 LCU WebSocket 事件：/lol-gameflow/v1/gameflow-phase
/// 常见状态包括：None、Lobby、Matchmaking、ReadyCheck、ChampSelect、GameStart、PreEndOfGame 等。
/// 收到事件后转发给 background 窗口的 client_status 事件，由 background.ts 统一处理业务逻辑。
pub async fn listen_client(app: AppHandle) {
    let mut client = ws::LcuWebsocketClient::connect().await.unwrap();
    client
        .subscribe(LcuSubscriptionType::JsonApiEvent(
            "/lol-gameflow/v1/gameflow-phase".to_string(),
        ))
        .await
        .unwrap();

    while let Some(event) = client.next().await {
        app.emit_to(
            EventTarget::labeled("background"),
            "client_status",
            event.data,
        )
        .unwrap();
    }
}

/// 监听完整选人阶段 session。
///
/// /lol-champ-select/v1/session 返回的信息非常完整，包含双方队伍、actions、pick/ban 状态等。
/// Frank 用它判断当前是否轮到本地玩家 pick/ban，以及辅助推导当前英雄。
pub async fn listen_champ_select(app: AppHandle) {
    let mut client = ws::LcuWebsocketClient::connect().await.unwrap();
    client
        .subscribe(LcuSubscriptionType::JsonApiEvent(
            "/lol-champ-select/v1/session".to_string(),
        ))
        .await
        .unwrap();

    while let Some(event) = client.next().await {
        app.emit_to(
            EventTarget::labeled("background"),
            "lol-champ-select",
            event.data,
        )
        .unwrap();
    }
}

/// 监听当前选择英雄 ID。
///
/// 相比完整 session，这个接口的数据更小，只关注当前英雄。
/// 代码里先 unsubscribe 完整 session，再 subscribe current-champion，是为了减少高频 session 事件的处理压力。
pub async fn listen_current_champ_select(app: AppHandle) {
    let mut client = ws::LcuWebsocketClient::connect().await.unwrap();
    client
        .unsubscribe(LcuSubscriptionType::JsonApiEvent(
            "/lol-champ-select/v1/session".to_string(),
        ))
        .await
        .unwrap();

    client
        .subscribe(LcuSubscriptionType::JsonApiEvent(
            "/lol-champ-select/v1/current-champion".to_string(),
        ))
        .await
        .unwrap();

    while let Some(event) = client.next().await {
        app.emit_to(
            EventTarget::labeled("background"),
            "lol-current-champ-select",
            event.data,
        )
        .unwrap();
    }
}

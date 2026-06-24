// LCU 相关的 Rust command 层。
//
// 这一层的职责是：
// 1. 暴露给前端可调用的 Tauri command；
// 2. 初始化并保存全局 RESTClient；
// 3. 启动 LCU WebSocket 监听；
// 4. 调用 LOL 客户端配置文件、游戏进程、全局快捷键等本地能力。
mod global_key;
mod listener;
mod matchlisthanle;

use matchlisthanle::MatchListDetails;

use crate::lcu::global_key::init_global_keyboard;
use crate::lcu::listener::listen_current_champ_select;
use crate::shaco::ingame;
use crate::shaco::rest::RESTClient;
use crate::shaco::utils::process_info::get_auth_info;
use configparser::ini::Ini;
use listener::{listen_champ_select, listen_client};
use once_cell::sync::OnceCell;
use serde_json::{from_value, Value};
use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// 全局 REST 客户端。
///
/// OnceCell 表示“只初始化一次”的全局变量。
/// LCU 的 port/token 从 LeagueClientUx.exe 启动参数里读取，读取成功后创建 RESTClient。
/// 后续所有前端 LCU 请求都会复用这个客户端。
static REST_CLIENT: OnceCell<RESTClient> = OnceCell::new();

/// 获取已经初始化的 REST_CLIENT。
///
/// 如果 LOL 客户端尚未启动，或者 listen_for_client_start 还没成功拿到 token/port，
/// 这里会返回错误。前端最终通常会收到 null。
fn get_client() -> Result<&'static RESTClient, String> {
    REST_CLIENT
        .get()
        .ok_or_else(|| "REST_CLIENT is not initialized".to_string())
}

/// 前端访问 LCU REST API 的统一入口。
///
/// 前端调用示例：
/// invokeLcu("get", "/lol-gameflow/v1/session")
/// invokeLcu("post", "/lol-matchmaking/v1/ready-check/accept")
///
/// 学习重点：
/// - method/uri/body 从 TypeScript 侧传入；
/// - Rust 侧根据 method 调用 RESTClient 的 get/post/patch/delete；
/// - 返回 serde_json::Value，方便前端直接按 JSON 使用。
#[tauri::command]
pub async fn invoke_lcu(method: &str, uri: &str, body: &str) -> Result<Value, Value> {
    let client = get_client()?;

    if method == "get" {
        let res = client.get(uri).await;
        match res {
            Ok(res) => return Ok(res),
            // 当前实现没有把错误细节传回前端，只返回 Null。
            // 学习/重构时可以改成 Err(json!({"message": e.to_string()}))，方便 UI 显示错误原因。
            Err(_e) => return Err(Value::Null),
        }
    } else if method == "patch" {
        // PATCH 通常用于修改选人 action 等，需要 body 是合法 JSON 字符串。
        let parsed: Value = serde_json::from_str(body).expect("Failed to parse JSON string");
        let _res = client.patch(uri, serde_json::json!(parsed)).await.unwrap();
    } else if method == "post" {
        // POST 有些接口需要 body，有些接口不需要 body。
        // 例如 ready-check/accept 不需要有效 body，所以解析失败时发送 Null。
        let parsed = serde_json::from_str::<Value>(body);
        match parsed {
            Ok(parsed) => {
                let _res = client.post(uri, parsed).await.unwrap();
            }
            Err(_e) => {
                let _res = client.post(uri, Value::Null).await.unwrap();
            }
        }
    } else if method == "delete" {
        let _res = client.delete(uri).await.unwrap();
    }

    // 非 GET 请求多数情况下不关心返回 JSON，统一返回 Null。
    Ok(Value::Null)
}

/// 获取战绩列表并反序列化成强类型结构。
///
/// 这个函数和 invoke_lcu 的区别是：
/// - invoke_lcu 返回通用 JSON；
/// - get_match_list 返回 MatchListDetails 强类型，方便前端获得更明确的数据结构。
#[tauri::command]
pub async fn get_match_list(uri: &str) -> Result<MatchListDetails, Value> {
    let client = get_client()?;
    let res: Value = client.get(uri).await.expect("Failed to Url");
    match from_value::<MatchListDetails>(res.clone()) {
        Ok(match_list) => Ok(match_list),
        Err(_e) => Err(Value::Null),
    }
}

/// 获取当前 LOL 客户端区服。
///
/// 区服来自 LeagueClientUx.exe 启动参数中的 --rso_platform_id。
#[tauri::command]
pub fn get_lol_region() -> Result<String, String> {
    match get_auth_info() {
        Ok(info) => Ok(info.region),
        Err(_) => Err("客户端未运行".to_string()),
    }
}

/// 等待 LOL 客户端启动，并初始化 REST_CLIENT。
///
/// 这个 command 通常由 background.ts 启动时调用。
/// 它会在后台循环查找 LeagueClientUx.exe：
/// - 找到后解析 token/port；
/// - 创建 RESTClient；
/// - 向 background 窗口发送 client_status=ClientStarted；
/// - 超过 180 秒仍未找到则停止。
#[tauri::command]
pub fn listen_for_client_start(app: AppHandle) {
    tokio::spawn({
        async move {
            let start_time = Instant::now();
            let timeout = Duration::from_secs(180);

            loop {
                let is_exist = get_auth_info();
                match is_exist {
                    Ok(value) => {
                        let _ = REST_CLIENT
                            .set(RESTClient::new(value.token, value.port).unwrap())
                            .map_err(|_| "REST_CLIENT is already initialized".to_string());
                        app.emit_to("background", "client_status", "ClientStarted")
                            .expect("sent background error");
                        break;
                    }
                    Err(_) => {}
                }

                if start_time.elapsed() > timeout {
                    println!("客户端启动超时，未能获取信息。");
                    break;
                }

                thread::sleep(Duration::from_secs(3));
            }
        }
    });
}

/// 启动 LCU gameflow WebSocket 监听。
#[tauri::command]
pub async fn start_listener(app: AppHandle) {
    tokio::spawn(async move {
        listen_client(app).await;
    });
}

/// 启动完整 champ-select session 监听。
#[tauri::command]
pub async fn start_champ_select(app: AppHandle) {
    tokio::spawn(async move {
        listen_champ_select(app).await;
    });
}

/// 启动 current-champion 监听。
///
/// 相比完整 session，current-champion 只关注当前英雄 ID，事件处理更轻量。
#[tauri::command]
pub async fn start_current_champ_select(app: AppHandle) {
    tokio::spawn(async move {
        listen_current_champ_select(app).await;
    });
}

/// 检查游戏是否已经进入实际对局加载/游戏状态。
///
/// 这里访问的是游戏进程暴露的 in-game API，而不是 LCU 客户端 REST API。
#[tauri::command]
pub async fn is_game_start() -> bool {
    let client = ingame::IngameClient::new().expect("Game unstart");
    client.active_game_loadingscreen().await
}

/// 初始化全局快捷键。
#[tauri::command]
pub async fn init_keyboard(app: AppHandle) {
    tokio::spawn(async move { init_global_keyboard(app) });
}

/// 启动 LOL 客户端。
///
/// path 一般来自用户配置或自动检测到的客户端路径。
#[tauri::command]
pub async fn launch_lol(path: &str) -> Result<(), String> {
    std::process::Command::new(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 检查游戏窗口模式。
///
/// 读取 LOL 配置文件中的 [General] WindowMode：
/// - 0 = 全屏
/// - 1 = 窗口
/// - 2 = 无边框
/// - -1 = 配置文件不存在
#[tauri::command]
pub async fn check_borderless_mode(config_path: &str) -> Result<i32, String> {
    if !Path::new(config_path).exists() {
        return Ok(-1);
    }

    let mut config = Ini::new();
    if let Err(e) = config.load(config_path) {
        return Err(format!("读取配置文件失败: {}", e));
    }

    if let Some(mode_str) = config.get("General", "WindowMode") {
        match mode_str.trim().parse::<i32>() {
            Ok(id) => Ok(id),
            Err(_) => Err(format!("配置项格式非法: {}", mode_str)),
        }
    } else {
        Err("配置文件中缺少 WindowMode 项".into())
    }
}

/// 设置游戏窗口模式为无边框。
///
/// 该函数会直接写入 LOL 配置文件，所以需要注意：
/// - 文件路径必须正确；
/// - 如果文件是只读，需要先取消只读；
/// - 修改的是 WindowMode=2。
#[tauri::command]
pub async fn set_borderless_mode(config_path: &str) -> Result<String, String> {
    let path = Path::new(config_path);

    if !path.exists() {
        return Err("找不到游戏配置文件，请确认路径是否正确。".into());
    }

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let mut permissions = metadata.permissions();
    if permissions.readonly() {
        permissions.set_readonly(false);
        fs::set_permissions(path, permissions).map_err(|e| e.to_string())?;
    }

    let mut config = Ini::new();
    // 允许 ; 和 # 作为注释符号。League 的配置文件中可能含有注释。
    config.set_comment_symbols(&[';', '#']);

    config.load(config_path).map_err(|e| e.to_string())?;

    config.set("General", "WindowMode", Some("2".to_string()));

    match config.write(config_path) {
        Ok(_) => Ok("成功设置为无边框模式".into()),
        Err(e) => Err(format!("写入文件失败: {}", e)),
    }
}

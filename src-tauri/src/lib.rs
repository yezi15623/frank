// Tauri 后端模块入口。
// 这个文件相当于 WPF/WinForms 项目里的应用启动配置：注册全局状态、注册可被前端调用的命令、安装插件、启动运行时。
mod lcu;
mod lol_window_tracker;
mod shaco;

use lcu::{
    check_borderless_mode, get_lol_region, get_match_list, init_keyboard, invoke_lcu,
    is_game_start, launch_lol, listen_for_client_start, set_borderless_mode, start_champ_select,
    start_current_champ_select, start_listener,
};
use lol_window_tracker::{close_lol_client, start_tracking_loop, sync_tracker_config};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

/// FrankState 是注入到 Tauri 全局状态中的结构体。
///
/// 学习时可以把它类比成一个简单的全局服务容器：
/// - 前端通过 invoke 调用 Rust command；
/// - Rust command 可以通过 tauri::State<FrankState> 读取/修改这些共享状态；
/// - Arc 用于跨线程共享所有权，AtomicBool/Mutex 用于线程安全地读写状态。
pub struct FrankState {
    /// 是否启用 LOL 窗口跟踪/吸附逻辑。
    /// AtomicBool 适合这种只需要 true/false 且会被多个线程读写的配置。
    pub is_enabled: Arc<AtomicBool>,

    /// 防止窗口跟踪循环被重复启动的运行锁。
    pub is_running: Arc<AtomicBool>,

    /// 主窗口吸附到 LOL 窗口的左侧还是右侧。
    /// String 不是原子类型，所以用 Mutex 保护。
    pub dock_side: Arc<Mutex<String>>, // "Left" 或 "Right"
}

#[tokio::main]
pub async fn run() {
    tauri::Builder::default()
        // manage 会把 FrankState 放进 Tauri 的依赖注入系统，后续 command 可以通过 State<FrankState> 获取。
        .manage(FrankState {
            is_enabled: Arc::new(AtomicBool::new(false)), // 初始设为 false，等前端同步配置后再决定是否启用。
            is_running: Arc::new(AtomicBool::new(false)), // 初始为未运行，避免启动时就进入跟踪循环。
            dock_side: Arc::new(Mutex::new("Right".to_string())),
        })
        // 这里注册的是“前端可以 invoke 的 Rust 函数”。
        // 例如前端调用 invoke("invoke_lcu", {...})，最终会进入 lcu.rs 里的 invoke_lcu。
        .invoke_handler(tauri::generate_handler![
            get_lol_region,
            start_listener,
            start_champ_select,
            invoke_lcu,
            get_match_list,
            is_game_start,
            init_keyboard,
            listen_for_client_start,
            start_current_champ_select,
            launch_lol,
            start_tracking_loop,
            sync_tracker_config,
            set_borderless_mode,
            check_borderless_mode,
            close_lol_client
        ])
        // HTTP、Shell、打开外部资源、进程控制等 Tauri 插件。
        // 这些插件让前端/后端可以使用 Tauri 提供的桌面能力。
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        // 单实例插件：防止用户重复启动多个 Frank 实例。
        // 如果检测到第二个实例启动，就把已有的 mainWindow 显示出来。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = app
                .get_webview_window("mainWindow")
                .expect("no main window")
                .show();
        }))
        // 窗口状态插件：保存窗口位置等信息。
        // background 和几个临时查询窗口被排除，避免隐藏窗口/临时窗口的位置被持久化。
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .with_denylist(&[
                    "background",
                    "queryMatchWindow",
                    "matchAnalysisWindow",
                    "recentMatchWindow",
                ])
                .build(),
        )
        // 真正启动 Tauri 应用。
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

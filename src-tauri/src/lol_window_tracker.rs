use crate::FrankState;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Manager, PhysicalPosition, WebviewWindow};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, IsIconic, IsWindow};

/// LOL 窗口跟踪器。
///
/// 这个模块负责把 Frank 主窗口“吸附”到英雄联盟窗口左侧或右侧。
/// 对 C# 桌面开发来说，可以类比为：
/// - 通过 Win32 API 找到外部窗口句柄；
/// - 定时读取外部窗口坐标；
/// - 调整自己窗口的位置。
pub struct LolTracker;

impl LolTracker {
    /// 启动窗口跟踪循环。
    ///
    /// 参数说明：
    /// - window：Frank 的 mainWindow，即需要被移动的 Tauri WebviewWindow；
    /// - is_enabled：是否启用吸附功能，由前端配置同步过来；
    /// - dock_side：吸附方向，"Left" 或 "Right"。
    ///
    /// 这里使用 std::thread::spawn 创建系统线程，而不是 tokio 任务。
    /// 原因是它主要做 Win32 窗口轮询和同步移动，不依赖 async I/O。
    pub fn start_tracking(
        window: WebviewWindow,
        is_enabled: Arc<AtomicBool>,
        dock_side: Arc<Mutex<String>>,
    ) {
        thread::spawn(move || {
            // 上一次记录的 LOL 窗口矩形，用于判断位置是否变化。
            let mut last_pos: Option<RECT> = None;
            // 上一次吸附方向，用于判断用户是否切换了 Left/Right。
            let mut last_side: Option<String> = None;

            loop {
                // 如果 mainWindow 已经被销毁，inner_position 会失败，此时退出线程。
                if window.inner_position().is_err() {
                    break;
                }

                // 如果前端配置关闭了吸附功能，就降低轮询频率并跳过移动逻辑。
                if !is_enabled.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(500));
                    continue;
                }

                unsafe {
                    if let Some((hwnd, visible_rect)) = Self::get_lol_visible_rect() {
                        // 检测 LOL 窗口是否最小化。
                        let is_minimized = IsIconic(hwnd).as_bool();
                        // 一些最小化/隐藏场景下，Windows 会给出异常坐标。
                        let is_offscreen = visible_rect.left <= 0 && visible_rect.top <= 0;

                        if is_minimized || is_offscreen {
                            // 如果客户端隐藏了，不更新 Frank 位置。
                            // 这样 Frank 会停留在最后一次有效位置，避免跳到屏幕角落。
                            thread::sleep(Duration::from_millis(100));
                            continue;
                        }

                        // 读取当前吸附配置。
                        // Mutex 锁只持有很短时间，clone 出 String 后立即释放。
                        let current_side = {
                            let s = dock_side.lock().unwrap();
                            s.clone()
                        };

                        // 只有当 LOL 窗口位置变化或吸附方向变化时才调用 set_position。
                        // 这样可以减少不必要的窗口移动请求。
                        let pos_changed = !Self::is_same_pos(last_pos, visible_rect);
                        let side_changed = Some(&current_side) != last_side.as_ref();

                        if pos_changed || side_changed {
                            // Frank 主窗口宽度约 320，这里用 328 留出一点间距。
                            let target_x = if current_side == "Left" {
                                visible_rect.left - 328
                            } else {
                                // 右侧吸附时略微压到边缘内侧，避免视觉缝隙过大。
                                visible_rect.right - 8
                            };

                            let target_y = visible_rect.top - 2;

                            let _ = window.set_position(PhysicalPosition {
                                x: target_x,
                                y: target_y,
                            });

                            last_pos = Some(visible_rect);
                            last_side = Some(current_side);
                        }
                    }
                }

                // 约 60 FPS 的轮询频率。窗口拖动时能比较顺滑，但也会持续占用少量 CPU。
                thread::sleep(Duration::from_millis(16));
            }
        });
    }

    /// 获取 LOL 窗口真正的可见矩形。
    ///
    /// FindWindowW 只能根据窗口标题拿到 HWND。
    /// DwmGetWindowAttribute + DWMWA_EXTENDED_FRAME_BOUNDS 可以拿到排除阴影后的真实边界，
    /// 比普通 GetWindowRect 更适合做窗口吸附。
    unsafe fn get_lol_visible_rect() -> Option<(HWND, RECT)> {
        // 当前只匹配游戏窗口标题。后续如果要兼容更多标题，可以继续往数组里加。
        let titles = ["League of Legends"];
        for title in titles {
            // Win32 API 使用宽字符字符串，且需要以 0 结尾。
            let title_wide: Vec<u16> =
                std::os::windows::ffi::OsStrExt::encode_wide(std::ffi::OsStr::new(title))
                    .chain(std::iter::once(0))
                    .collect();

            let hwnd = FindWindowW(None, PCWSTR(title_wide.as_ptr()));

            if hwnd.0 != 0 && IsWindow(hwnd).as_bool() {
                let mut rect = RECT::default();
                let result = DwmGetWindowAttribute(
                    hwnd,
                    DWMWA_EXTENDED_FRAME_BOUNDS,
                    &mut rect as *mut _ as *mut _,
                    std::mem::size_of::<RECT>() as u32,
                );

                if result.is_ok() {
                    return Some((hwnd, rect));
                }
            }
        }
        None
    }

    /// 判断当前矩形是否和上一次完全一致。
    /// 用于避免每一帧都重复调用 set_position。
    fn is_same_pos(last: Option<RECT>, current: RECT) -> bool {
        match last {
            Some(old) => {
                old.left == current.left
                    && old.top == current.top
                    && old.right == current.right
                    && old.bottom == current.bottom
            }
            None => false,
        }
    }
}

/// 从前端同步窗口吸附配置到 Rust 全局状态。
///
/// 前端通常在主窗口创建后调用：
/// invoke("sync_tracker_config", { enabled, side })
#[tauri::command]
pub fn sync_tracker_config(enabled: bool, side: String, state: tauri::State<'_, FrankState>) {
    state.is_enabled.store(enabled, Ordering::Relaxed);
    {
        let mut dock = state.dock_side.lock().unwrap();
        *dock = side;
    }
}

/// 启动窗口跟踪循环。
///
/// 这个 command 可以被前端多次调用，但内部用 is_running 做了防重入。
#[tauri::command]
pub fn start_tracking_loop(state: tauri::State<'_, FrankState>, window: tauri::WebviewWindow) {
    // swap(true) 会返回旧值：
    // - 如果旧值是 true，说明循环已经启动，直接 return；
    // - 如果旧值是 false，则设置为 true 并继续启动。
    if state.is_running.swap(true, Ordering::SeqCst) {
        return;
    }

    let main_win = window
        .get_webview_window("mainWindow")
        .expect("not found mainWindow");
    LolTracker::start_tracking(main_win, state.is_enabled.clone(), state.dock_side.clone());
}

/// 关闭 LOL 客户端。
///
/// 这里通过 Windows taskkill 结束 LeagueClient.exe 及其子进程。
/// 注意：这是比较强制的关闭方式，相当于命令行执行：
/// taskkill /F /IM LeagueClient.exe /T
#[tauri::command]
pub fn close_lol_client() -> Result<String, String> {
    // CREATE_NO_WINDOW (0x08000000) 防止执行命令时弹出黑色 CMD 窗口。
    let output = Command::new("taskkill")
        .args(&["/F", "/IM", "LeagueClient.exe", "/T"])
        .creation_flags(0x08000000)
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                Ok("successful".into())
            } else {
                // 如果客户端没运行，taskkill 会报错，这里也视作“处理完成”。
                Ok("unsuccessful".into())
            }
        }
        Err(e) => Err(format!("执行命令失败: {}", e)),
    }
}

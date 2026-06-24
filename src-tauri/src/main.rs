// 在 Windows 的 release 构建中隐藏额外的控制台窗口。
// 对桌面 GUI 应用来说，如果不加这一行，发布版启动时可能会同时弹出一个黑色命令行窗口。
// 官方模板提示 DO NOT REMOVE，除非你明确希望保留控制台用于调试。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[allow(unused)]

fn main() {
    // Tauri 的实际初始化逻辑放在 frank_lib::run() 中。
    // main.rs 只保留极薄的一层入口，方便把核心逻辑放到 lib.rs 里组织和测试。
    frank_lib::run();
}

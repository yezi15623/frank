use crate::shaco::error::ProcessInfoError;
use base64::{engine::general_purpose, Engine};
use sysinfo::{ProcessExt, System, SystemExt};

#[cfg(target_os = "windows")]
const TARGET_PROCESS: &str = "LeagueClientUx.exe";
// #[cfg(target_os = "linux")]
// const TARGET_PROCESS: &str = "LeagueClientUx.";
// #[cfg(target_os = "macos")]
// const TARGET_PROCESS: &str = "LeagueClientUx";

/// 连接 LCU 所需的认证信息。
///
/// 这些值不是写死的，而是每次从 LeagueClientUx.exe 的启动参数中解析出来。
/// 客户端重启后 port/token 可能变化，所以需要动态读取。
pub struct AuthResponse {
    /// Basic Auth token，格式是 base64("riot:{remoting-auth-token}")。
    pub token: String,

    /// LCU 本地 HTTPS 端口，来自 --app-port=xxx。
    pub port: String,

    /// 区服/平台 ID，来自 --rso_platform_id=xxx。
    pub region: String,
}

/// 从 LeagueClientUx.exe 进程启动参数中解析 LCU 认证信息。
///
/// 学习重点：
/// - LCU 没有固定端口；
/// - token/port 都藏在 LOL 客户端进程参数里；
/// - sysinfo 用于枚举系统进程；
/// - 找到 LeagueClientUx.exe 后读取它的 cmd 参数。
pub(crate) fn get_auth_info() -> Result<AuthResponse, ProcessInfoError> {
    let mut sys = System::new_all();

    // 刷新进程列表，否则读取到的可能是旧状态。
    sys.refresh_processes();

    // 找到 LeagueClientUx.exe，并取出它的命令行参数列表。
    let args = sys
        .processes()
        .values()
        .find(|p| p.name() == TARGET_PROCESS)
        .map(|p| p.cmd())
        .ok_or(ProcessInfoError::ProcessNotAvailable)?;

    // 解析 LCU 端口：--app-port=xxxxx
    let port = args
        .iter()
        .find(|arg| arg.starts_with("--app-port="))
        .map(|arg| arg.strip_prefix("--app-port=").unwrap().to_string())
        .ok_or(ProcessInfoError::PortNotFound)?;

    // 解析远程控制 token：--remoting-auth-token=xxxxx
    let auth_token = args
        .iter()
        .find(|arg| arg.starts_with("--remoting-auth-token="))
        .map(|arg| {
            arg.strip_prefix("--remoting-auth-token=")
                .unwrap()
                .to_string()
        })
        .ok_or(ProcessInfoError::AuthTokenNotFound)?;

    // 解析区服/平台 ID：--rso_platform_id=HN1 / TJ100 等。
    let rso_platform_id = args
        .iter()
        .find(|arg| arg.starts_with("--rso_platform_id="))
        .map(|arg| arg.strip_prefix("--rso_platform_id=").unwrap().to_string())
        .ok_or(ProcessInfoError::PlatformIdNotFound)?;

    Ok(AuthResponse {
        // LCU 使用 Basic Auth，用户名固定为 riot，密码是 remoting-auth-token。
        token: general_purpose::STANDARD.encode(format!("riot:{}", auth_token)),
        port,
        region: rso_platform_id,
    })
}

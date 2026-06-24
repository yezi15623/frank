use serde::Serialize;

use crate::shaco::utils::request::build_reqwest_client;

/// LCU REST API 客户端。
///
/// LCU 是英雄联盟客户端在本机暴露的 HTTPS 接口。
/// 请求地址通常形如：
/// https://127.0.0.1:{port}/lol-gameflow/v1/session
///
/// 注意：
/// - port 每次客户端启动都可能变化；
/// - token 来自 LeagueClientUx.exe 的启动参数；
/// - build_reqwest_client 会处理 LCU 的本地 HTTPS 证书和 Basic Auth。
pub struct RESTClient {
    /// LCU 本地端口，例如 52345。
    port: String,

    /// 已经配置好认证信息和证书策略的 reqwest 客户端。
    reqwest_client: reqwest::Client,
}

type Error = Box<dyn std::error::Error>;

impl RESTClient {
    /// 创建 LCU REST 客户端。
    ///
    /// auth_token 是经过 base64 编码后的 "riot:{remoting-auth-token}"。
    /// port 是从 --app-port=xxx 解析出来的本地端口。
    pub fn new(auth_token: String, port: String) -> Result<Self, Error> {
        let reqwest_client = build_reqwest_client(Some(auth_token));
        Ok(Self {
            port,
            reqwest_client,
        })
    }

    /// 发送 GET 请求。
    ///
    /// 典型用途：读取当前游戏流程、读取选人 session、读取符文页列表等。
    pub async fn get(&self, endpoint: &str) -> Result<serde_json::Value, reqwest::Error> {
        self.reqwest_client
            .get(format!("https://127.0.0.1:{}{}", self.port, endpoint))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            // 有些 LCU 接口成功但没有 JSON body，这里把解析失败统一当成 Null。
            .or_else(|_| Ok(serde_json::Value::Null))
    }

    /// 发送 POST 请求。
    ///
    /// 典型用途：接受对局、创建符文页、执行某些客户端动作。
    pub async fn post<T: Serialize>(
        &self,
        endpoint: &str,
        body: T,
    ) -> Result<serde_json::Value, reqwest::Error> {
        self.reqwest_client
            .post(format!("https://127.0.0.1:{}{}", self.port, endpoint))
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            .or_else(|_| Ok(serde_json::Value::Null))
    }

    /// 发送 PUT 请求。
    ///
    /// 当前项目中使用较少，但保留给需要整体替换资源的 LCU 接口。
    pub async fn put<T: Serialize>(
        &self,
        endpoint: &str,
        body: T,
    ) -> Result<serde_json::Value, reqwest::Error> {
        self.reqwest_client
            .put(format!("https://127.0.0.1:{}{}", self.port, endpoint))
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            .or_else(|_| Ok(serde_json::Value::Null))
    }

    /// 发送 DELETE 请求。
    ///
    /// 典型用途：删除当前可删除的符文页，然后再创建新的符文页。
    pub async fn delete(&self, endpoint: &str) -> Result<serde_json::Value, reqwest::Error> {
        self.reqwest_client
            .delete(format!("https://127.0.0.1:{}{}", self.port, endpoint))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            .or_else(|_| Ok(serde_json::Value::Null))
    }

    /// 发送 PATCH 请求。
    ///
    /// 典型用途：修改选人阶段 action，例如把某个 pick/ban action 设置为 completed=true。
    pub async fn patch<T: Serialize>(
        &self,
        endpoint: &str,
        body: T,
    ) -> Result<serde_json::Value, reqwest::Error> {
        self.reqwest_client
            .patch(format!("https://127.0.0.1:{}{}", self.port, endpoint))
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            .or_else(|_| Ok(serde_json::Value::Null))
    }
}

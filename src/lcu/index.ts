import { invoke } from "@tauri-apps/api/core";

/**
 * 前端访问 LCU 的统一封装。
 *
 * 调用链：
 * Vue/TS 页面或业务模块
 *   -> invokeLcu(method, uri, body)
 *   -> Tauri invoke("invoke_lcu", ...)
 *   -> Rust 后端 src-tauri/src/lcu.rs::invoke_lcu
 *   -> RESTClient 请求 https://127.0.0.1:{LCU端口}{uri}
 *
 * 这样封装的好处：
 * - 前端不需要知道 LCU 的 token、port、证书处理等细节；
 * - 所有 LCU 请求都统一走 Rust 后端，便于集中处理鉴权和错误；
 * - 泛型 <T> 让调用方可以声明期望返回的数据结构。
 */
export const invokeLcu = <T>(
	method: string,
	uri: string,
	body: string = "",
): Promise<T | null> => {
	return invoke<T | null>("invoke_lcu", { method: method, uri: uri, body: body })
		.then((result) => {
			// Rust 端某些 POST/DELETE/PATCH 操作成功后只返回 Null。
			// 这里统一转换成 null，让业务层用 if (res === null) 判断失败或无返回值。
			if (result === null) {
				return null;
			}
			return result as T;
		})
		.catch(() => {
			// 当前项目选择吞掉异常并返回 null。
			// 学习/重构时可以考虑把错误对象返回给 UI，方便显示“客户端未启动、接口不存在、请求失败”等原因。
			return null;
		});
};

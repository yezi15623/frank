import {
	BlacklistListTypes,
	Hater,
	UserInfos,
} from "@/main/views/record/blackListTypes";
import { fetch } from "@tauri-apps/plugin-http";

/**
 * 通用 HTTP 请求封装。
 *
 * 这里使用的是 @tauri-apps/plugin-http 的 fetch，而不是浏览器原生 fetch。
 * Tauri HTTP 插件可以绕过部分浏览器 CORS 限制，更适合桌面应用访问外部接口。
 *
 * @param url 请求地址
 * @param method HTTP 方法，例如 GET/POST
 * @param body 可选请求体
 * @param timeout 可选连接超时时间
 */
export const requestFetch = async <T>(
	url: string,
	method: string,
	body?: string,
	timeout?: number,
): Promise<T | null> => {
	const res = await fetch(url, { method, body, connectTimeout: timeout });

	if (res.status === 200) {
		const data: T = await res.json();
		return data;
	} else {
		return null;
	}
};

/**
 * 黑名单/吐槽相关服务端接口统一入口。
 *
 * 注意：这里访问的是项目自己的远程服务，不是 LCU。
 * config 里通常包含：
 * - url：接口路径；
 * - method：GET/POST 等；
 * - data：请求体数据。
 */
const blacklistServe = (config: any): Promise<any | null> => {
	return requestFetch<any>(
		"http://121.40.58.64:8412" + config.url,
		config.method,
		JSON.stringify(config?.data),
	)
		.then((res) => {
			if (res === null) {
				return null;
			}
			return res;
		})
		.catch(() => null);
};

/** 根据玩家 ID 查询玩家信息。 */
export const findPlayerByPlayerId = async (
	config: any,
): Promise<null | UserInfos> => {
	const res = await blacklistServe(config);

	if (res === null || res.code !== 0) {
		return null;
	}
	return res.data;
};

/** 根据被标记玩家 ID 查询相关吐槽/黑名单内容。 */
export const findHaterByHaterId = async (
	config: any,
): Promise<null | Hater[]> => {
	const res = await blacklistServe(config);
	if (res === null || res.code !== 0) {
		return null;
	}
	return res.data;
};

/** 查询某个黑名单条目详情。 */
export const findBlacklistByHId = async (
	config: any,
): Promise<null | BlacklistListTypes> => {
	const res = await blacklistServe(config);
	if (res === null || res.code !== 0) {
		return null;
	}
	return res.data;
};

/**
 * 把服务端统一返回格式转换成 boolean。
 * code=0 表示成功，其他情况都视为失败。
 */
const handleRequest = (res: any) => {
	if (res === null || res.code !== 0) {
		return false;
	}
	return true;
};

/** 修改吐槽/黑名单内容。 */
export const reviseHaterContent = async (config: any): Promise<boolean> => {
	const res = await blacklistServe(config);
	return handleRequest(res);
};

/** 删除黑名单条目。 */
export const deleteBlacklist = async (config: any): Promise<boolean> => {
	const res = await blacklistServe(config);
	return handleRequest(res);
};

/** 删除某条吐槽/被标记内容。 */
export const deleteHater = async (config: any): Promise<boolean> => {
	const res = await blacklistServe(config);
	return handleRequest(res);
};

/** 创建吐槽/被标记内容。 */
export const createHaterContent = async (config: any): Promise<boolean> => {
	const res = await blacklistServe(config);
	return handleRequest(res);
};

/** 更新玩家战绩/记录信息。 */
export const updatePlayerRecord = async (config: any): Promise<boolean> => {
	const res = await blacklistServe(config);
	return handleRequest(res);
};

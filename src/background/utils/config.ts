import { ConfigRank, ConfigSettingTypes } from "../types";
import { invokeLcu } from "@/lcu";

/**
 * 默认功能配置。
 *
 * 这些配置会保存到 localStorage.configSetting。
 * Frank 启动时如果本地没有配置，就写入这份默认值；如果已有旧配置，则补齐新增字段。
 */
const configSetting: ConfigSettingTypes = {
	// 自动选择英雄配置。默认英雄 ID 157 是亚索。
	autoPickChampion: {
		championId: "157",
		isAuto: false,
	},
	// 自动禁用英雄配置。默认英雄 ID 101 是泽拉斯。
	autoBanChampion: {
		championId: "101",
		isAuto: false,
	},
	// 是否只自动执行一次 pick/ban。
	autoIsOne: true,
	// 自动接受对局配置。50 表示立即接受，小于 50 表示关闭，大于 50 表示延迟接受。
	autoAccept: 50,
	// 主题。
	theme: "light",
	// 是否在游戏内显示战绩窗口。
	isGameInWindow: true,
	// 是否显示游戏内提示。
	isGameInTips: false,
	// 是否自动写入推荐出装。
	autoWriteBlock: true,
	// 游戏内窗口透明度。
	inWinOpacity: 100,
	// 首次使用或风险提示类开关。
	warmTips: {
		autoRune: false,
		rankTips: false,
		teamTips: false,
	},
	// LOL 窗口吸附配置：0=关闭，1=吸附左侧，其他值通常表示吸附右侧。
	lolTracker: 0,
	// 关闭 Frank 时是否同时关闭 LOL 客户端。
	shouldCloseLOL: true,
};

/**
 * 默认段位/分路筛选配置。
 */
const configRank: ConfigRank = {
	tier: 200,
	lane: "mid",
	is101: true,
};

/**
 * 给已有 localStorage 配置补齐新增字段。
 *
 * 这个函数解决“老用户升级后配置缺字段”的问题。
 * 例如新版本新增了 shouldCloseLOL，老配置里没有，就把默认值补进去。
 */
const addConfig = (configName: string, configObj: any) => {
	const localS = JSON.parse(<string>localStorage.getItem(configName));
	if (Object.keys(localS).length === Object.keys(configObj).length) {
		return;
	}

	for (const configKey of Object.keys(configObj)) {
		if (!localS.hasOwnProperty(configKey)) {
			// @ts-ignore
			localS[configKey] = configObj[configKey];
			localStorage.setItem(configName, JSON.stringify(localS));
		}
	}
};

/**
 * 初始化本地配置。
 *
 * background.ts 构造函数中会调用它，确保后续业务读取 configSetting/configRank 时有值。
 */
export const configInit = () => {
	if (localStorage.getItem("configSetting") === null) {
		localStorage.setItem("configSetting", JSON.stringify(configSetting));
		localStorage.setItem("configRank", JSON.stringify(configRank));
	} else {
		addConfig("configSetting", configSetting);
		addConfig("configRank", configRank);
	}
};

/**
 * 获取 LOL 客户端启动路径并缓存。
 *
 * LCU 接口 /data-store/v1/install-dir 返回的是 LeagueClient 的安装路径。
 * 这里把 LeagueClient 替换成 TCLS\client.exe，用于后续从 Frank 启动国服客户端。
 */
export const getClientPath = async () => {
	const clientPath = await invokeLcu<string | null>(
		"get",
		"/data-store/v1/install-dir",
	);

	if (clientPath === null) return false;

	const storedPath = localStorage.getItem("clientPath");
	const updatedPath = clientPath.replace("LeagueClient", "TCLS\\client.exe");

	// 只在路径不一致时更新，减少无意义的 localStorage 写入。
	if (storedPath?.toLowerCase() !== updatedPath.toLowerCase()) {
		localStorage.setItem("clientPath", updatedPath);
	}
	return true;
};

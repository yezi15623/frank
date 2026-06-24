import { invokeLcu } from "./index";
import { ConfigSettingTypes } from "@/background/types";

/**
 * 执行一次 pick/ban action。
 *
 * LCU 的选人阶段不是直接“选择英雄”，而是修改当前 action：
 * PATCH /lol-champ-select/v1/session/actions/{actionID}
 * body 中设置 completed=true、type=pick/ban、championId=目标英雄。
 *
 * @param actionID 当前 action 的 id，来自 champ-select session 的 actions 数组
 * @param champId 要选择或禁用的英雄 ID
 * @param type pick 或 ban
 * @param idSetInterval 外层轮询定时器 ID，成功或无需继续时用于停止轮询
 */
const champSelectPatchAction = async (
	actionID: any,
	champId: any,
	type: string,
	idSetInterval: number,
) => {
	const localBody: any = {
		completed: true,
		type: type,
		championId: champId,
	};
	invokeLcu(
		"patch",
		`/lol-champ-select/v1/session/actions/${actionID}`,
		JSON.stringify(localBody),
	).then((value) => {
		// 发送一次 PATCH 后停止轮询，避免重复操作同一个 action。
		clearInterval(idSetInterval);
		// 某些情况下 pick 失败也没有继续轮询的意义，例如英雄不可用或已经被选择。
		if (!value?.success && type === "pick") {
			clearInterval(idSetInterval);
		}
	});
};

/**
 * 读取当前选人会话，并在轮到本地玩家时自动 pick/ban。
 *
 * 调用链：
 * background.ts 进入 ChampSelect
 *   -> GameFlow.autoPickBanChamp 每秒调用
 *   -> champSelectSession
 *   -> GET /lol-champ-select/v1/session
 *   -> 找到本地玩家正在进行的 action
 *   -> PATCH action 完成选择/禁用
 */
export const champSelectSession = async (
	idSetInterval: number,
	config: ConfigSettingTypes,
) => {
	try {
		const res = await invokeLcu("get", "/lol-champ-select/v1/session");
		const localPlayerCellId = res?.localPlayerCellId;
		const actions = res?.actions;

		// 如果 actions 还不存在，说明选人会话未准备好或已结束，停止本轮自动 BP 轮询。
		if (actions === undefined) {
			clearInterval(idSetInterval);
		}

		// actions 是二维数组：每个小数组代表一个阶段/批次的操作。
		for (let action of actions) {
			for (let actionElement of action) {
				// actorCellId 等于本地玩家，且 isInProgress=true，表示当前轮到我操作。
				if (
					actionElement.actorCellId == localPlayerCellId &&
					actionElement.isInProgress
				) {
					if (actionElement.type === "pick" && config.autoPickChampion.isAuto) {
						champSelectPatchAction(
							actionElement.id,
							config.autoPickChampion.championId,
							"pick",
							idSetInterval,
						);
						// autoIsOne 表示只自动执行一次。执行后写回配置，避免后续继续自动 pick。
						if (config.autoIsOne) {
							config.autoPickChampion.isAuto = false;
							localStorage.setItem("configSetting", JSON.stringify(config));
						}
					} else if (
						actionElement.type === "ban" &&
						config.autoBanChampion.isAuto
					) {
						champSelectPatchAction(
							actionElement.id,
							config.autoBanChampion.championId,
							"ban",
							idSetInterval,
						);
						if (config.autoIsOne) {
							config.autoBanChampion.isAuto = false;
							localStorage.setItem("configSetting", JSON.stringify(config));
						}
					}
				}

				// 如果本地玩家的 pick action 已完成，也停止轮询。
				if (
					actionElement.actorCellId == localPlayerCellId &&
					!actionElement.isInProgress
				) {
					if (actionElement.type === "pick" && actionElement.completed) {
						clearInterval(idSetInterval);
					}
				}
			}
		}
	} catch (_e: any) {
		// 出错时停止轮询，避免客户端未响应时一直请求。
		clearInterval(idSetInterval);
	}
};

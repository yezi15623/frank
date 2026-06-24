import { invokeLcu } from "./index";
import { LcuRuneInfo } from "./types/runeLcuTypes";

/**
 * 推荐符文数据结构。
 *
 * 这份数据会被直接写入 LOL 客户端的符文页接口。
 * 其中 primaryStyleId/subStyleId/selectedPerkIds 是 LCU 真正关心的字段；
 * alias/name/position/winRate 等字段主要来自推荐数据源，用于 UI 展示或命名。
 */
interface T {
	alias: string;
	name: string;
	position: string;
	pickCount: number;
	winRate: string;
	primaryStyleId: number;
	subStyleId: number;
	selectedPerkIds: number[];
	score: number;
	type: string;
}

/**
 * 应用符文页。
 *
 * 当前实现策略：
 * 1. GET /lol-perks/v1/pages 读取所有符文页；
 * 2. 找到一个可删除且不是临时页的符文页；
 * 3. DELETE 删除该页；
 * 4. POST 创建新的推荐符文页。
 *
 * 学习注意点：
 * - 这个函数会修改用户客户端里的符文页；
 * - 如果没有可删除符文页，会返回 false；
 * - 实际项目中可以进一步优化为“优先复用 Frank 创建的符文页”，避免误删用户常用页。
 */
export const applyRunePage = async (data: T) => {
	try {
		const currentRuneList: Array<LcuRuneInfo> | null = await invokeLcu(
			"get",
			"/lol-perks/v1/pages",
		);
		if (currentRuneList === null) return false;

		// isDeletable=true 表示客户端允许删除；isTemporary=false 表示不是临时符文页。
		const current = currentRuneList.find(
			(i: LcuRuneInfo) => i.isDeletable && !i.isTemporary,
		);
		if (current === undefined) {
			return false;
		}

		await invokeLcu("delete", `/lol-perks/v1/pages/${current.id}`);
		await invokeLcu("post", "/lol-perks/v1/pages", JSON.stringify(data));
		return true;
	} catch (_e) {
		return false;
	}
};

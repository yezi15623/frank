import { invokeLcu } from "@/lcu";
import { summonerInfo } from "@/lcu/types/SummonerTypes";
import {
	MyTeamObject,
	RencentDataAnalysisTypes,
	RoleCountMapTypes,
	SummonerInfoList,
} from "./teammateTypes";
import { dealDivsion, englishToChinese } from "@/lcu/utils";
import { champDict } from "@/resources/champList";
import { SimpleMatchTypes } from "@/lcu/types/queryMatchLcuTypes";
import { querySummonerInfo } from "@/lcu/aboutSummoner";
import { ChampionSession } from "@/background/types";
// import {champSession} from "@/test";

/**
 * 在选人阶段获取我方所有召唤师 ID。
 *
 * 数据来源：GET /lol-champ-select/v1/session
 * 返回值中的 myTeam 包含本方玩家 cellId、summonerId 等信息。
 *
 * @param islistenSession 是否已经启动 champ-select 监听。未启动时顺手查询当前英雄 ID。
 */
export const queryAllSummonerId = async (islistenSession: boolean) => {
	// 进入 ChampSelect 后 LCU session 可能还没完全稳定，稍等一小段时间再读取。
	await new Promise((resolve) => setTimeout(resolve, 666));

	const mactchSession = await invokeLcu<ChampionSession>(
		"get",
		"/lol-champ-select/v1/session",
	);
	// const mactchSession = champSession

	if (mactchSession === null) return null;

	const getChampId =
		islistenSession === false
			? await invokeLcu<number | null>(
					"get",
					"/lol-champ-select/v1/current-champion",
				)
			: 0;

	const myTeam: MyTeamObject[] = mactchSession.myTeam;
	if (myTeam) {
		// 去重并过滤 0，避免无效玩家 ID 进入后续查询。
		const summonerIdList = [
			...new Set(myTeam.map((summoner) => summoner.summonerId)),
		].filter((id) => id !== 0);

		return {
			summonerIdList: summonerIdList,
			champId: getChampId === null ? 0 : getChampId,
		};
	}
	return null;
};

/**
 * 查询某个召唤师的单双排/灵活段位。
 */
const querySummonerRank = async (puuid: string): Promise<[string, string]> => {
	try {
		const response: any = await invokeLcu(
			"get",
			`/lol-ranked/v1/ranked-stats/${puuid}`,
		);
		const rankPoint = response?.queues ?? [];

		if (!Array.isArray(rankPoint) || rankPoint.length === 0) {
			return ["未定级", "未定级"];
		}

		const rankSolo = rankPoint.find((i: any) => i.queueType === "RANKED_SOLO_5x5");
		const rankFlex = rankPoint.find((i: any) => i.queueType === "RANKED_FLEX_SR");

		const generateRankString = (rank: any): string => {
			if (!rank || rank.tier === "") return "未定级";
			return `${englishToChinese(rank.tier)}${dealDivsion(rank.division)} ${rank.leaguePoints}`;
		};

		const RANKED_SOLO = generateRankString(rankSolo);
		const RANKED_FLEX_SR = generateRankString(rankFlex);

		return [RANKED_SOLO, RANKED_FLEX_SR];
	} catch (_error) {
		return ["error", "error"];
	}
};

/**
 * 获取队友列表基础信息。
 *
 * 流程：
 * 1. 从 champ-select session 中拿到我方 summonerId；
 * 2. 逐个查询召唤师资料；
 * 3. 查询段位；
 * 4. 组装 SummonerInfoList 给 teammateStore 使用。
 */
export const queryFriendInfo = async (
	islistenSession: boolean,
): Promise<{ list: SummonerInfoList[]; champId: number }> => {
	const summonerInfoList: SummonerInfoList[] = [];
	const summonerInfos = await queryAllSummonerId(islistenSession);

	if (summonerInfos === null) {
		return { list: [], champId: 0 };
	}

	for (const summonerId of summonerInfos.summonerIdList) {
		const currentSummonerInfo: summonerInfo | null =
			await fetchSummonerInfoWithRetry(summonerId);

		if (currentSummonerInfo === null) {
			continue;
		}
		const rankHandler = await querySummonerRank(currentSummonerInfo.puuid);

		summonerInfoList.push({
			name: currentSummonerInfo.name,
			summonerId: `${summonerId}`,
			puuid: currentSummonerInfo.puuid,
			imgUrl: currentSummonerInfo.imgUrl,
			rank: `${rankHandler[0]} • ${rankHandler[1]}`,
		});
	}
	return { list: summonerInfoList, champId: summonerInfos.champId };
};

/**
 * 查询召唤师信息，失败时最多重试 3 次。
 *
 * LCU 在选人阶段偶尔会短暂返回空数据，因此这里加轻量重试提高成功率。
 */
const fetchSummonerInfoWithRetry = async (
	summonerId: number,
	maxAttempts = 3,
): Promise<summonerInfo | null> => {
	for (let attempts = 0; attempts < maxAttempts; attempts++) {
		const info = (await querySummonerInfo(summonerId)) as summonerInfo;
		if (info) return info;
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	return null;
};

/**
 * 分析某个玩家近期战绩中最常使用的英雄和角色分布。
 *
 * 返回：
 * - top3Champions：出现次数最多的 3 个英雄；
 * - totalChampions：统计总局数；
 * - roleCountMap：刺客/战士/法师等角色出现次数；
 * - oneGameId：第一局 gameId，通常用于跳转或进一步查询。
 */
export const findTopChamp = (
	match: SimpleMatchTypes[] | undefined | null,
): RencentDataAnalysisTypes | null => {
	if (match === undefined || match === null) {
		return null;
	}

	const oneGameId = match[0].gameId;
	const champIdCountMap = new Map<number, number>();
	const roleCountMap: RoleCountMapTypes = {
		assassin: 0,
		fighter: 0,
		mage: 0,
		marksman: 0,
		support: 0,
		tank: 0,
	};

	for (const champion of match) {
		const { champId } = champion;
		const role = champDict[champId].roles[0];
		// @ts-ignore
		roleCountMap[role] = roleCountMap[role] + 1;
		champIdCountMap.set(champId, (champIdCountMap.get(champId) || 0) + 1);
	}

	const totalChampions = match.length;

	// 按出现次数降序；次数相同则按原战绩顺序，保证结果稳定。
	const sortedChampIdCount = Array.from(champIdCountMap.entries()).sort((a, b) => {
		if (a[1] === b[1]) {
			const indexA = match.findIndex((c) => c.champId === a[0]);
			const indexB = match.findIndex((c) => c.champId === b[0]);
			return indexA - indexB;
		}

		return b[1] - a[1];
	});

	const top3Champions = sortedChampIdCount.slice(0, 3).map((entry) => {
		const [champId, count] = entry;
		return {
			champId,
			count,
		};
	});
	return { top3Champions, totalChampions, roleCountMap, oneGameId };
};

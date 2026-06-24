import { englishToChinese } from "@/lcu/utils";
import { aliasToId, champDict } from "@/resources/champList";
import { invokeLcu } from "@/lcu";
import {
	RecentSumInfo,
	SessionTypes,
	TeamData,
	SuperChampTypes,
} from "@/recentMatch/utils/queryTypes";

/**
 * recentMatchWindow 使用的召唤师信息查询类。
 *
 * 它负责从当前 LCU gameflow session 中读取双方队伍，
 * 然后补充每个玩家的段位、英雄熟练度/绝活标签、英雄头像等信息。
 */
class QuerySummoner {
	/** 当前游戏会话数据，来自 /lol-gameflow/v1/session。 */
	public matchSession: null | SessionTypes = null;
	/** 当前登录玩家的 summonerId。 */
	public currentId: number = 0;
	/** 当前对局 queueId。 */
	public queueId: number = 0;

	/** 初始化当前对局 session、queueId 和当前玩家 ID。 */
	public init = async () => {
		try {
			this.matchSession = (await invokeLcu(
				"get",
				"/lol-gameflow/v1/session",
			)) as SessionTypes;
			this.queueId = this.matchSession.gameData.queue.id;
		} catch (_e) {
			this.matchSession = null;
			this.queueId = 0;
			return;
		}
		this.currentId = JSON.parse(localStorage.getItem("sumInfo") as string).summonerId;
	};

	/**
	 * 通过 LCU 查询并整理双方队伍数据。
	 *
	 * 返回时保证 friendList 是我方，enemyList 是敌方，避免 UI 层再判断 teamOne/teamTwo。
	 */
	public fromLcuQuery = async () => {
		await this.init();
		if (this.matchSession === null) {
			return null;
		}
		const isTeamOne =
			this.matchSession.gameData.teamOne.find(
				(i: TeamData) => i.summonerId === this.currentId,
			) !== undefined
				? true
				: false;
		const [friendList, enemyList] = await Promise.all([
			isTeamOne === true
				? await this.simplifySummonerInfo(this.matchSession.gameData.teamOne)
				: await this.simplifySummonerInfo(this.matchSession.gameData.teamTwo),
			isTeamOne === true
				? await this.simplifySummonerInfo(this.matchSession.gameData.teamTwo)
				: await this.simplifySummonerInfo(this.matchSession.gameData.teamOne),
		]);
		return { friendList, enemyList, queueId: this.queueId };
	};

	/** 根据 championId 获取英雄 alias，用于拼接头像 URL。 */
	public getIconAlias = (summoner: TeamData) => {
		if (summoner.championId !== undefined) {
			return champDict[summoner.championId].alias;
		}
		return "";
		// return  champDict[this.playerChampionSelections[(summoner.summonerName.toLowerCase())]].alias
	};

	/**
	 * 将 LCU TeamData 转换成 recentMatchWindow 使用的 RecentSumInfo。
	 *
	 * 每个玩家会额外查询：
	 * - 当前英雄熟练度/绝活状态；
	 * - 段位信息。
	 */
	public simplifySummonerInfo = async (summonerList: TeamData[]) => {
		try {
			const promisesList: Promise<RecentSumInfo>[] = summonerList.map(
				async (summoner: TeamData) => {
					const iconAlias = this.getIconAlias(summoner);
					const summonerState = await this.querySummonerSuperChampData(
						summoner.puuid,
						iconAlias,
					);
					const rankPoint = await this.queryRankPoint(summoner.puuid);
					return <RecentSumInfo>{
						matchList: [],
						rankPoint: rankPoint,
						summonerState: summonerState,
						summonerId: summoner.summonerId,
						puuid: summoner.puuid,
						summonerName: summoner.summonerName,
						teamParticipantId: summoner.teamParticipantId,
						champId: summoner.championId,
						championUrl: `https://game.gtimg.cn/images/lol/act/img/champion/${iconAlias}.png`,
					};
				},
			);

			const reSumInfoList = await Promise.all(promisesList);
			// 按 teamParticipantId 排序，让 UI 中的位置顺序更稳定。
			return reSumInfoList.sort((x: RecentSumInfo, y: RecentSumInfo) => {
				return x.teamParticipantId - y.teamParticipantId;
			});
		} catch (_e) {
			return [] as RecentSumInfo[];
		}
	};

	/**
	 * 查询单双排和灵活段位。
	 *
	 * 内部做了轻量重试，因为 LCU 在游戏加载阶段可能短暂不可用。
	 */
	public queryRankPoint = async (puuid: string): Promise<string[]> => {
		const fetchRankDataWithRetry = async (retries = 2): Promise<any> => {
			for (let attempt = 0; attempt <= retries; attempt++) {
				try {
					const res = await invokeLcu(
						"get",
						`/lol-ranked/v1/ranked-stats/${puuid}`,
					);
					if (res !== null) return res;
					await new Promise((resolve) => setTimeout(resolve, 300));
				} catch (error) {
					console.warn(`Attempt ${attempt + 1} failed:`, error);
				}
			}
			return null;
		};

		const res = await fetchRankDataWithRetry();

		if (res === null) {
			return ["error", "error"];
		}

		const rankData = res.queueMap;
		return ["RANKED_SOLO_5x5", "RANKED_FLEX_SR"].reduce(
			(acc: string[], queueType: string) => {
				const tier =
					rankData[queueType]?.tier === ""
						? "未定级"
						: englishToChinese(rankData[queueType].tier);
				const division =
					rankData[queueType]?.division === "NA"
						? ""
						: rankData[queueType]?.division || "";
				acc.push(tier !== "未定级" ? `${tier}${division}` : "未定级");
				return acc;
			},
			[],
		);
	};

	/**
	 * 获取召唤师当前英雄的熟练度/绝活状态。
	 *
	 * 标签含义：
	 * - Z：正常；
	 * - B：当前英雄在熟练度前 4-6 名，可认为比较熟练；
	 * - Y：未知，需要结合近期战绩进一步判断；
	 * - S：后续由战绩逻辑判断为疑似小代/强势玩家。
	 */
	public querySummonerSuperChampData = async (puuid: string, champAlias: string) => {
		const champId = aliasToId[champAlias];
		const curChampMark = { lv: -1, score: -1 };

		const superList: SuperChampTypes[] | null = await invokeLcu(
			"get",
			`/lol-champion-mastery/v1/${puuid}/champion-mastery`,
		);

		if (!superList) {
			return { label: "Z", lv: curChampMark.lv, score: curChampMark.score };
		}

		const curChamp = superList.find(
			(val: SuperChampTypes) => val.championId === champId,
		);
		if (curChamp) {
			curChampMark.lv = curChamp.championLevel;
			curChampMark.score = curChamp.championPoints;
		}

		const top6List = superList.slice(0, 6);
		const champIndex = top6List.findIndex(
			(val: SuperChampTypes) => val.championId === champId,
		);

		if (champIndex !== -1) {
			return {
				label: champIndex < 3 ? "Z" : "B",
				lv: curChampMark.lv,
				score: curChampMark.score,
			};
		}

		return { label: "Y", lv: curChampMark.lv, score: curChampMark.score };
	};
}

export default QuerySummoner;

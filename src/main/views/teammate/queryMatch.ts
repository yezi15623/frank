import { queryMatchHistory } from "@/lcu/aboutMatch";
import { Games, SimpleMatchTypes } from "@/lcu/types/queryMatchLcuTypes";
import { champDict } from "@/resources/champList";
import { querySummonerPosition } from "@/lcu/utils";
import { GamesBySgp } from "@/lcu/types/queryMatchSgpGameTypes";

/**
 * 队友近期战绩查询与转换类。
 *
 * 这个类把 LCU/SGP 返回的复杂战绩对象压缩成 SimpleMatchTypes，
 * 供队友页、对局分析窗口、游戏内战绩窗口展示。
 */
export class QueryMatch {
	/** 时间戳转换为 MM-DD。 */
	public timestampToDate = (timestamp: number) => {
		const date = new Date(timestamp);
		return (
			(date.getMonth() + 1 < 10
				? "0" + (date.getMonth() + 1)
				: date.getMonth() + 1) +
			"-" +
			(date.getDate() < 10 ? "0" + date.getDate() : date.getDate())
		);
	};

	/** queueId 转中文模式名。 */
	public queryGameType = (queueId: number) => {
		switch (queueId) {
			case 420:
				return "单双";
			case 430:
				return "匹配";
			case 440:
				return "灵活";
			case 450:
				return "极地";
			case 2400:
				return "海斗";
			case 1700:
				return "斗魂";
			case 1900:
				return "无限";
		}
		return "其它";
	};

	/**
	 * 将一局原始战绩转换成页面用的简化结构。
	 *
	 * match 可能来自两种数据格式：
	 * - LCU：战斗统计在 participants[0].stats 中；
	 * - SGP：战斗统计直接在 participants[0] 中。
	 * 所以这里用 "stats" in p0 做兼容。
	 */
	public getSimpleMatch = (match: Games | GamesBySgp): SimpleMatchTypes => {
		const p0 = match.participants[0];
		const statsSource = "stats" in p0 ? p0.stats : p0;

		const {
			kills,
			deaths,
			assists,
			win,
			champLevel,
			item0,
			item1,
			item2,
			item3,
			item4,
			item5,
			item6,
		} = statsSource;

		const { championId, spell1Id, spell2Id } = p0;

		// deaths=0 时避免除零，直接使用 kills+assists 作为 KDA。
		const kda =
			deaths === 0 ? kills + assists : Math.round(((kills + assists) / deaths) * 3);

		const rawLane = "timeline" in p0 ? p0.timeline.lane : (p0 as any).lane;
		const champAlias = champDict[String(championId)]?.alias || "unknown";

		return {
			gameId: match.gameId,
			queueId: match.queueId,
			champId: championId,
			champImgUrl: `${champAlias}.png`,
			isWin: !!win,
			kills,
			deaths,
			assists,
			kda,
			matchTime: this.timestampToDate(match.gameCreation),
			gameModel: this.queryGameType(match.queueId),
			spell1Id: spell1Id,
			spell2Id: spell2Id,
			itemList: [item0, item1, item2, item3, item4, item5, item6],
			lane: querySummonerPosition(rawLane),
			level: champLevel,
		};
	};

	/**
	 * 查询指定范围内的战绩并转换为 SimpleMatchTypes。
	 */
	public dealMatchHistory = async (
		puuid: string,
		begIndex: number,
		endIndex: number,
	): Promise<SimpleMatchTypes[] | null> => {
		const matchList = await queryMatchHistory(puuid, begIndex, endIndex);
		if (matchList === null) {
			return null;
		}

		return matchList.map((matchListElement) => {
			return this.getSimpleMatch(matchListElement);
		});
	};

	/**
	 * 从近期战绩中筛选指定 queueId 的战绩。
	 *
	 * 如果前 20 局不足 10 条指定模式战绩，会继续查询 20-40 局补齐。
	 */
	public querySpecialMatch = async (
		puuid: string,
		matchHis20: SimpleMatchTypes[],
		queueId: number,
	) => {
		const specialList = matchHis20
			.filter((matchList) => matchList.queueId === queueId)
			.slice(0, 10);
		const speListLen = specialList.length;

		if (speListLen === 10 || matchHis20.length < 20) {
			return specialList;
		} else {
			const matchHis40 = await this.dealMatchHistory(puuid, 20, 40);
			if (matchHis40 === null) {
				return specialList;
			}
			return [
				...specialList,
				...matchHis40
					.filter((matchList) => matchList.queueId === queueId)
					.slice(0, 10 - speListLen),
			];
		}
	};

	/** 获取近期战绩；重新获取时只查 10 局，首次缓存时查 20 局。 */
	public getMatchHis = async (puuid: string, isReGet: boolean) => {
		if (isReGet) {
			return await this.dealMatchHistory(puuid, 0, 10);
		}
		return await this.dealMatchHistory(puuid, 0, 20);
	};

	/** 获取指定模式战绩。 */
	public getSpecialMatchHis = async (
		puuid: string,
		matchHis20: SimpleMatchTypes[],
		queueId: number,
	) => {
		return await this.querySpecialMatch(puuid, matchHis20, queueId);
	};
}

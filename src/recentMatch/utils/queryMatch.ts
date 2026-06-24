import { MatchItemTypes } from "@/recentMatch/utils/queryTypes";
import { champDict } from "@/resources/champList";
import { queryMatchHistory } from "@/lcu/aboutMatch";
import { Games } from "@/lcu/types/queryMatchLcuTypes";
import { GamesBySgp } from "@/lcu/types/queryMatchSgpGameTypes";

/**
 * recentMatchWindow 使用的战绩查询工具。
 *
 * 这个类和 main/views/teammate/queryMatch.ts 的职责接近，
 * 但这里返回的是游戏内窗口需要的 MatchItemTypes：更偏向头像、胜负、KDA 的紧凑展示。
 */
class QueryMatch {
	/** 当前查询过程中统计到的胜场数。每次 queryMatchHistory 结束后会清零。 */
	public winCount = 0;

	/**
	 * 查询某个玩家近期战绩。
	 *
	 * @param puuid 召唤师 PUUID
	 * @param queueId 当前对局队列 ID；单双/灵活会优先查同模式战绩
	 * @param summonerState 绝活/小代初始标签，用于进一步判断是否优秀玩家
	 * @returns [战绩列表, 胜场数, 是否疑似优秀/小代]
	 */
	public queryMatchHistory = async (
		puuid: string,
		queueId: number,
		summonerState: string,
	): Promise<[MatchItemTypes[], number, boolean]> => {
		try {
			let matchList: MatchItemTypes[] = [];

			if (queueId === 420 || queueId === 440) {
				matchList = await this.findSpecialMatch(puuid, queueId);
			} else {
				matchList = await this.findMatch(puuid);
			}

			// 按 gameId 去重，避免不同数据源或分页导致重复对局。
			const uniqueMatches = matchList.reduce((acc: MatchItemTypes[], current) => {
				if (!acc.some((match) => match.gameId === current.gameId)) {
					acc.push(current);
				}
				return acc;
			}, []);

			const winCount = matchList.length > 0 ? this.winCount : 0;
			const isExcel = this.isExcelPlayer(summonerState, uniqueMatches);

			this.winCount = 0;

			return [uniqueMatches, winCount, isExcel];
		} catch (error) {
			console.error("Error in queryMatchHistory:", error);
			return [[], 0, false];
		}
	};

	/**
	 * 将原始对局数据转换成 recentMatchWindow 的紧凑展示结构。
	 *
	 * 同时兼容 LCU 和 SGP 两种返回结构：LCU 的 stats 嵌套在 p0.stats，SGP 直接放在 p0。
	 */
	public parseMatch = (games: Games | GamesBySgp): MatchItemTypes => {
		const p0 = games.participants[0];
		const statsSource = "stats" in p0 ? p0.stats : p0;
		const { win, kills, deaths, assists } = statsSource;
		const { championId } = p0;

		if (win) {
			this.winCount++;
		}

		const champAlias = champDict[String(championId)]?.alias || "Unknown";

		return {
			champImg: `https://game.gtimg.cn/images/lol/act/img/champion/${champAlias}.png`,
			kills,
			deaths,
			assists,
			isWin: !!win,
			gameId: games.gameId,
			queueId: games.queueId,
		};
	};

	/**
	 * 判断“未知状态 Y”的玩家是否可能是优秀玩家/小代。
	 *
	 * 当前规则：最近 5 局中至少 3 局 KDA >= 12。
	 */
	public isExcelPlayer = (summonerState: string, matchList: MatchItemTypes[]) => {
		if (summonerState !== "Y") {
			return false;
		}
		let excellentCount = 0;
		for (let match of matchList.slice(0, 5)) {
			const kda =
				match.deaths === 0
					? (match.kills + match.assists) * 2
					: ((match.kills + match.assists) / match.deaths) * 3;
			if (kda >= 12) {
				excellentCount += 1;
			}
		}
		return excellentCount >= 3;
	};

	/** 查询最近 10 局任意模式战绩。 */
	public findMatch = async (puuid: string): Promise<MatchItemTypes[]> => {
		const matchList = await queryMatchHistory(puuid, 0, 10);
		if (matchList !== null) {
			return matchList.map((games) => this.parseMatch(games));
		} else {
			return [];
		}
	};

	/**
	 * 查询指定模式的最近战绩。
	 *
	 * 最多查 30 局，每次 10 局，直到收集到 10 条指定 queueId 的记录。
	 * 如果完全没有同模式记录，则回退到最近 10 局任意模式。
	 */
	public findSpecialMatch = async (
		puuid: string,
		queueId: number,
	): Promise<MatchItemTypes[]> => {
		const latestMatch = await queryMatchHistory(puuid, 0, 10);
		const specialList: MatchItemTypes[] = [];

		let offset = 0;
		while (offset < 30) {
			const matchHistory =
				offset === 0 ? latestMatch : await queryMatchHistory(puuid, offset, offset + 10);
			if (!matchHistory || matchHistory.length === 0) {
				break;
			}
			const filterMatch = matchHistory.filter((games) => queueId === games.queueId);

			for (const game of filterMatch) {
				specialList.push(this.parseMatch(game));
				if (specialList.length === 10) {
					return specialList;
				}
			}

			offset += 10;
		}
		if (specialList.length === 0 && latestMatch !== null) {
			return latestMatch.map((games) => this.parseMatch(games));
		} else return specialList;
	};
}

export default QueryMatch;

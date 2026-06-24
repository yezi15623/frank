import { defineStore } from "pinia";
import { SummonerInfoList } from "@/main/views/teammate/teammateTypes";
import { SimpleMatchTypes } from "@/lcu/types/queryMatchLcuTypes";
import { QueryMatch } from "@/main/views/teammate/queryMatch";
import { queryMasteryChampList } from "@/lcu/aboutSummoner";
import {
	Hater,
	HaterItem,
	BlackItemsTypes,
} from "@/main/views/record/blackListTypes";
import { window } from "@tauri-apps/api";
import { emitTo } from "@tauri-apps/api/event";

// 队友近期战绩查询封装。
const useMatch = new QueryMatch();

/**
 * 队友页面 Store。
 *
 * 主要职责：
 * - 保存选人阶段的队友列表；
 * - 查询每个队友的近期战绩；
 * - 为游戏内/分析窗口缓存战绩数据；
 * - 在战绩查询失败时，用英雄熟练度数据兜底；
 * - 合并黑名单/被标记玩家信息。
 */
export const useTeammateStore = defineStore("useTeammate", {
	state: () => {
		return {
			/** 选人阶段队友基础信息。 */
			summonerInfo: [] as SummonerInfoList[],
			/** 每个队友的近期战绩列表。二维数组：外层按队友，内层按对局。 */
			recentMatchList: [] as SimpleMatchTypes[][],
			/** 以 summonerId 为 key 的缓存战绩，供其他窗口通过事件读取。 */
			cacheMatchList: {} as { [key: string]: SimpleMatchTypes[] },
			/** 当战绩查询失败时，用英雄熟练度列表兜底。 */
			masteryChampList: [] as string[][][],
			/** 黑名单/标记内容，按队友分组。 */
			blackItems: [] as BlackItemsTypes[][],
			/** LCU 或战绩查询是否出错。 */
			isLcuErr: false,
			/** 缓存状态：0=未开始，1=成功，-1=失败或降级。 */
			isCacheSuccess: 0,
			/** 当前队列 ID。 */
			queueId: 0,
			/** 原始黑名单数据，reInit 时会复用。 */
			blacklist: null as Hater[] | null,
		};
	},
	actions: {
		/**
		 * 初始化队友页面数据。
		 *
		 * @param summonerInfo 队友基础信息
		 * @param queueId 当前队列 ID
		 * @param blacklist 当前队友命中的黑名单数据
		 * @param isReGet 是否为重新获取。重新获取时不重复缓存。
		 */
		async initStore(
			summonerInfo: SummonerInfoList[],
			queueId: number,
			blacklist: Hater[] | null,
			isReGet: boolean,
		) {
			if (this.summonerInfo.length !== 0) {
				this.$reset();
			}
			this.summonerInfo = summonerInfo;
			this.queueId = queueId;
			await this.getMatchList(summonerInfo, isReGet);
			if (!isReGet) {
				await this.cacheMatchRecord(summonerInfo, queueId);
			}
			this.updateBlacklist(blacklist);
		},

		/**
		 * 逐个查询队友近期战绩。
		 *
		 * 如果任意队友战绩查询失败，就降级为英雄熟练度数据。
		 */
		async getMatchList(summonerInfo: SummonerInfoList[], isReGet: boolean) {
			for (const [index, summoner] of summonerInfo.entries()) {
				const matchList = await useMatch.getMatchHis(summoner.puuid, isReGet);
				if (matchList === null) {
					this.recentMatchList = [];
					this.summonerInfo = summonerInfo;
					this.getMatchListFromChamp(summonerInfo);
					return;
				} else {
					// 计算最近 6 局平均 KDA，用于队友页快速判断近期状态。
					this.summonerInfo[index].kda = this.calculateAverageKDA(matchList);
					this.recentMatchList.push(matchList);
				}
			}
		},

		/**
		 * 战绩获取失败时的降级方案：查询英雄熟练度列表。
		 */
		async getMatchListFromChamp(summonerInfo: SummonerInfoList[]) {
			for (const summoner of summonerInfo) {
				const list = await queryMasteryChampList(summoner.puuid);
				this.masteryChampList.push(list || []);
			}
			this.isLcuErr = true;
			this.isCacheSuccess = -1;
		},

		/**
		 * 缓存队友战绩数据，供 recentMatchWindow / matchAnalysisWindow 使用。
		 *
		 * 单双排/灵活组排时会优先过滤同队列战绩；其他模式直接取最近 10 局。
		 */
		async cacheMatchRecord(summonerInfo: SummonerInfoList[], queueId: number) {
			if (this.recentMatchList.length === 0) {
				return;
			}

			for (const [index, summoner] of summonerInfo.entries()) {
				const matchHis20: SimpleMatchTypes[] = JSON.parse(
					JSON.stringify(this.recentMatchList[index]),
				);

				if (queueId === 420 || queueId === 440) {
					const matchList = await useMatch.getSpecialMatchHis(
						summoner.puuid,
						matchHis20,
						queueId,
					);
					const cacheList =
						matchList.length === 0 ? matchHis20.slice(0, 10) : matchList;
					this.cacheMatchList[summoner.summonerId] = cacheList;
				} else {
					this.cacheMatchList[summoner.summonerId] = matchHis20.slice(0, 10);
				}
			}
			this.isCacheSuccess = 1;
		},

		/** 计算最近 6 局平均 KDA。 */
		calculateAverageKDA(statsArray: SimpleMatchTypes[]) {
			const firstSixStats = statsArray.slice(0, 6);

			const sumKDA = firstSixStats.reduce((sum, stats) => sum + stats.kda, 0);
			const averageKDA = sumKDA / firstSixStats.length;
			return averageKDA.toFixed(1);
		},

		/**
		 * 把黑名单数据合并到队友展示数据中。
		 */
		addBlackList(blacklist: Hater[]) {
			for (const [index, hater] of blacklist.entries()) {
				const hInfo = { name: hater.nickName, sumId: hater.sumId };
				if (hater.blacklist.length === 0) {
					continue;
				}
				const tempList: BlackItemsTypes[] = [];
				const hContent: HaterItem = hater.blacklist[0];
				for (const hContent of hater.blacklist) {
					tempList.push({
						hInfo: hInfo,
						hContent: hContent,
					});
				}
				this.blackItems.push(tempList);

				const haterSum = this.summonerInfo.find(
					(sum) => sum.summonerId === hInfo.sumId,
				);
				// 给队友对象动态挂载 hater/haterIndex 字段，页面用它显示标记状态。
				// @ts-ignore
				haterSum["hater"] = hContent.isShow;
				// @ts-ignore
				haterSum["haterIndex"] = index;
			}
		},

		/** 重新获取队友数据。 */
		reInit() {
			this.initStore(this.summonerInfo, this.queueId, this.blacklist, true);
		},

		/**
		 * 更新黑名单状态，并在只有一个被标记玩家时通知主窗口弹出提示。
		 */
		async updateBlacklist(blacklist: Hater[] | null) {
			if (!blacklist) return;

			this.blacklist = blacklist;

			// 延迟执行，等待队友列表和 UI 状态先完成初始化。
			await new Promise((resolve) => setTimeout(resolve, 500));

			this.addBlackList(blacklist);

			if (blacklist.length === 1) {
				const mainWindow = await window.Window.getByLabel("mainWindow");
				if (mainWindow) {
					emitTo("mainWindow", "blacklist-team", true);
				}
			}
		},
	},
});

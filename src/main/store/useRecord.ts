import { defineStore } from "pinia";
import {
	BlacklistPlanbTypes,
	Hater,
	ParticipantsInfoPlanB,
	UserInfos,
} from "@/main/views/record/blackListTypes";
import BlackList from "@/main/views/record/blackList";
import MatchDetails from "@/queryMatch/utils/matchDetails";
import { ParticipantsInfo } from "@/queryMatch/utils/MatchDetail";
import { invokeLcu } from "@/lcu";
import { SessionTypes, TeamData } from "@/recentMatch/utils/queryTypes";
import { sumInfoTypes } from "@/background/types";
import { champDict } from "@/resources/champList";

// 黑名单服务封装。
const blackList = new BlackList();
// 对局详情查询封装。
const matchDetail = new MatchDetails();

/**
 * 战绩/黑名单相关 Store。
 *
 * 主要职责：
 * - 查询本地玩家是否有黑名单数据；
 * - 选人阶段检查队友是否被标记；
 * - 对局结束后获取本局参与者信息；
 * - 当正式战绩接口失败时，使用 LCU session 数据构造 PlanB 数据。
 */
export const useRecordStore = defineStore("useRecordStore", {
	state: () => {
		return {
			/** 当前玩家相关的黑名单/吐槽数据。 */
			haterList: [] as Hater[] | null,
			/** 当前玩家的服务端用户信息。 */
			userInfos: null as UserInfos | null,
			/** 当前登录召唤师信息，通常来自 localStorage.sumInfo。 */
			localSumInfo: null as sumInfoTypes | null,
			/** 正式接口返回的本局参与者详情。 */
			participantsInfo: null as ParticipantsInfo | null,
			/** PlanB 构造出来的参与者信息，用于正式接口失败时兜底展示。 */
			participantsInfoPlanB: null as ParticipantsInfoPlanB | null,
			/** 是否显示对局结束弹窗/结果区域。 */
			showGameEnd: false,
		};
	},
	actions: {
		/**
		 * 初始化当前玩家黑名单数据。
		 */
		async init() {
			this.localSumInfo =
				this.localSumInfo ||
				(JSON.parse(localStorage.getItem("sumInfo") as string) as sumInfoTypes);

			const resBlack = await blackList.queryBlacklist(this.localSumInfo.puuid);

			if (resBlack === null) {
				this.haterList = null;
				return;
			}

			this.haterList = await blackList.querySumDetails(resBlack[0], true);
			this.userInfos = resBlack[1];
			// 检查服务端返回的 ID 数量和实际详情数量是否一致，不一致则同步修正。
			this.handleHaterVolume(resBlack[0]);
		},

		/**
		 * 检查黑名单数据量是否匹配。
		 *
		 * 如果服务端保存的 sumIdList 和实际能查到的详情数量不一致，
		 * 就把有效列表写回服务端，清理失效数据。
		 */
		handleHaterVolume(sumIdList: string[]) {
			if (this.haterList === null || sumIdList.length === 0) {
				return;
			}
			const validSumId = this.haterList.map((hater) => hater.sumId);
			if (validSumId.length !== sumIdList.length) {
				blackList.updateUserInfo(
					JSON.parse(JSON.stringify(this.userInfos)),
					validSumId,
				);
			}
		},

		/**
		 * 检查队友列表中是否存在被标记玩家。
		 */
		async checkFriSum(sumIdList: string[]) {
			const existSumDetails = await blackList.querySumDetails(sumIdList, false);
			if (existSumDetails === null || existSumDetails.length === 0) {
				return null;
			}
			return existSumDetails;
		},

		/**
		 * 获取本局参与者信息。
		 *
		 * @param addGameId 可选。如果从其他窗口指定了 gameId，就直接查询该 gameId；否则从当前 LCU session 读取。
		 */
		async getParticipantsInfo(addGameId?: number) {
			this.participantsInfo = null;
			this.participantsInfoPlanB = null;

			this.localSumInfo =
				this.localSumInfo ??
				(JSON.parse(localStorage.getItem("sumInfo") as string) as sumInfoTypes);

			const gameId =
				addGameId ??
				(await this.getGameIdFromSession(this.localSumInfo.summonerId));

			if (!gameId) {
				return null;
			}

			return this.executeAsyncWithRetry(
				gameId,
				this.localSumInfo.summonerId,
			).then((info) => {
				if (info !== null) {
					this.participantsInfo = info;
					this.showGameEnd = true;
					return true;
				} else {
					// 当前实现即使正式接口失败，也会显示结算区域，实际展示时可使用 participantsInfoPlanB 兜底。
					this.participantsInfo = info;
					this.showGameEnd = true;
					return true;
				}
			});
		},

		/**
		 * 从 LCU 当前 gameflow session 中读取 gameId。
		 * 同时提前构造 PlanB 数据，防止后续正式接口失败。
		 */
		async getGameIdFromSession(localSumId: number) {
			const session = (await invokeLcu(
				"get",
				"/lol-gameflow/v1/session",
			)) as SessionTypes;

			// 只处理地图 11/12，其他地图模式暂不支持本逻辑。
			if (session.map?.id !== 12 && session.map?.id !== 11) {
				return null;
			}
			this.executePlanB(session, localSumId);

			return session.gameData.gameId;
		},

		/**
		 * 带重试的对局详情查询。
		 *
		 * 对局刚结束时，正式战绩接口可能还没准备好，所以这里最多重试 4 次，每次间隔 500ms。
		 */
		async executeAsyncWithRetry(gameId: number, sumId: number) {
			let retryCount = 0;
			while (retryCount < 4) {
				const result = await matchDetail.queryGameDetail(gameId, sumId);
				if (result !== null) {
					return result;
				}
				await new Promise((resolve) => setTimeout(resolve, 500));
				retryCount++;
			}
			return null;
		},

		/**
		 * PlanB：当正式对局详情获取失败时，用 LCU session 中的 teamOne/teamTwo 构造基础展示数据。
		 */
		executePlanB(session: SessionTypes, localSumId: number) {
			const dftTeamOne = session.gameData.teamOne;
			const dftTeamTwo = session.gameData.teamTwo;
			const isTeamOne =
				dftTeamOne.find((v) => v.summonerId === localSumId) !== undefined;

			// 保证 teamOne 始终表示“我方队伍”，teamTwo 表示“敌方队伍”。
			const teamOne = isTeamOne
				? this.handleTeamData(dftTeamOne)
				: this.handleTeamData(dftTeamTwo);
			const teamTwo = isTeamOne
				? this.handleTeamData(dftTeamTwo)
				: this.handleTeamData(dftTeamOne);

			this.participantsInfoPlanB = {
				teamOne: teamOne,
				teamTwo: teamTwo,
				headerInfo: [],
				queueId: 420,
				gameId: session.gameData.gameId,
			};
		},

		/** 把 LCU TeamData 转换成黑名单/结算页面可展示的数据结构。 */
		handleTeamData(teamData: TeamData[]): BlacklistPlanbTypes[] {
			return teamData.map((player: TeamData) => {
				return {
					name: player.summonerName,
					accountId: player.summonerId,
					champImgUrl: `${champDict[player.championId].alias}.png`,
					score: "-1",
					iconList: [],
					isWin: false,
					isMvp: false,
				};
			});
		},
	},
});

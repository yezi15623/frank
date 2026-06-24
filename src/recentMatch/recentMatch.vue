<script setup lang="ts">
import { onMounted, ref, Ref } from "vue";
import QuerySummoner from "@/recentMatch/utils/querySummoner";
import Dashboard from "@/recentMatch/components/dashboard.vue";
import RecentMatchList from "@/recentMatch/components/recentMatchList.vue";
import {
	ChampInfoTypes,
	ChampTinyTypes,
	RecentAllSumInfo,
	RecentSumInfo,
} from "@/recentMatch/utils/queryTypes";
import QueryMatch from "@/recentMatch/utils/queryMatch";
import { SimpleMatchTypes } from "@/lcu/types/queryMatchLcuTypes";
import MatchContent from "@/queryMatch/common/matchContent.vue";
import MatchDetails from "@/queryMatch/utils/matchDetails";
import { ParticipantsInfo } from "@/queryMatch/utils/MatchDetail";
import { NDrawer, NResult } from "naive-ui";
import NullPage from "@/recentMatch/components/nullPage.vue";
import { emitTo, once } from "@tauri-apps/api/event";
import { window } from "@tauri-apps/api";
import ChampInfo from "@/recentMatch/components/champInfo.vue";
import { requestFetch } from "@/main/utils/request.ts";

/**
 * 游戏内近期战绩窗口主组件。
 *
 * 这个窗口由 background/gameFlow.ts 在游戏开始后创建，
 * 用于游戏内展示双方玩家近期战绩、胜场数、绝活状态，并支持查看单局详情。
 *
 * 它和 mainWindow 是两个独立 WebView，因此无法直接访问 mainWindow 的 Pinia Store，
 * 需要通过 Tauri event 向 mainWindow 请求 cacheMatchList。
 */
const querySummoner = new QuerySummoner();
const queryMatch = new QueryMatch();

/** 是否无法从 LCU 读取当前对局信息。 */
const isLcuErr = ref(true);
/** 我方列表。 */
const friendList: Ref<RecentSumInfo[]> = ref([]);
/** 敌方列表。 */
const enemyList: Ref<RecentSumInfo[]> = ref([]);
/** 我方最高熟练度/状态分，用于 UI 归一化展示。 */
const fScoreMax = ref(0);
/** 敌方最高熟练度/状态分。 */
const eScoreMax = ref(0);
/** 当前队列 ID。 */
const queueId: Ref<number> = ref(0);
/** 双方胜场统计：[胜场数, 总局数]。 */
const winCount = ref({ friend: [0, 0], enemy: [0, 0] });
/** 我方胜场是否大于等于敌方，用于顶部展示倾向。 */
const isFriCount = ref(true);

/** 当前查看详情的召唤师 ID。 */
const currentId = ref(0);
const matchDetials = new MatchDetails();
/** 是否打开详情抽屉。 */
const isDetailModal = ref(false);
/** 详情抽屉是否从左侧打开。 */
const isDetailModalLeft = ref(true);
/** 单局详情数据。 */
const participantsInfo: Ref<ParticipantsInfo | null> = ref(null);
/** 是否显示英雄技能详情，而不是单局战绩详情。 */
const isChampInfo = ref(false);
const champInfo: Ref<{ info: null | ChampTinyTypes; list: ChampInfoTypes[] }> = ref({
	info: null,
	list: [],
});

interface simpleMatchList {
	[key: string]: SimpleMatchTypes[];
}

/**
 * 接收 mainWindow 回传的队友战绩缓存。
 *
 * once 表示只监听一次：窗口初始化只需要拿一次缓存数据。
 */
once<simpleMatchList>("matchListCache", (res) => {
	init(res.payload);
});

onMounted(() => {
	// recentMatchWindow 创建后主动向 mainWindow 请求缓存。
	window.Window.getByLabel("mainWindow").then((win) => {
		if (win !== null) {
			emitTo("mainWindow", "cacheMatchList", "getMatchList");
		}
	});
});

/**
 * 初始化双方数据。
 *
 * simpleMatchList 是 mainWindow 预先缓存好的我方队友战绩。
 * 如果缓存为空，则我方和敌方都重新查询；
 * 如果缓存存在，则我方优先使用缓存，敌方仍实时查询。
 */
const init = (simpleMatchList: { [key: string]: SimpleMatchTypes[] }) => {
	querySummoner.fromLcuQuery().then(async (allSumInfo: RecentAllSumInfo | null) => {
		if (allSumInfo === null) {
			isLcuErr.value = true;
			return;
		}

		isLcuErr.value = false;
		queueId.value = allSumInfo.queueId;
		if (Object.keys(simpleMatchList).length === 0) {
			await Promise.all([
				getCompleteSumInfo(allSumInfo.friendList, allSumInfo.queueId, true),
				getCompleteSumInfo(allSumInfo.enemyList, allSumInfo.queueId, false),
			]);
		} else {
			await Promise.all([
				getSumInfoFromCache(allSumInfo.friendList, simpleMatchList, allSumInfo.queueId),
				getCompleteSumInfo(allSumInfo.enemyList, allSumInfo.queueId, false),
			]);
		}
		isFriCount.value = winCount.value.friend[0] >= winCount.value.enemy[0];
		fScoreMax.value = getMaxSummonerStateScore(friendList.value);
		eScoreMax.value = getMaxSummonerStateScore(enemyList.value);
	});
};

/**
 * 完整查询某一方玩家的近期战绩。
 */
const getCompleteSumInfo = async (
	sumInfos: RecentSumInfo[],
	queueId: number,
	isFri: boolean,
) => {
	for (const summoner of sumInfos) {
		const resultList = await queryMatch.queryMatchHistory(
			summoner.puuid,
			queueId,
			summoner.summonerState.label,
		);
		summoner.matchList = resultList[0];
		// Y 表示“未知状态”，需要结合近期战绩判断是 S 小代/强势玩家，还是 Z 正常。
		if (summoner.summonerState.label === "Y" && resultList[2]) {
			summoner.summonerState.label = "S";
		} else if (summoner.summonerState.label === "Y") {
			summoner.summonerState.label = "Z";
		}

		const targetList = isFri ? friendList.value : enemyList.value;
		const countList = isFri ? winCount.value.friend : winCount.value.enemy;

		countList[0] += resultList[1];
		countList[1] += resultList[0].length;
		targetList.push(summoner);
		// 轻微延迟，让 UI 逐步加载，避免瞬时大量请求压垮 LCU。
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
};

/**
 * 从 mainWindow 缓存中读取我方队友战绩。
 *
 * 如果缓存读取失败，会降级为完整查询。
 */
const getSumInfoFromCache = async (
	sumInfos: RecentSumInfo[],
	simpleMatchList: { [key: string]: SimpleMatchTypes[] },
	queueId: number,
) => {
	try {
		for (const sumInfo of sumInfos) {
			let winMatchCount = 0;
			const matchListElement = simpleMatchList[String(sumInfo.summonerId)].map((match) => {
				winMatchCount = match.isWin ? winMatchCount + 1 : winMatchCount;
				return {
					champImg: `https://game.gtimg.cn/images/lol/act/img/champion/${match.champImgUrl}`,
					kills: match.kills,
					deaths: match.deaths,
					assists: match.assists,
					isWin: match.isWin,
					gameId: match.gameId,
					queueId: match.queueId,
				};
			});
			if (
				sumInfo.summonerState.label === "Y" &&
				queryMatch.isExcelPlayer(sumInfo.summonerState.label, matchListElement)
			) {
				sumInfo.summonerState.label = "S";
			} else if (sumInfo.summonerState.label === "Y") {
				sumInfo.summonerState.label = "Z";
			}
			sumInfo.matchList = matchListElement;
			friendList.value.push(sumInfo);
			winCount.value.friend[0] += winMatchCount;
			winCount.value.friend[1] += matchListElement.length;
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	} catch (_e) {
		friendList.value = [];
		winCount.value.friend[0] = 0;
		winCount.value.friend[1] = 0;
		await getCompleteSumInfo(sumInfos, queueId, true);
	}
};

/**
 * 打开详情抽屉。
 *
 * 特殊约定：gameId=0 且 summonerId=0 表示打开英雄技能详情，而不是单局详情。
 */
const openDetailDrawer = async (
	gameId: number,
	summonerId: number,
	isFri: boolean,
	champId: number,
) => {
	isDetailModalLeft.value = isFri;
	if (gameId === 0 && summonerId === 0) {
		isChampInfo.value = true;
		isDetailModal.value = true;
		await getChampInfoList(champId);
		return;
	}

	const matchInfo = await matchDetials.queryGameDetail(gameId, summonerId);
	if (matchInfo !== null) {
		currentId.value = summonerId;
		participantsInfo.value = matchInfo;
	}
	isDetailModal.value = true;
};

/** 获取英雄技能/被动信息，用于英雄详情抽屉。 */
const getChampInfoList = async (champId: number) => {
	try {
		const url = `https://game.gtimg.cn/images/lol/act/img/js/hero/${champId}.js?ts=2893692`;
		const res = await requestFetch<any>(url, "GET");
		if (res !== null && res?.spells) {
			const info: ChampTinyTypes = {
				name: res.hero.name + " " + res.hero.title,
				alias: `https://game.gtimg.cn/images/lol/act/img/champion/${res.hero.alias}.png`,
				roles: res.hero.roles,
			};
			champInfo.value.info = info;
			const order = ["q", "w", "e", "r", "passive"];
			champInfo.value.list = res.spells.sort((a: any, b: any) => {
				return order.indexOf(a.spellKey) - order.indexOf(b.spellKey);
			});
		}
	} catch (error) {
		console.error(error);
	}
};

/** 获取列表中最高的状态分，用于子组件做比例展示。 */
const getMaxSummonerStateScore = (recentSumInfoList: RecentSumInfo[]): number => {
	if (!recentSumInfoList || recentSumInfoList.length === 0) {
		return 0;
	}

	return recentSumInfoList.reduce((maxScore, current) => {
		return Math.max(maxScore, current.summonerState.score);
	}, 0);
};
</script>

<template>
	<div class="main bg-neutral-100 dark:bg-neutral-900">
		<dashboard :win-count="winCount" :is-fri-count="isFriCount" :queue-id="queueId" />

		<null-page v-if="isLcuErr" />

		<div v-else class="flex justify-between">
			<recent-match-list
				@show-detail="openDetailDrawer"
				:max-score="fScoreMax"
				:sum-list="friendList"
				:queue-id="queueId"
				:is-fri="true"
			/>
			<recent-match-list
				@show-detail="openDetailDrawer"
				:max-score="eScoreMax"
				:sum-list="enemyList"
				:queue-id="queueId"
				:is-fri="false"
			/>
		</div>
	</div>

	<n-drawer
		style="border-radius: 0.5rem"
		v-model:show="isDetailModal"
		:placement="!isDetailModalLeft ? 'left' : 'right'"
		:auto-focus="false"
		:on-after-leave="
			() => {
				isChampInfo = false;
				champInfo = { info: null, list: [] };
			}
		"
		width="632px"
	>
		<div
			class="bg-white text-neutral-900 p-3 h-full box-border rounded-lg dark:bg-zinc-900 dark:text-neutral-200"
		>
			<champ-info
				v-if="isChampInfo"
				:champ-info-list="champInfo.list"
				:champ-tiny="champInfo.info"
			/>

			<match-content
				v-else-if="participantsInfo !== null"
				:header-info="participantsInfo.headerInfo"
				:team-one="participantsInfo.teamOne"
				:team-two="participantsInfo.teamTwo"
				:queue-id="participantsInfo.queueId"
				:summoner-id="currentId"
				:is-game-in="true"
				:game-id="participantsInfo.gameId"
			/>
			<div
				class="w-full h-full flex justify-center items-center"
				v-else-if="!isChampInfo && participantsInfo === null"
			>
				<n-result
					size="large"
					status="418"
					title="获取当前战绩数据异常"
					description="请切换其它战绩, 尝试再次获取数据..."
				>
				</n-result>
			</div>
		</div>
	</n-drawer>
</template>

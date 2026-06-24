<script setup lang="ts">
import {
	NCard,
	NAvatar,
	NProgress,
	NSpace,
	NTag,
	NDivider,
	NList,
	NListItem,
	NButton,
	NEllipsis,
	NModal,
} from "naive-ui";
import { getCurrentSummonerAllInfo } from "./getHomeData";
import { onActivated, onMounted, reactive, ref } from "vue";
import {
	SummonerData,
	sumInfoTypes,
	summonerInfo,
	TaskTrackerTypes,
} from "@/lcu/types/SummonerTypes";
import StartGame from "./startGame.vue";
import { useRecordStore } from "@/main/store/useRecord";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import SummonerMasteryChamp from "@/main/common/summonerMasteryChamp.vue";
import { QueryMatchWindow } from "@/background/utils/creatWindow.ts";
import Sponsor from "@/main/common/sponsor.vue";
import CheckMode from "./checkMode.vue";
import { TencentRsoPlatformId } from "@/resources/areaList";

/**
 * 首页主组件。
 *
 * 主要职责：
 * - 检测 LOL 客户端是否已启动；
 * - 获取当前召唤师基础信息、段位、荣誉和英雄熟练度；
 * - 写入 localStorage.sumInfo，供队友页、战绩页、recentMatchWindow 使用；
 * - 初始化 recordStore 的排位笔记/黑名单数据；
 * - 客户端未启动时显示 StartGame 启动页。
 */
const summonerData: SummonerData = reactive({
	summonerInfo: null,
	rankList: null,
	champLevel: null,
});
const recordStore = useRecordStore();
const taskCompleted = ref(false);
const curRegion = ref<string | null>(null);

onMounted(() => {
	// 先从 Rust 侧读取当前 LOL 客户端区服。成功说明客户端已运行且 LCU 可用。
	invoke<string>("get_lol_region")
		.then((region) => {
			curRegion.value = region;
			init(true);
		})
		.catch((_err) => {
			// 客户端未启动时，等待 background 发出 initHome 事件后再初始化首页。
			onClientLaunch();
		});
});

onActivated(() => {
	// keep-alive 重新激活首页时，如果已有召唤师数据，则刷新一次非首屏数据。
	if (summonerData.summonerInfo !== null) {
		init(false);
	}
});

/**
 * 初始化首页数据。
 *
 * isFirst=true 时会额外写入 sumInfo 并检查任务计数。
 */
const init = async (isFirst: boolean) => {
	const summonerAllInfo = await getCurrentSummonerAllInfo();
	if (summonerAllInfo === null) {
		return false;
	}
	if (isFirst) {
		await writeSumInfo(summonerAllInfo.summonerInfo);
		taskCheck();
	}

	summonerData.summonerInfo = summonerAllInfo.summonerInfo;
	summonerData.rankList = summonerAllInfo.rankList as string[];
	summonerData.champLevel = summonerAllInfo.champLevel as string[][];

	return true;
};

/**
 * 写入当前召唤师信息。
 *
 * localStorage.sumInfo 是后续多个模块的关键共享数据：
 * - recordStore 查询黑名单；
 * - recentMatch 判断我方/敌方；
 * - 对局结束添加笔记时获取平台 ID。
 */
const writeSumInfo = async (sInfo: summonerInfo) => {
	if (curRegion.value === null) {
		return;
	}
	const sumInfo: sumInfoTypes = {
		name: sInfo.name,
		summonerId: sInfo.currentId,
		puuid: sInfo.puuid,
		platformId: TencentRsoPlatformId[curRegion.value] || curRegion.value,
		newPlatformId: curRegion.value,
	};
	localStorage.setItem("sumInfo", JSON.stringify(sumInfo));
	recordStore.init();
};

/**
 * 客户端未启动时等待 background 的 initHome 事件。
 *
 * background 在检测到客户端启动并完成 LCU 初始化后，会向 mainWindow 发 initHome。
 */
const onClientLaunch = async () => {
	const closeMessageOn = await listen<string>("initHome", () => {
		let timer = 0;
		const interval = setInterval(async () => {
			timer += 1;
			if (summonerData.summonerInfo === null) {
				init(true);
			} else {
				clearInterval(interval);
				closeMessageOn();
			}
			// 最多尝试 15 秒，避免一直轮询。
			if (timer === 15) {
				clearInterval(interval);
				closeMessageOn();
			}
		}, 1000);
	});
};

/** 打开“我的战绩”独立窗口。 */
const openWin = () => {
	new QueryMatchWindow();
};

/**
 * 检查月度任务完成状态。
 *
 * TaskTracker 达到 24 次后，首页弹出 Sponsor 提示一次，并把 taskCount 改成 25 防止重复弹出。
 */
const taskCheck = () => {
	const data: TaskTrackerTypes = JSON.parse(
		localStorage.getItem("taskTracker") as string,
	);
	if (data.taskCount === 24) {
		taskCompleted.value = true;
		data.taskCount = 25;
		localStorage.setItem("taskTracker", JSON.stringify(data));
	}
};
</script>

<template>
	<div class="mainContent" v-if="summonerData.summonerInfo">
		<n-card size="small" class="shadow" content-style="padding-bottom: 0;">
			<!-- 头像、昵称、等级、经验进度。 -->
			<div class="h-14 flex gap-x-2">
				<n-avatar
					class="avatarEffect"
					round
					:bordered="false"
					:size="56"
					:src="summonerData.summonerInfo.imgUrl"
					fallback-src="https://wegame.gtimg.com/g.26-r.c2d3c/helper/lol/assis/images/resources/usericon/4027.png"
				/>
				<n-space
					class="flex-grow"
					:size="[0, 0]"
					justify="space-between"
					vertical
				>
					<div class="flex justify-between">
						<n-tag
							type="success"
							style="width: 130px; justify-content: center"
							:bordered="false"
							round
						>
							<n-ellipsis style="max-width: 110px" :tooltip="false">
								{{ summonerData.summonerInfo.name }}
							</n-ellipsis>
						</n-tag>
						<n-button
							class="px-2"
							:bordered="false"
							@click="openWin"
							type="success"
							size="small"
							round
						>
							我的战绩
						</n-button>
					</div>
					<div class="flex justify-between gap-x-3">
						<n-tag type="warning" size="small" round :bordered="false">
							{{ summonerData.summonerInfo.lv }}
						</n-tag>
						<div
							class="flex-grow"
							style="
								background-color: rgba(240, 160, 32, 0.15);
								padding: 0 7px;
								color: #f0a020;
								font-size: 12px;
								border-radius: 12px;
							"
						>
							<div class="flex justify-between items-center">
								<n-progress
									type="line"
									:show-indicator="false"
									:percentage="summonerData.summonerInfo.xp"
									status="warning"
									processing
									style="width: 100px; margin-top: 1.2px"
									:height="10"
								/>
								<div style="padding-top: 2px">
									{{ summonerData.summonerInfo.xp }} %
								</div>
							</div>
						</div>
					</div>
				</n-space>
			</div>

			<n-divider dashed style="margin: 14px 0 2px 0" />

			<!-- 段位和荣誉等级。rankList[3] 是 getHomeData.ts 追加进去的荣誉等级。 -->
			<n-list>
				<n-list-item>
					<n-space justify="space-between">
						<n-tag class="w-32 justify-center" type="success" :bordered="false" :round="false">
							单双 {{ summonerData.rankList[0] }}
						</n-tag>
						<n-tag class="w-32 justify-center" type="success" :bordered="false" :round="false">
							灵活 {{ summonerData.rankList[1] }}
						</n-tag>
					</n-space>
				</n-list-item>
				<n-list-item>
					<n-space justify="space-between">
						<n-tag class="w-32 justify-center" type="warning" :bordered="false" :round="false">
							云顶 {{ summonerData.rankList[2] }}
						</n-tag>
						<n-tag class="w-32 justify-center" type="warning" :bordered="false" :round="false">
							{{ summonerData.rankList[3] }}
						</n-tag>
					</n-space>
				</n-list-item>
			</n-list>
		</n-card>
		<n-card
			size="small"
			content-style="padding-top:10px"
			class="shadow"
			style="height: 402px"
		>
			<summoner-mastery-champ
				v-if="summonerData.champLevel"
				:max-h="378"
				:puuid="''"
				:exist-champ-list="summonerData.champLevel"
			/>
		</n-card>
		<!-- 检测游戏内窗口模式。 -->
		<check-mode />
	</div>
	<div class="mainContent" v-else>
		<start-game />
	</div>

	<n-modal style="margin: 8px; max-width: 334px" v-model:show="taskCompleted">
		<Sponsor :is-completed="true"></Sponsor>
	</n-modal>
</template>

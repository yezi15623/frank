<script setup lang="ts">
import LoadMatch from "./loadMatch.vue";
import { Ref, ref, onDeactivated } from "vue";
import SummonerDetail from "./summonerDetail.vue";
import { useTeammateStore } from "@/main/store/useTeammate";
import HaterDetails from "@/main/views/record/haterDetails.vue";
import { CurrentSumInfoTypes, SummonerInfoList } from "./teammateTypes";
import SummonerKdaName from "@/main/views/teammate/summonerKdaName.vue";
import {
	NAvatar,
	NDrawer,
	NList,
	NListItem,
	NSpace,
	NTag,
	NSkeleton,
	NDrawerContent,
	NPagination,
} from "naive-ui";
import { BlackItemsTypes } from "@/main/views/record/blackListTypes";
import { listen } from "@tauri-apps/api/event";

/**
 * 队友列表组件。
 *
 * 展示内容：
 * - 队友头像、昵称、段位、平均 KDA；
 * - 近期 6 局常用英雄头像；
 * - LCU 战绩失败时展示英雄熟练度兜底数据；
 * - 点击队友头像打开详情抽屉；
 * - 命中黑名单时打开黑名单详情抽屉。
 */
const teammateStore = useTeammateStore();
const drawerActive = ref(false);
const drawerBlackActive = ref(false);
const currentSumInfo: Ref<CurrentSumInfoTypes | null> = ref(null);
const currentHaterInfo: Ref<BlackItemsTypes | null> = ref(null);
const allHaterInfo: Ref<BlackItemsTypes[]> = ref([]);
const page = ref(1);
const blackLen = ref(0);

/**
 * 当只有一个被标记玩家时，Store 会向 mainWindow 发送 blacklist-team 事件。
 * 这里自动打开黑名单详情抽屉，减少用户遗漏风险。
 */
listen<boolean>("blacklist-team", () => {
	currentHaterInfo.value = teammateStore.blackItems[0][0];
	allHaterInfo.value = teammateStore.blackItems[0];
	blackLen.value = teammateStore.blackItems[0].length;
	drawerBlackActive.value = true;
});

/** 点击队友头像后打开队友详情抽屉。 */
const getCurrentSum = (summoner: SummonerInfoList, index: number) => {
	currentSumInfo.value = {
		kda: summoner?.kda,
		hater: summoner?.hater,
		name: summoner.name,
		puuid: summoner.puuid,
		rank: summoner.rank,
		index: index,
		imgUrl: summoner.imgUrl,
	} as CurrentSumInfoTypes;
	drawerActive.value = true;
};

const clearInfo = () => {
	currentSumInfo.value = null;
};

const clearBlackInfo = () => {
	currentHaterInfo.value = null;
	page.value = 1;
};

/** 打开指定队友的黑名单/被标记详情。 */
const openBlackList = (haterIndex: number) => {
	currentHaterInfo.value = teammateStore.blackItems[haterIndex][0];
	allHaterInfo.value = teammateStore.blackItems[haterIndex];
	blackLen.value = teammateStore.blackItems[haterIndex].length;
	drawerBlackActive.value = true;
};

/** 多条黑名单内容分页切换。 */
const changePgae = (page: number) => {
	currentHaterInfo.value = allHaterInfo.value[page - 1];
};

onDeactivated(() => {
	drawerActive.value = false;
	drawerBlackActive.value = false;
});
</script>

<template>
	<n-list v-if="teammateStore.summonerInfo.length !== 0">
		<n-list-item v-for="(summoner, index) in teammateStore.summonerInfo" style="padding: 10px 0">
			<div class="flex gap-x-3" style="height: 50px">
				<n-avatar
					:size="50"
					round
					class="cursor-pointer"
					:src="summoner.imgUrl"
					fallback-src="https://wegame.gtimg.com/g.26-r.c2d3c/helper/lol/assis/images/resources/usericon/4027.png"
					@click="getCurrentSum(summoner, index)"
				/>
				<div class="flex-grow">
					<div class="flex flex-col justify-between" style="height: 50px">
						<summoner-kda-name
							:open-drawer="openBlackList"
							:name="summoner.name"
							:hater="summoner?.hater"
							:hater-index="summoner?.haterIndex"
							:kda="summoner.kda"
						/>
						<n-tag round size="small" class="w-full justify-center text-sm" :bordered="false" type="info">
							{{ summoner.rank }}
						</n-tag>
					</div>
				</div>
			</div>
			<!-- 正常路径：展示近期战绩英雄。 -->
			<div v-if="!teammateStore.isLcuErr">
				<load-match v-if="teammateStore.recentMatchList[index] === undefined" />
				<n-space v-else style="margin-top: 10px; height: 32px" :size="[17.2, 0]">
					<n-avatar
						v-for="img in teammateStore.recentMatchList[index].slice(0, 6)"
						:size="32"
						:src="'https://game.gtimg.cn/images/lol/act/img/champion/' + img.champImgUrl"
					/>
				</n-space>
			</div>
			<!-- 降级路径：战绩查询失败时展示英雄熟练度头像。 -->
			<n-space v-else style="margin-top: 10px; height: 32px" :size="[17.2, 0]">
				<n-avatar
					v-for="img in teammateStore.masteryChampList[index].slice(0, 6)"
					:size="32"
					:src="img[0]"
				/>
			</n-space>
		</n-list-item>
	</n-list>

	<!-- 队友数据还在加载时的骨架屏。 -->
	<n-list v-else>
		<n-list-item v-for="i in 5">
			<n-skeleton class="rounded-md" height="88px" width="278px" />
		</n-list-item>
	</n-list>

	<n-drawer
		style="border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem"
		v-model:show="drawerActive"
		height="518"
		placement="bottom"
		@after-leave="clearInfo"
	>
		<summoner-detail v-if="currentSumInfo" :sum-info="currentSumInfo" :index="currentSumInfo.index" />
	</n-drawer>

	<n-drawer
		v-model:show="drawerBlackActive"
		style="border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem"
		:auto-focus="false"
		@after-leave="clearBlackInfo"
		:height="blackLen > 1 ? 308 : 272"
		placement="bottom"
	>
		<n-drawer-content>
			<hater-details
				v-if="currentHaterInfo"
				:key="currentHaterInfo.hContent.ID"
				:h-content="currentHaterInfo.hContent"
				:h-info="currentHaterInfo.hInfo"
				:is-edit="false"
			/>
			<div v-if="blackLen > 1" class="flex justify-center pt-2">
				<n-pagination
					v-model:page="page"
					@update-page="changePgae"
					:page-count="blackLen"
					:page-slot="blackLen > 6 ? 6 : blackLen"
				/>
			</div>
		</n-drawer-content>
	</n-drawer>
</template>

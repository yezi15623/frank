<script setup lang="ts">
import { NCard, NAlert, NDrawer } from "naive-ui";
import { onDeactivated } from "vue";
import BlackSummonerList from "./blackSummonerList.vue";
import GameEnd from "@/main/views/record/gameEnd.vue";
import { useRecordStore } from "@/main/store/useRecord";

/**
 * 排位笔记/对局结束记录页面。
 *
 * 该页面有两块职责：
 * - 展示当前账号已有的黑名单/排位笔记；
 * - 对局结束后弹出 GameEnd 抽屉，用于选择本局玩家并添加记录。
 */
const recordStore = useRecordStore();

onDeactivated(() => {
	closeDrawer();
});

/**
 * 关闭对局结束抽屉。
 *
 * participantsInfo 延迟清空，是为了避免抽屉关闭动画过程中内容突然消失。
 */
const closeDrawer = () => {
	recordStore.showGameEnd = false;
	setTimeout(() => {
		recordStore.participantsInfo = null;
	}, 1000);
};
</script>

<template>
	<n-card class="shadow" size="small" style="height: 616px">
		<!-- haterList=null 表示服务端连接异常或初始化失败。 -->
		<n-alert v-if="recordStore.haterList === null" title="啊嗷~~~" type="error">
			<text>连接服务器异常，请重启Frank!</text>
			<br />
			<text>多次尝试无果，请等待作者修复！</text>
			<br />
			<text>给您带来的使用不便，深感抱歉~</text>
		</n-alert>
		<!-- haterList=[] 表示正常连接，但当前账号暂无排位笔记。 -->
		<n-alert
			v-else-if="recordStore.haterList.length === 0"
			title="排位笔记"
			type="success"
		>
			<text>当前大区暂无你的排位笔记哟，</text>
			<br />
			<text>营造良好游戏环境从你我做起。</text>
			<br />
			<text class="text-gray-400">游戏对局结束后方可添加数据~</text>
		</n-alert>
		<black-summoner-list
			v-else
			:local-sum-id="<number>recordStore.localSumInfo?.summonerId"
			:hater-list="recordStore.haterList"
			:refresh-list="recordStore.init"
		/>
	</n-card>

	<!-- 游戏结束后弹出，用于展示本局双方玩家并添加排位笔记。 -->
	<n-drawer
		v-model:show="recordStore.showGameEnd"
		style="border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem"
		:mask-closable="false"
		:auto-focus="false"
		height="673"
		placement="bottom"
	>
		<!-- 正常路径：使用正式对局详情接口返回的数据。 -->
		<game-end
			v-if="recordStore.participantsInfo"
			:close-drawer="closeDrawer"
			:team-one="recordStore.participantsInfo.teamOne"
			:team-two="recordStore.participantsInfo.teamTwo"
			:game-id="recordStore.participantsInfo.gameId"
			:platform-id="<string>recordStore.localSumInfo?.platformId"
		/>
		<!-- 兜底路径：正式接口失败时，使用 LCU session 构造的 PlanB 数据。 -->
		<game-end
			v-else-if="recordStore.participantsInfoPlanB"
			:close-drawer="closeDrawer"
			:team-one="recordStore.participantsInfoPlanB.teamOne"
			:team-two="recordStore.participantsInfoPlanB.teamTwo"
			:game-id="recordStore.participantsInfoPlanB.gameId"
			:platform-id="<string>recordStore.localSumInfo?.platformId"
		/>
	</n-drawer>
</template>

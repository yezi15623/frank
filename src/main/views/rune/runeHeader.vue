<script setup lang="ts">
import { NCard, NAvatar, NButton, NBadge, NDrawer, useMessage } from "naive-ui";
import RuneAuto from "@/main/views/rune/runeAuto.vue";
import { onDeactivated, ref, watch } from "vue";
import { isStoreageHas } from "@/lcu/utils";
import { handleRunesWrite, writeAutoRune } from "@/main/views/rune/runes";
import { RuneStoreActions, RuneStoreState } from "@/main/views/rune/runeTypes";
import { Store } from "pinia";
import { RuneTips } from "@/main/utils/notice.ts";

const { storeRune } = defineProps<{
	storeRune: Store<"useRuneStore", RuneStoreState, {}, RuneStoreActions>;
}>();

/** 是否打开底部自动符文抽屉。 */
const autoRuneActive = ref(false);
/** 当前英雄是否已经配置自动符文。 */
const isAutoRune = ref(false);
const message = useMessage();
const configSetting = JSON.parse(<string>localStorage.getItem("configSetting"));
const runeTips = new RuneTips();
/** 用于“首次点击先提示、再次点击确认”的计数。 */
const autoRuneCheckCount = ref<number>(0);

/**
 * 自动写入当前英雄符文。
 *
 * 当用户之前为某个英雄保存过自动符文时，选到该英雄后会自动调用这个函数。
 */
const autoWriteRune = (alias: string) => {
	const localRuneStr = localStorage.getItem("autoRune") as string;
	const runeData = JSON.parse(localRuneStr)[alias];

	if (runeData === undefined) {
		message.error("自动符文，数据获取失败", { duration: 3000 });
		return;
	}

	handleRunesWrite(runeData).then((writeRes) => {
		if (writeRes) {
			message.success("自动符文配置成功");
		} else {
			message.error("自动符文配置失败");
		}
	});
};

/**
 * 监听当前英雄 alias 变化。
 *
 * 触发场景：main/index.vue 收到 Champion 状态 -> runeStore.initStore -> currentChampAlias 变化。
 * 如果 localStorage.autoRune 中存在该英雄数据，则自动写入符文页。
 */
watch(
	() => storeRune.currentChampAlias,
	async (alias: string) => {
		if (alias !== "") {
			autoRuneCheckCount.value = 0;
		}
		isAutoRune.value = isStoreageHas("autoRune", alias);
		if (isAutoRune.value) {
			autoWriteRune(alias);
		} else {
			isAutoRune.value = false;
		}
	},
	{ immediate: true },
);

/**
 * 设置/更新当前英雄自动符文。
 *
 * checkTwo=false：第一次点击，可能先显示风险/说明提示；
 * checkTwo=true：用户再次点击确认，直接保存当前客户端符文为自动符文。
 */
const setAutoRune = async (checkTwo: boolean) => {
	if (checkTwo) {
		writeAutoRune(storeRune.currentChampAlias, storeRune.currentChampTitle, message);
		setupAutoRune("auto");
		autoRuneCheckCount.value = 0;
		return;
	}
	if (!configSetting.warmTips.autoRune) {
		runeTips.init(configSetting);
		autoRuneCheckCount.value++;
	} else {
		writeAutoRune(storeRune.currentChampAlias, storeRune.currentChampTitle, message);
		setupAutoRune("auto");
	}
};

/** 点击英雄头像时，如果当前英雄已启用自动符文，则打开抽屉查看/更新。 */
const openDrawer = () => {
	if (isAutoRune.value) {
		autoRuneActive.value = true;
	}
};

/** 子组件 runeAuto 完成设置后回调。 */
const setupAutoRune = (type: string) => {
	if (type === "auto") {
		isAutoRune.value = true;
	} else {
		isAutoRune.value = false;
	}
	autoRuneActive.value = false;
};

const openTips = () => {
	runeTips.init(configSetting);
};

onDeactivated(() => {
	autoRuneActive.value = false;
});
</script>

<template>
	<n-card class="shadow" size="small">
		<div v-if="storeRune.skillsList.length > 0" class="flex justify-between items-center">
			<div class="flex gap-x-2 items-center">
				<n-badge style="font-family: DingTalk" :value="isAutoRune ? 'auto' : ''" color="#ff6666">
					<n-avatar
						round
						:bordered="false"
						:size="50"
						:src="storeRune.currentChampImgUrl"
						fallback-src="https://wegame.gtimg.com/g.26-r.c2d3c/helper/lol/assis/images/resources/usericon/4027.png"
						style="display: block"
						:style="isAutoRune ? 'cursor: pointer' : ''"
						@click="openDrawer"
					/>
				</n-badge>
				<!-- 技能加点顺序。skill[0] 是图标，skill[1] 是 Q/W/E/R。 -->
				<div class="relative" v-for="skill in storeRune.skillsList">
					<n-avatar
						round
						:bordered="false"
						:size="34"
						:src="skill[0]"
						fallback-src="https://wegame.gtimg.com/g.26-r.c2d3c/helper/lol/assis/images/resources/usericon/4027.png"
						style="display: block"
					/>
					<strong class="skillText bg-neutral-900 bg-opacity-80 text-green-400">
						{{ skill[1] }}
					</strong>
				</div>
			</div>
			<div v-if="storeRune.hexAugments === null">
				<n-button
					@click="setAutoRune(false)"
					v-if="autoRuneCheckCount === 0"
					:focusable="false"
					class="p-2"
					secondary
					round
					:type="isAutoRune ? 'success' : 'info'"
				>
					{{ isAutoRune ? "更新数据" : "自动符文" }}
				</n-button>
				<n-button
					@click="setAutoRune(true)"
					v-else
					round
					:focusable="false"
					class="p-2"
					secondary
					type="error"
				>
					再次点击
				</n-button>
			</div>
			<div v-else>
				<n-button :focusable="false" class="p-2" secondary round type="success">
					强化符文
				</n-button>
			</div>
		</div>

		<div v-else class="flex w-full items-center justify-between" style="height: 50px">
			<n-button class="p-2" secondary type="success"> 暂未选择英雄 </n-button>
			<n-button class="p-2" secondary type="success"> 空空空空如也 </n-button>
		</div>
	</n-card>
	<n-drawer
		style="border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem"
		v-model:show="autoRuneActive"
		:height="275"
		:auto-focus="false"
		placement="bottom"
	>
		<div>
			<rune-auto
				:champ="storeRune.currentChampAlias"
				:champ-name="storeRune.currentChampTitle"
				:open-tips="openTips"
				@complete-setup="setupAutoRune"
			/>
		</div>
	</n-drawer>
</template>

<style scoped>
.skillText {
	width: 12px;
	height: 12px;
	padding: 2px;
	position: absolute;
	top: 16px;
	left: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 20px;
	white-space: nowrap;
	font-size: 10px;
}
</style>

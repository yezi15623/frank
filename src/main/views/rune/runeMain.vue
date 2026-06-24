<script setup lang="ts">
import { NTabs, NTabPane, NCard } from "naive-ui";
import RuneContent from "./runeContent.vue";
import BlockContent from "./blockContent.vue";
import { Ref, ref, watch } from "vue";
import { Rune } from "./runeTypes";
import { get101Runes } from "./get101Runes";
import { RuneStoreActions, RuneStoreState } from "@/main/views/rune/runeTypes";
import { Store } from "pinia";
import HexContent from "@/main/views/rune/hexContent.vue";
import BlockHexContent from "@/main/views/rune/blockHexContent.vue";

const { storeRune } = defineProps<{
	storeRune: Store<"useRuneStore", RuneStoreState, {}, RuneStoreActions>;
}>();

/** 官方符文列表。get101Runes 通常代表来自 101/官方数据源的推荐。 */
const rune101List: Ref<Rune[]> = ref([]);

/**
 * 监听当前英雄变化并加载官方符文。
 *
 * storeRune.runeDataList 是项目远程推荐数据；
 * rune101List 是另一份官方/101 数据源，用第二个 Tab 展示，方便用户对比。
 */
watch(
	() => storeRune.currentChamp,
	async (champId: number) => {
		if (champId === 0) {
			return;
		}
		rune101List.value = await get101Runes(champId);
	},
	{ immediate: true },
);
</script>

<template>
	<n-card
		class="shadow"
		size="small"
		content-style="padding-top:2px;padding-left:0px;padding-right:0px;"
		style="height: 517px"
	>
		<!-- 常规模式：展示推荐符文、官方符文和装备方案。 -->
		<n-tabs
			class="mt-2.5"
			type="segment"
			animated
			justify-content="space-between"
			v-if="storeRune.hexAugments === null"
		>
			<n-tab-pane name="tab1" tab="推荐符文">
				<rune-content :rune-list="storeRune.runeDataList" />
			</n-tab-pane>
			<n-tab-pane name="tab2" tab="官方符文">
				<rune-content :rune-list="rune101List" />
			</n-tab-pane>
			<n-tab-pane name="tab3" tab="装备方案">
				<block-content />
			</n-tab-pane>
		</n-tabs>

		<!-- 特殊模式：展示海克斯强化与装备。 -->
		<n-tabs
			class="mt-2.5"
			type="segment"
			animated
			justify-content="space-between"
			v-else
		>
			<n-tab-pane name="tab1" tab="棱彩">
				<hex-content
					:scroll-height="'442px'"
					:hex-info-list="storeRune.hexAugments.prism"
				/>
			</n-tab-pane>
			<n-tab-pane name="tab2" tab="黄金">
				<hex-content
					:scroll-height="'442px'"
					:hex-info-list="storeRune.hexAugments.gold"
				/>
			</n-tab-pane>
			<n-tab-pane name="tab3" tab="白银">
				<hex-content
					:scroll-height="'442px'"
					:hex-info-list="storeRune.hexAugments.sliver"
				/>
			</n-tab-pane>
			<n-tab-pane name="tab4" tab="装备">
				<block-hex-content :items="storeRune.hexItemList" />
			</n-tab-pane>
		</n-tabs>
	</n-card>
</template>

<style scoped>
:deep(.n-tabs .n-tabs-nav) {
	padding: 0 12px !important;
}
</style>

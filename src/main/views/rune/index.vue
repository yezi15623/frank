<script setup lang="ts">
import RuneHeader from "./runeHeader.vue";
import RuneMain from "./runeMain.vue";
import { RuneStoreActions, RuneStoreState } from "@/main/views/rune/runeTypes";
import { Store } from "pinia";
import { useRuneStore } from "@/main/store/useRune.ts";

/**
 * 符文页面入口。
 *
 * 页面被拆成两部分：
 * - RuneHeader：英雄头像、技能加点、自动符文入口；
 * - RuneMain：推荐符文、官方符文、装备方案、海克斯数据等主体内容。
 *
 * 这里把同一个 Pinia Store 传给两个子组件，保证页面上方和下方使用同一份英雄/符文数据。
 */
const storeRune: Store<"useRuneStore", RuneStoreState, {}, RuneStoreActions> =
	useRuneStore();
</script>

<template>
	<div class="mainContent">
		<rune-header :store-rune="storeRune" />
		<rune-main :store-rune="storeRune" />
	</div>
</template>

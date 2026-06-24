<script setup lang="ts">
import { NConfigProvider, zhCN, darkTheme } from "naive-ui";
import { themeOverrides } from "../main/utils/theme";
import RecentMatch from "./recentMatch.vue";

/**
 * recentMatchWindow 根组件。
 *
 * 和 mainWindow 类似，这里也使用 Naive UI 的 NConfigProvider 统一配置语言和主题。
 * recentMatchWindow 是独立 WebView，所以需要单独读取主题并设置 dark class。
 */
const theme = localStorage.getItem("theme") || "light";

if (theme === "dark") {
	document.documentElement.classList.add("dark");
}
</script>

<template>
	<n-config-provider
		:locale="zhCN"
		:theme-overrides="themeOverrides"
		:theme="theme === 'dark' ? darkTheme : null"
	>
		<recent-match />
	</n-config-provider>
</template>

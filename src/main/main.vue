<script setup lang="ts">
import {
	NMessageProvider,
	NConfigProvider,
	zhCN,
	darkTheme,
	NDialogProvider,
} from "naive-ui";
import { themeOverrides } from "./utils/theme";
import Frank from "./index.vue";

// 从 localStorage 读取主题配置。
// 这里控制的是主窗口整体 Naive UI 主题和 document 根节点 dark class。
const theme = localStorage.getItem("theme") || "light";

if (theme === "dark") {
	document.documentElement.classList.add("dark");
}
</script>

<template>
	<!--
		NConfigProvider 是 Naive UI 的全局配置容器：
		- locale=zhCN：中文语言环境；
		- theme-overrides：项目自定义主题变量；
		- theme：暗色模式时切换为 darkTheme。
	-->
	<n-config-provider
		:locale="zhCN"
		:theme-overrides="themeOverrides"
		:theme="theme === 'dark' ? darkTheme : null"
	>
		<!-- DialogProvider/MessageProvider 让子组件可以使用 useDialog/useMessage。 -->
		<n-dialog-provider>
			<n-message-provider :placement="'bottom'">
				<Frank />
			</n-message-provider>
		</n-dialog-provider>
	</n-config-provider>
</template>

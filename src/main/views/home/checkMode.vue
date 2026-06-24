<script setup lang="ts">
import { onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import FloatingPrompt from "./FloatingPrompt.vue";
import { useMessage } from "naive-ui";

/**
 * 游戏窗口模式检测组件。
 *
 * 作用：
 * - 根据本地 clientPath 推导 LOL 配置文件 Game\Config\game.cfg；
 * - 调用 Rust command 检查 WindowMode；
 * - 如果检测到全屏模式，提示用户切换为无边框。
 *
 * modeId 含义：
 * - -2：初始化状态；
 * - -1：配置文件不存在或读取失败；
 * - 0：全屏；
 * - 1：窗口；
 * - 2：无边框。
 */
const modeId = ref<number>(-2);
const isVisible = ref(false);
let configPath = "";

const message = useMessage();

onMounted(async () => {
	const path = localStorage.getItem("clientPath");
	if (path != null) {
		// clientPath 指向 TCLS\client.exe，这里替换成游戏配置文件路径。
		configPath = path.replace("TCLS\\client.exe", "Game\\Config\\game.cfg");
		// 延迟 1 秒，避免客户端刚启动时配置文件还没准备好。
		await new Promise((resolve) => setTimeout(resolve, 1000));
		invoke<number>("check_borderless_mode", { configPath: configPath })
			.then((mode) => {
				modeId.value = mode;
				// WindowMode=0 表示全屏，Frank 的游戏内窗口可能无法正常叠加，所以弹出提示。
				if (mode === 0) {
					isVisible.value = true;
				}
			})
			.catch(() => {
				modeId.value = -1;
			});
	}
});

/** 用户确认后调用 Rust command 写入 WindowMode=2。 */
const handleConfirm = () => {
	invoke("set_borderless_mode", { configPath: configPath })
		.then(() => {
			message.success("应用成功, 祝你游戏连胜!");
		})
		.catch((error) => {
			message.error(error);
		});
	isVisible.value = false;
};
</script>

<template>
	<FloatingPrompt
		:show="isVisible"
		title="窗口设置"
		@confirm="handleConfirm"
		@cancel="isVisible = false"
	/>
</template>

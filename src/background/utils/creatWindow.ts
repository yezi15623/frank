import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ConfigSettingTypes } from "../types";

/**
 * 创建 Frank 主窗口。
 *
 * background 窗口是隐藏后台窗口，MainWindow 才是用户看到的主界面。
 * 这里用 Tauri 的 WebviewWindow 动态创建窗口，而不是完全依赖 tauri.conf.json 静态配置。
 */
export class MainWindow {
	constructor() {
		const webview = new WebviewWindow("mainWindow", {
			title: "Frank",
			url: "src/main/index.html",
			width: 320,
			height: 720,
			visible: false,
			resizable: false,
			// decorations=false 表示无系统标题栏，窗口外观完全由前端页面控制。
			decorations: false,
			center: true,
			// transparent=true 配合前端样式实现透明/圆角窗口效果。
			transparent: true,
		});

		webview.once("tauri://created", async function () {
			webview.show();

			// 主窗口创建成功后读取窗口吸附配置，并同步到 Rust 后端。
			const isTracker: ConfigSettingTypes = JSON.parse(
				localStorage.getItem("configSetting") as string,
			);

			const enabled = isTracker.lolTracker > 0;
			const side = isTracker.lolTracker === 1 ? "Left" : "Right";

			// 同步配置到后端 FrankState。
			await invoke("sync_tracker_config", { enabled, side });

			// 尝试启动窗口吸附循环。Rust 端有 is_running 锁，所以重复调用也不会重复启动线程。
			await invoke("start_tracking_loop");
		});
	}
}

/**
 * 创建“我的战绩”窗口。
 *
 * 该窗口使用独立入口 src/queryMatch/index.html，说明 Frank 是多入口/多 WebView 结构。
 */
export class QueryMatchWindow {
	constructor() {
		const webview = new WebviewWindow("queryMatchWindow", {
			title: "我的战绩",
			url: "src/queryMatch/index.html",
			width: 1174,
			height: 668,
			resizable: false,
			decorations: false,
			center: true,
			visible: false,
			transparent: true,
		});
		webview.once("tauri://created", async function () {
			webview.show();
		});
	}
}

/**
 * 创建“战绩分析”窗口。
 */
export class MatchAnalysisWindow {
	constructor() {
		const webview = new WebviewWindow("matchAnalysisWindow", {
			title: "战绩分析",
			url: "src/matchAnalysis/index.html",
			width: 1024,
			height: 576,
			resizable: false,
			decorations: false,
			center: true,
			visible: false,
			transparent: true,
		});
		webview.once("tauri://created", async function () {
			webview.show();
		});
	}
}

/**
 * 创建“对局详情/游戏内战绩”窗口。
 *
 * 这个窗口和普通查询窗口不同：
 * - skipTaskbar=true：不显示在任务栏；
 * - alwaysOnTop=true：保持置顶；
 * - 常用于游戏内叠加显示。
 */
export class RecentMatchWindow {
	constructor() {
		const webview = new WebviewWindow("recentMatchWindow", {
			title: "对局详情",
			url: "src/recentMatch/index.html",
			width: 1254,
			height: 562,
			resizable: false,
			decorations: false,
			center: true,
			visible: false,
			skipTaskbar: true,
			alwaysOnTop: true,
			transparent: true,
		});
		webview.once("tauri://created", async function () {
			webview.show();
		});
	}
}

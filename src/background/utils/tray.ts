import { TrayIcon, TrayIconEvent, TrayIconOptions } from "@tauri-apps/api/tray";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu } from "@tauri-apps/api/menu";
import { exit } from "@tauri-apps/plugin-process";
import { window } from "@tauri-apps/api";
import { QueryMatchWindow, RecentMatchWindow } from "./creatWindow.ts";
import { Image } from "@tauri-apps/api/image";

/**
 * 显示/隐藏主窗口。
 *
 * @param isHide true 表示强制隐藏；false 表示按当前状态切换显示/隐藏。
 */
const showMain = (isHide: boolean) => {
	window.Window.getByLabel("mainWindow").then(async (win) => {
		if (!win) return;

		if (isHide) {
			await win.hide();
			return;
		}

		const isVisible = await win.isVisible();
		const isMinimized = await win.isMinimized();

		// 如果窗口当前不可见，先显示出来。
		if (!isVisible) {
			await win.show();
		}

		// 如果窗口最小化，恢复窗口；如果已经显示，则左键点击托盘时隐藏窗口。
		if (isMinimized) {
			await win.unminimize();
		} else if (isVisible) {
			await win.hide();
		}
	});
};

/**
 * 托盘右键菜单。
 *
 * Tauri v2 的托盘菜单可以绑定 action，点击菜单项时直接执行对应回调。
 */
const menu = await Menu.new({
	items: [
		{
			id: "showMain",
			text: "隐藏助手",
			action: () => {
				showMain(true);
			},
		},
		{
			id: "matchDetail",
			text: "对局详情",
			action: () => {
				window.Window.getByLabel("recentMatchWindow").then(async (win) => {
					// 如果对局详情窗口不存在，则创建；存在则切换显示/隐藏。
					if (win === null) {
						new RecentMatchWindow();
					} else {
						if (await win.isVisible()) {
							win.hide();
						} else {
							win.show();
						}
					}
				});
			},
		},
		{
			id: "queryMatch",
			text: "我的战绩",
			action: () => {
				window.Window.getByLabel("queryMatchWindow").then((win) => {
					// “我的战绩”窗口不存在时才新建，避免重复创建多个同名窗口。
					if (win === null) {
						new QueryMatchWindow();
					}
				});
			},
		},
		{
			id: "quit",
			text: "退出软件",
			action: () => {
				exit(1);
			},
		},
		{
			id: "author",
			text: "@Java_S",
		},
	],
});

/**
 * 托盘左键点击行为。
 * 左键按下时切换主窗口显示/隐藏。
 */
const leftClick = async (event: TrayIconEvent) => {
	if (
		event.type === "Click" &&
		event.button === "Left" &&
		event.buttonState === "Down"
	) {
		showMain(false);
	}
};

/** 托盘图标配置。 */
const options: TrayIconOptions = {
	icon: (await defaultWindowIcon()) as Image,
	menu,
	// false 表示左键不弹菜单，而是执行 action；菜单通常由右键打开。
	menuOnLeftClick: false,
	action: leftClick,
};

// 创建系统托盘图标。该文件被 background.ts import 后会立即执行。
TrayIcon.new(options);

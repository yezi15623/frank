import "./utils/tray.ts";
import { invokeLcu } from "@/lcu";
import { GameFlow } from "./gameFlow.ts";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { MainWindow } from "./utils/creatWindow.ts";
import { TaskTracker } from "./utils/TaskTracker.ts";
import { ChampionSession } from "@/background/types";
import { configInit, getClientPath } from "@/background/utils/config.ts";

/**
 * background 窗口入口。
 *
 * Tauri 配置里有一个隐藏的 background 窗口，它不负责展示 UI，主要承担“后台服务”的角色：
 * - 创建/管理主窗口；
 * - 初始化用户配置；
 * - 等待 LOL 客户端启动；
 * - 监听 Rust 后端发来的 LCU WebSocket 事件；
 * - 根据游戏阶段触发自动接受、自动 BP、符文/战绩窗口等逻辑。
 *
 * 对有 WPF/WinForms 背景的人，可以把它理解为一个隐藏的后台 Form/Window + 应用级事件调度器。
 */
class Background {
	/** 游戏流程协调器，封装 ReadyCheck、ChampSelect、GameStart 等状态对应的动作。 */
	private gameFlow: GameFlow;

	/** 用于跟踪某些异步任务是否完成，例如结算阶段后清理任务状态。 */
	private taskTracker: TaskTracker;

	/** 上一次处理 champ-select 事件的时间，用于节流，避免 WebSocket 高频事件导致重复处理。 */
	private lastProcessedTime: number;

	/** 上一次处理过的英雄 ID，用于避免同一个英雄重复通知主窗口。 */
	private preChampId: number;

	/** 取消监听选人会话事件的函数。Tauri listen 会返回 unlisten 回调。 */
	private unListenSelectSession: UnlistenFn | undefined;

	constructor() {
		// 创建主窗口；background 本身是隐藏窗口，真正给用户看的窗口由 MainWindow 管理。
		new MainWindow();
		// 初始化 localStorage 中的配置，确保后续读取 configSetting 时不会为空。
		configInit();
		this.gameFlow = new GameFlow();
		this.taskTracker = new TaskTracker();
		this.lastProcessedTime = 0;
		this.preChampId = 0;
		this.initializeListeners();
	}

	/**
	 * 初始化后台事件监听。
	 *
	 * 第一步先调用 Rust command: listen_for_client_start。
	 * Rust 会轮询 LeagueClientUx.exe，找到 LCU token/port 后发出 client_status=ClientStarted。
	 * 随后 background 开始监听几个关键事件。
	 */
	private initializeListeners() {
		invoke("listen_for_client_start").then(async () => {
			// 监听游戏流程状态，例如 ClientStarted、ReadyCheck、ChampSelect、GameStart 等。
			listen<string>("client_status", (event) =>
				this.handleClientStatus(event.payload),
			);

			// 监听当前选择英雄变化。该事件来自 Rust 后端的 current-champion WebSocket 订阅。
			listen<number>("lol-current-champ-select", (event) =>
				this.handleCurrentChamp(event.payload),
			);

			// 监听完整选人会话。session 事件数据量较大且变化频繁，所以 handleChampionSelect 内做了节流。
			this.unListenSelectSession = await listen<ChampionSession>(
				"lol-champ-select",
				(event) => this.handleChampionSelect(event.payload),
			);
		});
	}

	/**
	 * LOL 客户端启动后初始化 Frank 与 LCU 的连接。
	 *
	 * 注意这里不是直接相信客户端已经完全可用，而是最多等待 30 秒，每 3 秒检查一次客户端路径。
	 */
	private initFrank() {
		const TIME_LIMIT = 30000;
		let elapsedTime = 0;
		const intervalTime = 3000;

		// 初始化全局快捷键监听。
		invoke("init_keyboard");
		const lcuSuccess = setInterval(async () => {
			const isGetPath = await getClientPath();
			if (isGetPath) {
				clearInterval(lcuSuccess);
				setTimeout(() => {
					// 通知主窗口执行初始化，并启动 Rust 端 LCU WebSocket 监听。
					this.gameFlow.sendStartEvent();
					invoke("start_listener");
				}, 500);
			}

			elapsedTime += intervalTime;
			if (elapsedTime >= TIME_LIMIT) {
				clearInterval(lcuSuccess);
				console.log("超时，客户端未启动");
			}
		}, intervalTime);
	}

	/**
	 * 主动查询当前英雄 ID，并在发生变化时通知主窗口。
	 *
	 * 这个方法通常用于选人阶段。因为完整 champ-select session 可能不总是稳定提供当前英雄，
	 * 所以这里单独请求 /lol-champ-select/v1/current-champion。
	 */
	private async handleGetCurrentChampion() {
		const value = await invokeLcu<number>(
			"get",
			"/lol-champ-select/v1/current-champion",
		);

		if (value === null) return;

		if (value !== 0 && value !== this.preChampId) {
			this.gameFlow.sendMesToMain("Champion", value);
			this.preChampId = value;
			if (this.unListenSelectSession !== undefined) {
				// 一旦可以通过 current-champion 事件拿到英雄变化，就取消完整 session 监听，降低事件处理压力。
				this.unListenSelectSession();
				invoke("start_current_champ_select");
			}
		}
	}

	/**
	 * 根据 LCU gameflow 状态执行不同业务动作。
	 *
	 * 这是学习本项目最重要的方法之一：
	 * Rust WebSocket 监听到状态 -> emit 到 background -> 进入这个 switch -> 调用 GameFlow。
	 */
	private handleClientStatus(status: string) {
		switch (status) {
			case "ClientStarted":
				this.initFrank();
				break;
			case "ChampSelect":
				this.preChampId = 0;
				this.gameFlow.sendMesToMain("ChampSelect");
				this.gameFlow.autoPickBanChamp();
				break;
			case "GameStart":
				this.gameFlow.showHideMainWin(false, "GameStart");
				this.gameFlow.initGameInWindow();
				break;
			case "PreEndOfGame":
				this.gameFlow.closeWin("recentMatchWindow");
				this.gameFlow.showHideMainWin(true, "EndOfGame");
				this.taskTracker.completeTask();
				break;
			case "Matchmaking":
				this.gameFlow.sendMesToMain("Matchmaking");
				break;
			case "ReadyCheck":
				this.gameFlow.autoAcceptGame();
				this.gameFlow.writeGameInfo();
				break;
			case "Lobby":
				this.gameFlow.sendMesToMain("Lobby");
				break;
			case "None":
				this.gameFlow.sendMesToMain("None");
				break;
		}
	}

	/**
	 * 处理完整 champ-select session 事件。
	 *
	 * WebSocket 在选人阶段可能非常频繁地推送 session，所以这里用 300ms 节流。
	 * 当前主要目的是在选人阶段发现当前英雄变化，然后把英雄 ID 发给主窗口。
	 */
	private async handleChampionSelect(champSession: ChampionSession) {
		const currentTime = Date.now();
		if (currentTime - this.lastProcessedTime < 300) return;

		this.lastProcessedTime = currentTime;
		// 如果没有 actions 或者我的队伍为空，说明 session 还没准备好，避免读空数据。
		if (champSession.actions.length === 0) {
			if (champSession.myTeam.length === 0) return;
			await this.handleGetCurrentChampion();
			return;
		}
		await this.handleGetCurrentChampion();
	}

	/**
	 * 处理 current-champion 事件。
	 * 只在英雄 ID 非 0 且不同于上次值时转发，避免重复刷新 UI。
	 */
	private handleCurrentChamp(champId: number) {
		if (champId !== 0 && champId !== this.preChampId) {
			this.preChampId = champId;
			this.gameFlow.sendMesToMain("Champion", champId);
		}
	}
}

// background 窗口加载后立即实例化后台调度器。
new Background();

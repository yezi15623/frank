import { window } from "@tauri-apps/api";
import { emitTo } from "@tauri-apps/api/event";
import { ConfigSettingTypes } from "./types";
import { champSelectSession } from "@/lcu/autoBP.ts";
import { invokeLcu } from "@/lcu";
import { RecentMatchWindow } from "@/background/utils/creatWindow.ts";
import { invoke } from "@tauri-apps/api/core";
import { SessionTypes } from "@/recentMatch/utils/queryTypes";

/**
 * GameFlow 负责把“英雄联盟客户端状态”转换成 Frank 的业务动作。
 *
 * 可以把它理解成一个前端侧的流程协调器：
 * - 收到 Rust/WebSocket 推来的 gameflow 状态；
 * - 根据状态通知主窗口刷新 UI；
 * - 根据配置触发自动接受、自动 BP、游戏内窗口等功能；
 * - 记录当前地图、队列等对局信息。
 */
export class GameFlow {
	/** 当前地图 ID。默认 11 通常对应召唤师峡谷。 */
	public mapId = 11;

	/** 当前队列 ID。默认 420 通常对应单双排。 */
	public queueId = 420;

	/**
	 * 给主窗口发送状态消息。
	 *
	 * background 窗口是隐藏常驻窗口；mainWindow 是用户真正看到的主界面。
	 * 这里通过 Tauri event 把后台状态转发给主窗口，主窗口再根据 messageId 更新页面。
	 */
	public sendMesToMain = (messageId: string, content: any = "") => {
		window.Window.getByLabel("mainWindow").then((win) => {
			if (win !== null) {
				emitTo("mainWindow", "clientStatus", {
					messageId: messageId,
					content: content,
				});
			}
		});
	};

	/**
	 * 显示或隐藏主窗口，并同步发一条状态消息。
	 *
	 * 例如游戏开始后隐藏主窗口，结算前后再显示主窗口。
	 */
	public showHideMainWin = (isShow: boolean, messageId: string) => {
		window.Window.getByLabel("mainWindow").then(async (win) => {
			if (win === null) {
				return;
			}
			isShow ? await win.show() : await win.hide();
			emitTo("mainWindow", "clientStatus", {
				messageId: messageId,
				content: "",
			});
		});
	};

	/** 关闭指定 label 的窗口。Tauri 窗口通过 label 标识，例如 recentMatchWindow。 */
	public closeWin = (winName: string) => {
		window.Window.getByLabel(winName).then(async (win) => {
			await win?.close();
		});
	};

	/**
	 * 客户端启动后通知主窗口初始化首页数据。
	 */
	public sendStartEvent = async () => {
		window.Window.getByLabel("mainWindow").then((win) => {
			if (win !== null) {
				emitTo("mainWindow", "initHome");
			}
		});
	};

	/**
	 * 自动选择/禁用英雄。
	 *
	 * 逻辑说明：
	 * - 从 localStorage 读取用户配置；
	 * - 只要自动 pick 或自动 ban 打开，就每秒检查一次选人会话；
	 * - champSelectSession 内部会判断当前 action 是否轮到本地玩家。
	 */
	public autoPickBanChamp = () => {
		const config: ConfigSettingTypes = JSON.parse(
			<string>localStorage.getItem("configSetting"),
		);
		if (config.autoPickChampion.isAuto || config.autoBanChampion.isAuto) {
			const idSetInterval = setInterval(async () => {
				// 这里把定时器 ID 传进去，方便 champSelectSession 在完成 pick/ban 后停止轮询。
				// @ts-ignore
				await champSelectSession(idSetInterval, config);
			}, 1000);
		}
	};

	/**
	 * 自动接受对局。
	 *
	 * autoAccept 的含义：
	 * - 小于 50：关闭自动接受；
	 * - 等于 50：立即接受；
	 * - 大于 50：按 (autoAccept - 50) * 200ms 延迟接受。
	 */
	public autoAcceptGame = async () => {
		const isAutoAccept = JSON.parse(
			<string>localStorage.getItem("configSetting"),
		).autoAccept;
		if (isAutoAccept < 50) {
			return;
		}
		if (isAutoAccept === 50) {
			invokeLcu("post", "/lol-matchmaking/v1/ready-check/accept");
			return;
		}
		const setTime = (isAutoAccept - 50) * 200;
		setTimeout(async () => {
			// 延迟接受前再查一次 ready-check，避免玩家已经拒绝后仍然发送 accept。
			invokeLcu("get", "/lol-matchmaking/v1/ready-check").then((res: any) => {
				if (res?.playerResponse !== "Declined") {
					invokeLcu("post", "/lol-matchmaking/v1/ready-check/accept");
				}
				return;
			});
		}, setTime);
	};

	/**
	 * 游戏真正进入加载/对局后执行的窗口逻辑。
	 *
	 * 这里会关闭桌面查询窗口，并根据配置决定是否打开游戏内战绩窗口。
	 */
	public initGameInWindow = async () => {
		this.closeWin("matchAnalysisWindow");
		this.closeWin("queryMatchWindow");
		this.closeWin("recentMatchWindow");

		let count = 0;
		const unListenGameStart = setInterval(() => {
			invoke<boolean>("is_game_start").then((value) => {
				count++;
				// 最多检查 10 次，每 2 秒一次，避免永久轮询。
				if (count > 10) {
					clearInterval(unListenGameStart);
				}
				if (value) {
					clearInterval(unListenGameStart);

					// mapId 11/12 时才打开游戏内窗口，避免在不支持的地图/模式中显示。
					if (this.mapId === 12 || this.mapId === 11) {
						const configSetting = JSON.parse(
							<string>localStorage.getItem("configSetting"),
						);
						if (configSetting.isGameInWindow) {
							new RecentMatchWindow();
						}
					}
				}
			});
		}, 2000);
	};

	/**
	 * 读取并缓存当前对局的 queueId 和 mapId。
	 *
	 * 这些信息后续会影响符文推荐、窗口显示、不同模式下的功能差异。
	 */
	public writeGameInfo = async () => {
		const res = await invokeLcu<SessionTypes>(
			"get",
			"/lol-gameflow/v1/session",
		);
		if (res === null) return;
		if (res.gameData !== undefined) {
			this.mapId = res.gameData.queue.mapId;
			this.queueId = res.gameData.queue.id;

			localStorage.setItem(
				"gameInfo",
				String(
					JSON.stringify({
						queueId: res.gameData.queue.id,
						mapId: res.gameData.queue.mapId,
					}),
				),
			);
		}
	};
}

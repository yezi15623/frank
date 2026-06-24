<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { window } from "@tauri-apps/api";
import { invoke } from "@tauri-apps/api/core";
import { useRuneStore } from "@/main/store/useRune";
import { useMessage, MessageReactive } from "naive-ui";
import Dashboard from "@/main/common/dashboard.vue";
import { emitTo, listen } from "@tauri-apps/api/event";
import { useRecordStore } from "@/main/store/useRecord";
import Navigation from "@/main/common/navigation.vue";
import { useTeammateStore } from "@/main/store/useTeammate";
import { queryFriendInfo } from "@/main/views/teammate/utils";
import { MainPageTips } from "@/main/utils/notice.ts";

/**
 * 主窗口核心组件。
 *
 * 这个文件是 mainWindow 的“前端状态机”：
 * - 监听 background.ts 发来的 clientStatus；
 * - 根据游戏阶段切换页面；
 * - 初始化队友、符文、战绩等 Store；
 * - 在多个窗口之间转发缓存数据。
 */
const router = useRouter();

/** 底部导航当前选中位置。 */
const curPos = ref(0);

/** Naive UI 消息提示实例。 */
const message = useMessage();

/** 用于保存“对局结算数据加载中”的 loading 消息，后续需要手动 destroy。 */
let messageReactive: MessageReactive | null = null;

/** 三个核心 Store：队友、符文、战绩。 */
const teammateStore = useTeammateStore();
const runeStore = useRuneStore();
const recordStore = useRecordStore();

/** 页面提示/引导逻辑。 */
const pageTips = new MainPageTips();

/** 用户配置。由 background 初始化后写入 localStorage。 */
const configSetting = JSON.parse(<string>localStorage.getItem("configSetting"));

/** 记录哪些页面已经显示过提示，避免重复打扰用户。 */
const tipsDoneList: number[] = [];

onMounted(() => {
	// 主窗口挂载后默认进入首页。
	router.push({ name: "home" });
});

/**
 * 主窗口游戏状态机。
 *
 * background.ts 接收到 Rust/LCU 事件后，会 emitTo("mainWindow", "clientStatus", ...)。
 * mainWindow 收到后进入下面这个类的不同 handler。
 */
class GameState {
	/** 当前游戏流程状态，例如 None、Lobby、ChampSelect、Champion、GameStart。 */
	public curFlow = "None";

	/** 是否已经启动完整选人 session 监听，避免重复 invoke("start_champ_select")。 */
	public islistenSession = false;

	/** 当前队列 ID。-1 表示尚未读取或需要重新读取。 */
	public curQueueId = -1;

	/** 当前英雄 ID。-1 表示还没有选定英雄。 */
	public curChampId = -1;

	/** 清空和当前对局强相关的 Store。 */
	public resetStore = () => {
		runeStore.$reset();
		teammateStore.$reset();
	};

	/**
	 * 修改当前流程并跳转页面。
	 *
	 * @param id 新的流程状态
	 * @param page 路由名
	 * @param index 底部导航位置
	 */
	public changeState = (id: string, page: string, index: number) => {
		this.curFlow = id;
		this.navigateToPage(page, index);
	};

	/**
	 * 跳转到底部导航对应的页面。
	 *
	 * 部分页面需要在特定游戏阶段才允许访问，例如：
	 * - 队友页、符文页需要进入选人阶段后才有数据；
	 * - 首页/段位页通常可以直接访问。
	 */
	public navigateToPage = (page: string, index: number) => {
		if (!this.preventAccess(index)) {
			const mess =
				index === 2
					? "选择英雄阶段，方可使用"
					: "选择英雄之后，才可使用";
			message.warning(mess, { duration: 2000 });
			return;
		}

		curPos.value = index;
		router.push({ name: page });

		// 某些页面首次进入后显示功能提示。
		if (!tipsDoneList.includes(index)) {
			setTimeout(() => {
				if (index === 1) {
					pageTips.init(configSetting, 1);
				} else if (index === 2) {
					pageTips.init(configSetting, 2);
				}
				tipsDoneList.push(index);
			}, 1200);
		}
	};

	/**
	 * 判断某个导航位置是否允许访问。
	 *
	 * 当前规则：
	 * - index=2 队友页：需要 ChampSelect 或 Champion；
	 * - index=3 符文页：需要 ChampSelect 或 Champion；
	 * - 其他页面默认允许。
	 */
	public preventAccess = (index: number) => {
		switch (index) {
			case 2:
				return this.curFlow === "ChampSelect" || this.curFlow === "Champion";
			case 3:
				return this.curFlow === "ChampSelect" || this.curFlow === "Champion";
			default:
				return true;
		}
	};

	/** 处理 None 状态：通常表示客户端空闲或没有进入具体流程。 */
	public handleNone = (id: string) => {
		if (id === this.curFlow) {
			return;
		}
		this.changeState(id, "home", 0);
	};

	/** 处理 Lobby 状态：进入组队房间，切到段位/排位相关页面。 */
	public handleLobby = (id: string) => {
		if (id === this.curFlow) {
			return;
		}
		this.changeState(id, "rank", 1);
	};

	/** 处理 Matchmaking 状态：正在匹配，也保持在段位/排位页面。 */
	public handleMatchmaking = (id: string) => {
		this.changeState(id, "rank", 1);
	};

	/**
	 * 处理 ChampSelect 状态。
	 *
	 * 进入选人阶段后：
	 * - 清空上一局相关 Store；
	 * - 切换到队友页面；
	 * - 查询队友信息；
	 * - 必要时启动 champ-select session 监听。
	 */
	public handleChampSelect = async (id: string) => {
		this.resetStore();
		this.changeState(id, "teammate", 2);
		this.hanleFriendInfo();
	};

	/**
	 * 获取队友数据。
	 *
	 * queryFriendInfo 会通过 LCU 查询选人阶段的队友列表。
	 * 拿到队友列表后，再通过 recordStore.checkFriSum 检查这些召唤师是否有黑名单/标记数据。
	 */
	public hanleFriendInfo = () => {
		const queueId: number = this.queryGameInfo();
		queryFriendInfo(this.islistenSession).then((summonerInfo) => {
			// 第一次进入选人阶段时启动 Rust 端 champ-select session 监听。
			if (!this.islistenSession) {
				this.islistenSession = true;
				invoke("start_champ_select");
				// 如果此时已经能拿到英雄 ID，直接进入 Champion 处理流程。
				if (summonerInfo.champId !== 0) {
					this.handleChampion("Champion", summonerInfo.champId);
				}
			}

			const summonerIdList = summonerInfo.list.map(
				(summoner) => summoner.summonerId,
			);

			// 检查队友是否存在黑名单/标记数据。
			recordStore.checkFriSum(summonerIdList).then((value) => {
				teammateStore.initStore(
					summonerInfo.list,
					queueId,
					value,
					false,
				);

				// 如果发现被标记玩家，延迟切回队友页并提示用户。
				if (value !== null && value.length !== 0) {
					setTimeout(() => {
						this.changeState("Champion", "teammate", 2);
						if (value.length > 1) {
							message.error("点击昵称查看被标记玩家！！！", {
								duration: 5000,
							});
						}
					}, 3000);
				}
			});
		});
	};

	/**
	 * 获取当前对局 queueId。
	 *
	 * gameInfo 由 background/gameFlow.ts 在 ReadyCheck 阶段写入 localStorage。
	 * 如果没有读到，就使用默认的 420/11，避免后续符文查询没有队列信息。
	 */
	public queryGameInfo = () => {
		if (this.curQueueId === -1) {
			const gameInfo = localStorage.getItem("gameInfo");

			if (gameInfo === null) {
				localStorage.setItem(
					"gameInfo",
					String(
						JSON.stringify({
							queueId: 420,
							mapId: 11,
						}),
					),
				);
				return 420;
			} else {
				this.curQueueId = JSON.parse(gameInfo).queueId;
			}
		}
		return this.curQueueId;
	};

	/**
	 * 处理 Champion 状态，即当前英雄已确定或发生变化。
	 *
	 * 这里会调用 runeStore.initStore 加载推荐符文/技能/出装数据，成功后切换到符文页面。
	 */
	public handleChampion = (id: string, content: number) => {
		if (content === 0) {
			return;
		}
		this.curChampId = content;
		const queueId: number = this.queryGameInfo();

		runeStore.initStore(content, queueId).then((res: any) => {
			if (res) {
				message.error("当前英雄暂无符文数据");
				return;
			} else {
				this.changeState(id, "rune", 3);
			}
		});
	};

	/**
	 * 处理 GameStart 状态。
	 *
	 * 游戏开始后重置 queueId 缓存，并切换到战绩/记录页面。
	 */
	public handleGameStart = (id: string) => {
		this.curQueueId = -1;
		this.changeState(id, "record", 4);
	};

	/**
	 * 处理 EndOfGame 状态。
	 *
	 * 对局结束后尝试获取本局参与者信息，用于后续记录/黑名单相关逻辑。
	 */
	public handleEndOfGame = () => {
		this.curChampId = -1;
		if (!messageReactive) {
			messageReactive = message.loading("对局结算数据加载中...", {
				duration: 0,
			});
		}

		recordStore.getParticipantsInfo().then((isSuccess) => {
			messageReactive?.destroy();
			messageReactive = null;

			if (isSuccess === null) {
				return;
			} else if (!isSuccess) {
				message.error("获取数据失败，请到查询战绩添加", {
					closable: true,
					duration: 3000,
				});
			}
		});
	};

	/**
	 * 从其他窗口触发“添加黑名单”后，回到主窗口记录页并加载指定 gameId 的参与者信息。
	 */
	public handleAddBlackList = (gameId: number) => {
		this.changeState("GameStart", "record", 4);
		recordStore.getParticipantsInfo(gameId);
	};
}

const gameState = new GameState();

/**
 * 监听 background/gameFlow.ts 转发给主窗口的游戏状态事件。
 *
 * 这是主窗口最重要的入口事件。
 */
listen<{ messageId: string; content: number }>("clientStatus", (event) => {
	switch (event.payload.messageId) {
		case "None":
			return gameState.handleNone("None");
		case "Lobby":
			return gameState.handleLobby("Lobby");
		case "Matchmaking":
			return gameState.handleMatchmaking("Matchmaking");
		case "ChampSelect":
			return gameState.handleChampSelect("ChampSelect");
		case "Champion":
			return gameState.handleChampion("Champion", event.payload.content);
		case "GameStart":
			return gameState.handleGameStart("GameStart");
		case "EndOfGame":
			return gameState.handleEndOfGame();
		case "AddBlackList":
			return gameState.handleAddBlackList(event.payload.content);
	}
});

// 调试示例：手动模拟当前英雄变化。
// gameState.handleChampion("Champion", 777);

/**
 * 监听其他窗口请求主窗口缓存数据。
 *
 * recentMatchWindow / matchAnalysisWindow 是独立 WebView，不能直接访问 mainWindow 的 Pinia Store。
 * 因此它们通过事件向 mainWindow 请求缓存，再由 mainWindow emitTo 回传。
 */
listen<string>("cacheMatchList", (event) => {
	if (event.payload === "getMatchList") {
		window.Window.getByLabel("recentMatchWindow").then((win) => {
			if (win !== null) {
				emitTo(
					"recentMatchWindow",
					"matchListCache",
					JSON.parse(JSON.stringify(teammateStore.cacheMatchList)),
				);
				// emitTo("recentMatchWindow", "matchListCache", session450);
			}
		});
	} else if (event.payload === "getTeammate") {
		const summonerInfo = JSON.parse(
			JSON.stringify(teammateStore.summonerInfo),
		);
		const cacheMatchList = JSON.parse(
			JSON.stringify(teammateStore.cacheMatchList),
		);

		window.Window.getByLabel("matchAnalysisWindow").then((win) => {
			if (win !== null) {
				emitTo("matchAnalysisWindow", "teammateData", {
					summonerInfo: summonerInfo,
					cacheMatchList: cacheMatchList,
				});
			}
		});
	} else if (event.payload === "getCurChampId") {
		window.Window.getByLabel("recentMatchWindow").then((win) => {
			if (win !== null) {
				emitTo("recentMatchWindow", "curChampId", {
					id: gameState.curChampId,
				});
			}
		});
	}
});
</script>

<template>
	<div class="main bg-neutral-100 dark:bg-neutral-900">
		<!-- 顶部区域：状态、设置、窗口操作等。 -->
		<dashboard :configSetting="configSetting" />
		<!--
			中间区域：根据路由显示 home/rank/teammate/rune/record 等页面。
			keep-alive 会缓存页面组件状态，避免切换页面时每次都重新创建。
		-->
		<router-view v-slot="{ Component }">
			<keep-alive>
				<component :is="Component" />
			</keep-alive>
		</router-view>
		<!-- 底部导航：点击时调用 gameState.navigateToPage。 -->
		<navigation
			:cur-pos="curPos"
			:navigate-to-page="gameState.navigateToPage"
		/>
	</div>
</template>

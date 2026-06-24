import { defineStore } from "pinia";
import { champDict } from "@/resources/champList";
import { RuneStoreActions, RuneStoreState } from "@/main/views/rune/runeTypes";
import { QueryRune } from "@/main/views/rune/queryRune";

// QueryRune 负责请求/整理外部符文推荐数据。
// Store 只负责保存页面状态和触发数据加载，不直接关心请求细节。
const queryRune = new QueryRune();

/**
 * 符文页面的 Pinia Store。
 *
 * 对 WPF/MVVM 经验来说，可以把它类比成符文页面共享的 ViewModel：
 * - state 相当于可绑定属性；
 * - actions 相当于命令/业务方法；
 * - 页面组件通过 useRuneStore() 读取状态并触发 action。
 */
export const useRuneStore = defineStore<
	"useRuneStore",
	RuneStoreState,
	{},
	RuneStoreActions
>("useRuneStore", {
	state: () => {
		return {
			/** 当前英雄 ID，来自 LCU current-champion 或 champ-select session。 */
			currentChamp: 0,
			/** 当前英雄头像 URL。 */
			currentChampImgUrl: "",
			/** 当前英雄英文/拼音 alias，用于请求推荐数据和拼接资源 URL。 */
			currentChampAlias: "",
			/** 当前英雄中文称号。 */
			currentChampTitle: "",
			/** 推荐符文列表。 */
			runeDataList: [],
			/** 推荐装备/出装数据。 */
			blockDataList: [],
			/** 推荐技能加点顺序。 */
			skillsList: [],
			/** 极地/斗魂等特殊模式下的装备列表。 */
			hexItemList: [],
			/** 特殊模式下的强化/海克斯推荐。 */
			hexAugments: null,
		};
	},
	actions: {
		/**
		 * 根据英雄 ID 映射英雄基础信息。
		 *
		 * champDict 是本地英雄字典，键是 championId。
		 */
		mapChampInfo(champId: number) {
			this.currentChamp = champId;
			this.currentChampImgUrl = `https://game.gtimg.cn/images/lol/act/img/champion/${champDict[champId].alias}.png`;
			this.currentChampAlias = champDict[champId].alias;
			this.currentChampTitle = champDict[champId].title;
		},

		/**
		 * 初始化符文页面数据。
		 *
		 * @param champId 当前英雄 ID
		 * @param queueId 当前队列 ID，不同模式的推荐数据不同
		 * @returns false 表示成功或无需更新，true 表示加载失败
		 */
		async initStore(champId: number, queueId: number) {
			// 如果英雄相同，说明已有数据，不重复请求。
			if (champId === this.currentChamp) {
				return false;
			}
			// 如果切换了英雄，先清空旧英雄的符文/装备/技能数据。
			if (this.runeDataList.length !== 0) {
				this.$reset();
			}

			this.mapChampInfo(champId);

			// queueId=2400 是项目中特殊处理的海克斯/特殊模式。
			// 该模式使用 getHexInfo，而不是常规符文推荐接口。
			if (queueId === 2400) {
				const hexInfo = await queryRune.getHexInfo(this.currentChampAlias);
				if (hexInfo !== null) {
					this.skillsList = hexInfo.skillsList;
					this.hexItemList = hexInfo.itemList;
					this.hexAugments = hexInfo.augments;
					return false;
				}
			}

			// 常规模式：按英雄 alias + queueId 请求推荐符文、技能和装备数据。
			const runesData = await queryRune.getRunesData(
				this.currentChampAlias,
				queueId,
			);
			if (runesData !== null) {
				this.skillsList = runesData.skillsList;
				this.runeDataList = runesData.runeDataList;
				this.blockDataList = runesData.blockDataList;
				return false;
			} else {
				return true;
			}
		},
	},
});

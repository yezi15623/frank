import { requestFetch } from "@/main/utils/request";
import { mapNameFromUrl } from "@/resources/champList";
import { Block, OnlineRunes } from "@/main/views/rune/runeTypes";

/** 技能图标与技能按键的二元组，例如 [Q技能图标URL, "Q"]。 */
type SkillTuple = [icon: string, key: string];

/**
 * 符文/出装推荐数据查询类。
 *
 * 这个类不直接访问 LCU，而是访问项目作者维护的远程 JSON 数据：
 * - op.gg/{alias}.json：常规模式数据；
 * - op.gg-aram/{alias}.json：极地大乱斗数据；
 * - hex/{alias}.json：海克斯/特殊模式数据。
 *
 * Store 调用 QueryRune 后，把整理好的技能、符文、出装数据保存到 Pinia。
 */
export class QueryRune {
	/** 当前队列 ID。不同队列使用不同的数据源或位置映射。 */
	public queueId = 0;

	/**
	 * 当天零点时间戳，用于拼到 URL 上做缓存刷新。
	 * 这样每天会请求一次新 URL，避免浏览器/HTTP 缓存一直命中旧数据。
	 */
	public timestamp = new Date(new Date().toDateString()).getTime();

	/**
	 * 获取海克斯/特殊模式推荐数据。
	 */
	public getHexInfo = async (alias: string) => {
		try {
			const baseUrl = "https://frank-1304009809.cos.ap-chongqing.myqcloud.com";
			const res = await requestFetch<any>(
				`${baseUrl}/hex/${alias}.json?date=${this.timestamp}`,
				"GET",
			);
			if (res === null) return null;

			const hexI = res;
			const skillsList = this.getSkillsImgUrl(hexI.skillsImg, hexI.skills);
			return {
				skillsList: skillsList,
				itemList: hexI.items,
				augments: hexI.augments,
			};
		} catch (_e) {
			return null;
		}
	};

	/**
	 * 获取某个英雄的在线推荐数据。
	 *
	 * @param alias 英雄 alias，例如 Yasuo、Ahri 等。
	 * @returns 多个位置/玩法的推荐数据列表。
	 */
	public getChampInfo = async (alias: string): Promise<OnlineRunes[]> => {
		const baseUrl = "https://frank-1304009809.cos.ap-chongqing.myqcloud.com";
		if (this.queueId === 450) {
			// 450 通常对应极地大乱斗，使用单独的 ARAM 数据源。
			const res = await requestFetch<any>(
				`${baseUrl}/op.gg-aram/${alias}.json?date=${this.timestamp}`,
				"GET",
			);
			return res === null ? [] : res;
		} else {
			const res = await requestFetch<any>(
				`${baseUrl}/op.gg/${alias}.json?date=${this.timestamp}`,
				"GET",
			);
			return res === null ? [] : res;
		}
	};

	/**
	 * 把技能图片文件名和技能按键转换成页面可直接显示的数据。
	 */
	public getSkillsImgUrl = (skillsImg: any, skills: any): SkillTuple[] => {
		return skillsImg.map((img: string, i: number): string[][] => [
			`https://game.gtimg.cn/images/lol/act/img/spell/${img}`,
			skills[i],
		]);
	};

	/**
	 * 获取并整理符文页面需要的所有数据。
	 *
	 * 输出包含：
	 * - skillsList：技能加点；
	 * - runeDataList：可应用到 LCU 的符文数据；
	 * - blockDataList：可写入客户端的推荐出装数据。
	 */
	public getRunesData = async (alias: string, queueId: number) => {
		try {
			this.queueId = queueId;
			const champInfo: OnlineRunes[] = await this.getChampInfo(alias);

			// 取第一个推荐玩法的技能数据作为技能加点展示。
			const skillsList = this.getSkillsImgUrl(
				champInfo[0].skillsImg,
				champInfo[0].skills,
			);
			const runeDataList = [];
			const blockDataList = [];

			for (const champ of champInfo) {
				// 汇总不同位置/玩法下的符文推荐。
				for (const rune of champ.runes) {
					if (queueId === 450) {
						rune.position = "aram";
					}
					runeDataList.push(rune);
				}

				// 整理该位置/玩法下的出装推荐。
				// 深拷贝是为了避免 getBlocksData 修改原始 champ 数据。
				const block = this.getBlocksData(JSON.parse(JSON.stringify(champ)));
				if (block !== null) {
					blockDataList.push(block);
				}
			}
			return { skillsList, runeDataList, blockDataList };
		} catch (_e) {
			return null;
		}
	};

	/**
	 * 把远程推荐出装数据转换成客户端/页面需要的结构。
	 */
	public getBlocksData = (champ: OnlineRunes) => {
		try {
			// queueId=12 在项目里也被特殊映射为 aram 展示。
			if (this.queueId === 12) {
				champ.position = "aram";
			}
			const position = this.getPosition(champ.position);
			const buildItems = champ.itemBuilds[0];
			const name =
				mapNameFromUrl[champ.alias].label +
				"-" +
				mapNameFromUrl[champ.alias].name;

			// 写入客户端的出装标题，方便用户知道这份出装来自 Frank 推荐。
			buildItems.title = name + " 推荐出装 " + "lolfrank.cn";
			buildItems.blocks = this.handleBlocks(buildItems.blocks);
			return {
				position: position as string,
				buildItems: buildItems,
				ps: champ.position,
			};
		} catch (_e) {
			return null;
		}
	};

	/**
	 * 过滤并翻译出装分组。
	 *
	 * 这里只保留 Starter 和 Core 两类，减少写入客户端的出装复杂度。
	 */
	public handleBlocks = (blocks: Block[]) => {
		const blocksResult: Block[] = [];
		for (const block of blocks) {
			if (block.type.indexOf("Starter") !== -1) {
				blocksResult.push(
					this.translateTitle(block, "Starter Items,", "出门:"),
				);
			} else if (block.type.indexOf("Core") !== -1) {
				blocksResult.push(this.translateTitle(block, "Core Items,", "核心:"));
			}
		}
		return blocksResult;
	};

	/**
	 * 将 OP.GG 风格的英文标题翻译成中文，并限制物品数量。
	 */
	public translateTitle = (block: Block, english: string, chinese: string) => {
		block.type = block.type
			.replace(english, chinese)
			.replace("Pick", "选择次数")
			.replace("Win Rate", "胜率");
		// 页面和客户端出装栏只保留前三个物品，避免一组过长。
		if (block.items.length > 3) {
			block.items = block.items.slice(0, 3);
		}
		return block;
	};

	/**
	 * 把英文分路转换成中文显示。
	 */
	public getPosition = (pos: string) => {
		switch (pos) {
			case "middle":
				return "中单";
			case "top":
				return "上单";
			case "support":
				return "辅助";
			case "jungle":
				return "打野";
			case "bottom":
				return "射手";
			case "aram":
				return "极地";
			case "mid":
				return "中单";
		}
	};
}

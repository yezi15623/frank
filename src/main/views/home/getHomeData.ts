import {
	queryRankPoint,
	querySummonerInfo,
	querySummonerHonorLevel,
	queryMasteryChampList,
} from "@/lcu/aboutSummoner";

/**
 * 获取首页需要展示的完整召唤师信息。
 *
 * 首页展示的数据来自多个 LCU 接口：
 * - querySummonerInfo：当前召唤师基础信息，头像、昵称、等级等；
 * - queryRankPoint：单双排、灵活、云顶等段位信息；
 * - querySummonerHonorLevel：荣誉等级；
 * - queryMasteryChampList：英雄熟练度列表。
 *
 * 这里先查询基础信息，如果客户端未启动或未登录会返回 null；
 * 基础信息存在后，再并行查询段位、荣誉和熟练度，以减少首页加载时间。
 */
export const getCurrentSummonerAllInfo = async () => {
	const summonerInfo = await querySummonerInfo();

	if (summonerInfo === null) {
		return null;
	}

	const [rankList, honorData, champLevel] = await Promise.all([
		queryRankPoint(),
		querySummonerHonorLevel(),
		queryMasteryChampList(),
	]);

	// 首页模板把 rankList[3] 当作荣誉等级展示，所以这里把 honorData 追加进去。
	rankList.push(honorData);
	return { summonerInfo, rankList, champLevel };
};

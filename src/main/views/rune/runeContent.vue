<script setup lang="ts">
import { NSpace, NTag, useMessage, NScrollbar } from "naive-ui";
import { Rune } from "@/main/views/rune/runeTypes";
import { mapNameFromUrl } from "@/resources/champList";
import { handleRunesWrite } from "@/main/views/rune/runes";

const message = useMessage();
const { runeList } = defineProps<{ runeList: Rune[] }>();

/**
 * 应用一套符文。
 *
 * runeList 中的 rune 数据来自远程推荐或官方数据源；
 * 写入 LCU 前需要复制一份，避免直接修改 props 中的对象。
 */
const applyRune = async (data: any) => {
	const tempData = JSON.parse(JSON.stringify(data));
	// LCU 创建符文页时需要 name 字段，这里按英雄中文名 + 来源后缀命名。
	tempData.name = mapNameFromUrl[data.alias].name + " lolfrank.cn";

	handleRunesWrite(tempData).then((writeRes) => {
		if (writeRes) {
			message.success("符文数据写入成功");
		} else {
			message.error("符文配置失败，或许没有符文页");
		}
	});
};

/** 获取本地符文图标资源路径。 */
const getImgUrl = (imgId: any) => {
	return new URL(`/src/assets/runes/${imgId}.png`, import.meta.url).href;
};

/** 英文/接口位置名转中文展示名。 */
const getPosition = (pos: string) => {
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
</script>

<template>
	<n-scrollbar
		style="height: 442px; padding-right: 0.5px"
		content-style="padding:0px 12px;"
	>
		<div class="flex flex-col">
			<n-space justify="space-between" :size="[0, 29]">
				<!-- 每个 rune 渲染成一张紧凑符文卡片。 -->
				<div v-for="rune in runeList">
					<div
						class="runeDivDash dark:border-gray-700"
						style="width: 100px; padding: 8px 10px 9px"
					>
						<n-space :size="[0, 0]" justify="space-between" class="px-1.5">
							<!-- 主系 4 个符文。 -->
							<n-space vertical align="center" :size="[0, 10]">
								<img :src="getImgUrl(rune.selectedPerkIds[0])" class="runImg" />
								<img :src="getImgUrl(rune.selectedPerkIds[1])" class="runImg" />
								<img :src="getImgUrl(rune.selectedPerkIds[2])" class="runImg" />
								<img :src="getImgUrl(rune.selectedPerkIds[3])" class="runImg" />
							</n-space>
							<!-- 副系 2 个符文 + 3 个小符文。 -->
							<n-space vertical align="center" :size="[0, 10]">
								<img :src="getImgUrl(rune.selectedPerkIds[4])" class="runImg" />
								<img :src="getImgUrl(rune.selectedPerkIds[5])" class="runImg" />
								<div class="flex flex-col">
									<img :src="getImgUrl(rune.selectedPerkIds[6])" class="runImgSondary" />
									<img :src="getImgUrl(rune.selectedPerkIds[7])" class="runImgSondary" />
									<img :src="getImgUrl(rune.selectedPerkIds[8])" class="runImgSondary" />
								</div>
							</n-space>
						</n-space>

						<n-space class="mt-1" justify="space-between">
							<n-tag :bordered="false" type="info">
								{{ getPosition(rune.position) }}
							</n-tag>
							<n-tag
								:bordered="false"
								type="success"
								style="cursor: pointer"
								@click="applyRune(rune)"
							>
								应用
							</n-tag>
						</n-space>
					</div>
				</div>
			</n-space>
		</div>
	</n-scrollbar>
</template>

<style scoped>
.runImg {
	width: 30px;
	height: 30px;
	display: block;
}

.runImgSondary {
	width: 25px;
	height: 25px;
}
</style>

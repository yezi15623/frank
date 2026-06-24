import { createRouter, createWebHashHistory } from "vue-router";

/**
 * 自动扫描 views 目录下的页面组件。
 *
 * 匹配范围：../views/**/index.vue
 * 例如：
 * - ../views/home/index.vue  -> /home
 * - ../views/rune/index.vue  -> /rune
 * - ../views/teammate/index.vue -> /teammate
 *
 * 这种写法避免每新增一个页面都手动 import 和注册路由。
 */
// @ts-ignore
const pageComps = import.meta.glob("../views/**/index.vue");

/**
 * 把扫描到的组件路径转换成 Vue Router 路由表。
 *
 * component 是 Object.entries 后的二元组：
 * - component[0]：文件路径字符串
 * - component[1]：动态 import 函数
 */
const routes: any[] = Object.entries(pageComps).map((component) => {
	// 从 ../views/home/index.vue 中提取 home。
	const regex = /\/(\w+)\/\w+\.vue/;
	const match = component[0].match(regex);
	const pathText = match?.[1];
	return {
		path: "/" + pathText,
		name: pathText,
		component: component[1],
	};
});

const router = createRouter({
	// Tauri 桌面应用里使用 hash 路由更稳，不依赖服务端 history fallback。
	history: createWebHashHistory(""),
	routes: [
		{
			path: "/",
			redirect: "/home",
		},
	].concat(routes),
});

export default router;

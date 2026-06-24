import "./style.css";
// @ts-ignore
import App from "./main.vue";
import { createApp } from "vue";

// recentMatchWindow 的 Vue 入口。
// 该窗口由 background/gameFlow.ts 在游戏开始后按配置创建，主要用于游戏内展示双方近期战绩。
createApp(App).mount("#app");

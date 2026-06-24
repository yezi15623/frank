import "./style.css";
// @ts-ignore
import App from "./main.vue";
import router from "./router";
import { createApp } from "vue";
import { createPinia } from "pinia";

// mainWindow 的 Vue 应用入口。
// 挂载顺序：根组件 App -> Vue Router -> Pinia -> #app。
// 对 WPF/MVVM 来说，Pinia 可以类比全局 ViewModel/状态容器，Router 可以类比页面导航服务。
createApp(App).use(router).use(createPinia()).mount("#app");

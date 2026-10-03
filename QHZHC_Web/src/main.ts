import Vue from "vue";
import axios from "axios";
import * as echarts from "echarts";
import ElementUI from "element-ui";
import "element-ui/lib/theme-chalk/index.css";
import "qweather-icons/font/qweather-icons.css";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import { monitorPlugin } from "@/plugins/monitor";
import "./assets/css/reset.scss";
import "./assets/icon/iconfont.css";
import "./assets/weather-icon/iconfont.css";
import "@/assets/weather-icon/iconfont.js";
import "./assets/css/text.css";
import "./assets/css/global.scss";
import "./assets/css/map-runtime-fixes.scss";

Vue.config.productionTip = false;
Vue.prototype.$axios = axios;
Vue.prototype.$echarts = echarts;
Vue.use(ElementUI);
// 监控在 Vue.use 阶段注册路由钩子，早于 vue-router 的首次导航，
// 因此直接刷新进入采集页也能被 afterEach 捕获。
Vue.use(monitorPlugin, {
  router,
  enabled: process.env.VUE_APP_MONITOR_ENABLED === "true",
  dsn: process.env.VUE_APP_MONITOR_DSN ?? "",
  appName: process.env.VUE_APP_MONITOR_APP_NAME ?? "qhzhc",
  release: process.env.VUE_APP_MONITOR_RELEASE ?? "1.0.0",
  environment: "production",
});

new Vue({
  router,
  store,
  render: (createElement) => createElement(App),
  beforeCreate() {
    Vue.prototype.$bus = this;
  },
}).$mount("#app");

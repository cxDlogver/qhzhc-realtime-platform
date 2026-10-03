declare module "*.vue" {
  import Vue from "vue";
  export default Vue;
}

declare module "*.scss";
declare module "*.css";
declare module "@/assets/weather-icon/iconfont.js";

declare module "vue/types/vue" {
  interface Vue {
    $axios: typeof import("axios").default;
    $echarts: typeof import("echarts");
    $bus: Vue;
    /** 监控未启用或未处于采集路由时为 null。 */
    $monitor: import("cx-browser-monitor-sdk").Monitor | null;
  }
}

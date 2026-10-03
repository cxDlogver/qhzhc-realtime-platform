import { createMonitor, type Monitor, type MonitorOptions } from "cx-browser-monitor-sdk";
import type { PluginObject } from "vue";
import type VueRouter from "vue-router";

/**
 * 走航车前端监控接入：把 browser-monitor SDK 包装成 Vue 2 插件。
 *
 * 职责边界：
 * - 插件只负责「创建实例 + 按路由开关 + 视图命名 + 暴露实例」，不自己拼 HTTP、
 *   不重复实现计时与队列，采集语义全部交给 SDK。
 * - 数据直送 browser-monitor 平台（平台自带投影、评分、聚合与看板），走航车侧不落库。
 * - 采集范围仅登录后的数据可视化页面，其他路由不采集。
 * - 任何监控异常都必须在此吞掉，绝不能冒泡到业务调用栈，也不能改变业务返回值。
 *
 * 两个必须知道的取舍：
 * 1. SDK 会清洗掉 URL 的 query 与 hash，而走航车使用 hash 路由，
 *    因此默认 routeName 恒为 "/"，必须显式调用 setViewName，平台才能按页面区分。
 * 2. 离开采集页时延后一个宏任务再销毁：这样 SDK 能先处理本次 hash 变化并产出
 *    完整的 view.end（否则访问时长缺失、样本只能等平台 5 分钟超时兜底）。
 *    代价是会多出一条相邻路由的空 view，这里已把它命名为真实路由，
 *    可在平台侧按 routeName 过滤。
 */

/** 采集生效的路由：仅登录后的数据可视化页面。 */
const DEFAULT_WATCHED_ROUTES: readonly string[] = ["/dataVisualization"];

export interface MonitorPluginOptions {
  /** vue-router 实例，用于按路由控制采集范围。 */
  router: VueRouter;
  /** 总开关；关闭时插件不创建任何实例，业务零感知。 */
  enabled: boolean;
  /** 平台项目的写入地址，形如 http://host:8080/api/v3/ingest/<publicKey>/envelopes。 */
  dsn: string;
  /** 必须与监控平台上项目的 appName 完全一致，否则上报会被逐条拒绝。 */
  appName: string;
  /** 应用版本，平台按版本维度聚合。 */
  release: string;
  /** 环境名，如 development / production。 */
  environment: string;
  /** 覆盖默认采集路由。 */
  watchedRoutes?: readonly string[];
}

function buildMonitorOptions(options: MonitorPluginOptions): MonitorOptions {
  return {
    app: {
      name: options.appName,
      version: options.release,
      environment: options.environment,
    },
    view: {
      resolveRouteName: ({ pathname }) => pathname,
    },
    performance: {
      enabled: true,
      metrics: { LCP: true, FCP: true, INP: true, CLS: true, FPS: true, LoAF: true },
      webVitals: {
        // 每次指标变化都上报。关闭时 Web Vitals 只在「页面隐藏 / 用户交互 / 软导航切换」
        // 这些终态时机回调，而大屏看板可能长时间无人交互，LCP、CLS 会迟迟不出现。
        // 平台按 sampleId + sequence 原位修订同一样本，多次上报不会被重复计数。
        reportAllChanges: true,
        // 软导航保持关闭：从登录页进入可视化页是 hash 软导航，开启后
        // 「相对软导航起点」的 LCP 会与硬导航 LCP 混进同一分布，污染 p75 与良好率。
        reportSoftNavs: false,
      },
      // FPS 与 LoAF 沿用 SDK 默认采样：窗口 5s、间隔 30s、长任务 50ms 起、
      // 每 View 最多 20 条。大屏实时渲染场景不需要更高频率。
    },
    transport: {
      dsn: options.dsn,
      // 走航车数据量很小，把周期冲刷收紧到 3 秒：队列为空时不会产生任何请求，
      // 有数据时最多 3 秒就能在平台看到，便于验证与排障。
      flushIntervalMs: 3000,
    },
  };
}

export const monitorPlugin: PluginObject<MonitorPluginOptions> = {
  install(Vue, options) {
    const settings = options;
    if (!settings) return;

    let current: Monitor | null = null;
    let pendingStop: ReturnType<typeof setTimeout> | null = null;

    // 与 $axios / $echarts 保持同样的注入风格；未采集时读到 null。
    Object.defineProperty(Vue.prototype, "$monitor", {
      configurable: true,
      get: (): Monitor | null => current,
    });

    if (!settings.enabled || !settings.dsn || !settings.router) return;

    const watched = settings.watchedRoutes ?? DEFAULT_WATCHED_ROUTES;

    const cancelPendingStop = (): void => {
      if (pendingStop === null) return;
      clearTimeout(pendingStop);
      pendingStop = null;
    };

    const teardown = (): void => {
      if (!current) return;
      const monitor = current;
      current = null;
      try {
        // destroy 内部会用 Beacon 做最后一次冲刷，并清空内存队列。
        monitor.destroy();
      } catch (_error) {
        // 监控异常不得影响业务。
      }
    };

    const startFor = (path: string): void => {
      if (!current) {
        try {
          current = createMonitor(buildMonitorOptions(settings));
        } catch (_error) {
          // 初始化失败（如 DSN 非法）时保持 null，后续路由不再重试创建以外的逻辑。
          current = null;
          return;
        }
      }
      try {
        // 先命名再启动：SDK 在 start 阶段创建首个 view，此时 setName 会作为待生效名称写入，
        // 避免平台侧先落一条 routeName 为 "/" 的 view.start。
        current.setViewName(path);
        current.start();
      } catch (_error) {
        // 监控异常不得影响业务。
      }
    };

    // SDK 在 hash 变化时会自行结束并新建 view，但新 view 的 routeName 会回退为 "/"
    // （hash 已被 SDK 清洗）。这里在每个 hash 变化后补一次命名，使页内切换同样可区分。
    const syncViewName = (): void => {
      if (!current) return;
      try {
        current.setViewName(settings.router.currentRoute.path || "/");
      } catch (_error) {
        // 监控异常不得影响业务。
      }
    };
    window.addEventListener("hashchange", () => {
      setTimeout(syncViewName, 0);
    });

    settings.router.afterEach((to) => {
      const path = to && to.path ? to.path : "/";
      cancelPendingStop();

      if (watched.indexOf(path) !== -1) {
        startFor(path);
        return;
      }

      if (!current) return;

      // 延后一个宏任务：让 SDK 先处理本次 hash 变化以产出 view.end，
      // 再把新建的相邻路由 view 命名为真实路由，便于平台侧过滤。
      pendingStop = setTimeout(() => {
        pendingStop = null;
        if (!current) return;
        try {
          current.setViewName(path);
        } catch (_error) {
          // 监控异常不得影响业务。
        }
        teardown();
      }, 0);
    });
  },
};

export default monitorPlugin;

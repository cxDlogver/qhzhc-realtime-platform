const DEFAULT_BACKEND_PORT = "18080";
const DEFAULT_BACKEND_HOST = "127.0.0.1";
/** vue.config.js 中 devServer.port，该端口由 devServer.proxy 代理到后端 */
const DEV_SERVER_PORT = "9527";

function localHostname(hostname: string | undefined): string {
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? hostname
    : DEFAULT_BACKEND_HOST;
}

/**
 * WebSocket 握手不受同源策略限制，因此始终直连后端，不经过 devServer 代理：
 * devServer 只代理 REST API，且 "/ws" 已被 webpack-dev-server 的 HMR 端点占用。
 */
export function resolveWebSocketBaseUrl(
  configuredBaseUrl = process.env.VUE_APP_API_BASE_URL,
  runtimeLocation: Location | null = typeof window === "undefined"
    ? null
    : window.location,
): string {
  if (String(configuredBaseUrl || "").trim()) {
    return resolveApiBaseUrl(configuredBaseUrl, runtimeLocation).replace(/^http/, "ws");
  }
  const protocol = runtimeLocation?.protocol === "https:" ? "wss://" : "ws://";
  const hostname = localHostname(runtimeLocation?.hostname);
  return `${protocol}${hostname}:${DEFAULT_BACKEND_PORT}`;
}

export function resolveApiBaseUrl(
  configuredBaseUrl = process.env.VUE_APP_API_BASE_URL,
  runtimeLocation: Location | null = typeof window === "undefined"
    ? null
    : window.location,
): string {
  const configured = String(configuredBaseUrl || "").trim();
  if (configured) {
    if (!runtimeLocation) return configured.replace(/\/$/, "");
    try {
      const url = new URL(configured);
      if (
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        ["localhost", "127.0.0.1"].includes(runtimeLocation.hostname)
      ) {
        url.hostname = runtimeLocation.hostname;
      }
      return url.toString().replace(/\/$/, "");
    } catch (_error) {
      return configured.replace(/\/$/, "");
    }
  }

  // 开发服务器已配置 devServer.proxy，使用相对地址即为同源请求，不会产生跨域。
  if (runtimeLocation?.port === DEV_SERVER_PORT) return "";

  const protocol = runtimeLocation?.protocol
    ? `${runtimeLocation.protocol}//`
    : "http://";
  const hostname = localHostname(runtimeLocation?.hostname);
  return `${protocol}${hostname}:${DEFAULT_BACKEND_PORT}`;
}

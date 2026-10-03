import type { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import type { AccessTokenManager } from "./accessToken";

export interface RetriableRequestConfig extends AxiosRequestConfig {
  _authRetry?: boolean;
}

interface HttpClient {
  request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}

const NON_REFRESHABLE_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
]);

function requestPath(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url, "http://local.test").pathname;
  } catch {
    return url;
  }
}

export function applyAccessToken(
  config: RetriableRequestConfig,
  accessToken: string | null
): RetriableRequestConfig {
  if (!accessToken) return config;
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

/**
 * 创建 401 的兜底处理器：能用刷新凭证救回来的请求就透明重试一次，救不回来的直接结束会话。
 *
 * 一个请求最多被重试一次，重试由 `_authRetry` 标记控制，因此不会形成
 * 「401 → 刷新 → 再 401 → 再刷新」的死循环。
 *
 * @param client 用于重放原请求的 axios 实例；重试走 client.request 而非原实例的拦截器链。
 * @param manager Access Token 的读写入口；内部用共享的 refreshPromise 合并同页内的并发刷新。
 * @param onUnauthenticated 认证彻底不可恢复时的回调（清理登录态 + 跳转登录页）。
 * @returns 处理函数：成功时 resolve 成重试后的响应，失败时 reject 原始错误或刷新错误。
 */
export function createAuthErrorHandler(
  client: HttpClient,
  manager: AccessTokenManager,
  onUnauthenticated: () => void | Promise<void>
): (error: AxiosError) => Promise<AxiosResponse> {
  return async (error) => {
    const config = error.config as RetriableRequestConfig | undefined;
    const path = requestPath(config?.url);
    // 已经重试过仍 401 ⇒ 新换来的 Access Token 也不被接受，刷新这条路走不通了，
    // 不能再退避重试，否则会把一次登出放大成持续的请求风暴。
    if (error.response?.status === 401 && config?._authRetry) {
      manager.clearAccessToken();
      await onUnauthenticated();
      return Promise.reject(error);
    }
    // 三类请求直接放弃：非 401（不是认证问题）、拿不到 config（无法重放）、
    // 登录 / 注册 / 刷新本身（刷新它们只会循环，密码错误也不属于认证失效）。
    if (error.response?.status !== 401 || !config || NON_REFRESHABLE_PATHS.has(path)) {
      return Promise.reject(error);
    }

    try {
      // 并发的多个 401 会在这里共享同一次刷新，不会出现重复提交同一个 Refresh Token。
      const accessToken = await manager.refreshAccessToken();
      // 打上 _authRetry 再重放：新 Token 仍失败时靠这个标记终止循环。
      const retryConfig = applyAccessToken({ ...config, _authRetry: true }, accessToken);
      return client.request(retryConfig);
    } catch (refreshError) {
      // 刷新失败说明 Refresh Token 已过期 / 撤销 / 重放，只能清空内存凭证并交回上层结束会话。
      manager.clearAccessToken();
      await onUnauthenticated();
      // 抛出刷新错误而非原始 401：原始 401 只是症状，真正的失败原因在这里。
      return Promise.reject(refreshError);
    }
  };
}

import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { Message } from "element-ui";
import { accessTokenManager } from "@/services/accessToken";
import { applyAccessToken, createAuthErrorHandler } from "@/services/httpAuth";
import { resolveApiBaseUrl } from "./apiBaseUrl";

const service = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
  timeout: 30_000,
});

service.interceptors.request.use((config: AxiosRequestConfig) => {
  return applyAccessToken(config, accessTokenManager.getAccessToken());
});

let unauthenticatedHandler: () => void | Promise<void> = () => undefined;

export function setUnauthenticatedHandler(handler: () => void | Promise<void>): void {
  unauthenticatedHandler = handler;
}

export async function handleUnauthenticated(): Promise<void> {
  localStorage.removeItem("user");
  await unauthenticatedHandler();
}

const handleAuthError = createAuthErrorHandler(
  service,
  accessTokenManager,
  handleUnauthenticated
);

service.interceptors.response.use(
  (response) => response,
  async (rawError: AxiosError<{ message?: string; detail?: string }>) => {
    if (rawError.response?.status === 401) {
      return handleAuthError(rawError);
    } else {
      Message.error(
        rawError.response?.data?.message || rawError.response?.data?.detail || rawError.message
      );
    }
    return Promise.reject(rawError);
  }
);

export default service;

import axios from "axios";
import { resolveApiBaseUrl } from "@/utils/apiBaseUrl";

export interface AccessTokenResponse {
  accessToken: string;
  accessTokenExpiresAt: number;
}

export interface AccessTokenManager {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  clearAccessToken(): void;
  refreshAccessToken(): Promise<string>;
}

export function createAccessTokenManager(
  refreshRequest: () => Promise<AccessTokenResponse>,
): AccessTokenManager {
  let accessToken: string | null = null;
  let refreshPromise: Promise<string> | null = null;

  return {
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
    clearAccessToken: () => {
      accessToken = null;
    },
    refreshAccessToken: () => {
      if (!refreshPromise) {
        refreshPromise = refreshRequest()
          .then((response) => {
            accessToken = response.accessToken;
            return response.accessToken;
          })
          .catch((error) => {
            accessToken = null;
            throw error;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }
      return refreshPromise;
    },
  };
}

const refreshClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
  timeout: 10_000,
});

export const accessTokenManager = createAccessTokenManager(async () => {
  const response = await refreshClient.post<AccessTokenResponse>("/api/auth/refresh");
  return response.data;
});

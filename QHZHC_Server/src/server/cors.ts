/**
 * 跨域策略。
 *
 * 开发环境下前端 devServer 通过代理访问后端，理论上不会产生跨域请求；
 * 但以下场景仍然需要后端返回 CORS 头：
 * - 直接以 `http://<host>:18080` 作为 API 地址联调（未走代理）；
 * - 通过局域网 IP / 其他端口打开前端；
 * - 生产部署时静态资源与 API 不同源。
 *
 * 允许的来源由 `CORS_ALLOWED_ORIGINS` 控制：
 * - `*` ：允许任意来源，此时不会返回 `Access-Control-Allow-Credentials`；
 * - `https://a.test,http://b.test:9527`：显式白名单，支持携带凭证；
 * - 未配置：开发环境放开本机 http(s) 调试来源，生产环境仅允许同源（不返回 ACAO）。
 */
import type { NextFunction, Request, Response } from "express";

const DEV_LOOPBACK_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const DEFAULT_MAX_AGE_SECONDS = 86_400;
const ALLOWED_HEADERS = "Authorization, Content-Type, X-Requested-With";
const ALLOWED_METHODS = "GET, HEAD, POST, PATCH, OPTIONS";

export interface CorsPolicy {
  /** 允许任意来源 */
  allowAnyOrigin: boolean;
  /** 允许本机 http(s) 调试来源 */
  allowDevLoopback: boolean;
  /** 是否允许浏览器携带凭证（Cookie / Authorization 之外的凭据） */
  allowCredentials: boolean;
  /** 显式白名单 */
  origins: Set<string>;
  maxAgeSeconds: number;
  allowedHeaders: string;
  allowedMethods: string;
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function splitOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeOrigin(value.replace(/\/\*$/, "")));
}

export function resolveCorsPolicy(): CorsPolicy {
  const base = {
    maxAgeSeconds: DEFAULT_MAX_AGE_SECONDS,
    allowedHeaders: ALLOWED_HEADERS,
    allowedMethods: ALLOWED_METHODS,
  };
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? "").trim();

  if (configured === "*") {
    // 允许任意来源时浏览器会拒绝凭证请求，因此二者互斥
    return {
      ...base,
      allowAnyOrigin: true,
      allowDevLoopback: false,
      allowCredentials: false,
      origins: new Set(),
    };
  }

  const explicit = configured ? splitOrigins(configured) : [];
  if (explicit.length > 0) {
    return {
      ...base,
      allowAnyOrigin: false,
      allowDevLoopback: false,
      allowCredentials: true,
      origins: new Set(explicit),
    };
  }

  return {
    ...base,
    allowAnyOrigin: false,
    allowDevLoopback: process.env.NODE_ENV !== "production",
    allowCredentials: true,
    origins: new Set(),
  };
}

function allowOriginFor(origin: string, policy: CorsPolicy): string | null {
  if (policy.allowAnyOrigin) return "*";
  if (policy.origins.has(origin)) return origin;
  if (policy.allowDevLoopback && DEV_LOOPBACK_PATTERN.test(origin)) return origin;
  return null;
}

function appendVary(response: Response): void {
  const current = response.getHeader("Vary");
  const values = new Set<string>();
  if (typeof current === "string" || typeof current === "number") {
    for (const value of String(current).split(",")) {
      if (value.trim()) values.add(value.trim());
    }
  } else if (Array.isArray(current)) {
    for (const value of current) values.add(String(value).trim());
  }
  values.add("Origin");
  response.setHeader("Vary", [...values].join(", "));
}

export function createCorsMiddleware(policy: CorsPolicy = resolveCorsPolicy()) {
  return function corsMiddleware(request: Request, response: Response, next: NextFunction): void {
    const origin = request.headers.origin;
    if (typeof origin === "string") {
      const allowed = allowOriginFor(normalizeOrigin(origin), policy);
      if (allowed) {
        response.setHeader("Access-Control-Allow-Origin", allowed);
        appendVary(response);
        if (policy.allowCredentials) {
          response.setHeader("Access-Control-Allow-Credentials", "true");
        }
        response.setHeader("Access-Control-Allow-Headers", policy.allowedHeaders);
        response.setHeader("Access-Control-Allow-Methods", policy.allowedMethods);
        response.setHeader("Access-Control-Max-Age", String(policy.maxAgeSeconds));
      }
    }

    // 预检请求统一以 204 结束；未通过白名单时响应里没有 ACAO，浏览器会自行拦截。
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    next();
  };
}

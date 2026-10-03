import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import type {
  SimulatorConfig,
  TelemetryPoint,
  UserSession,
} from "../shared/index.js";
import {
  AuthError,
  AuthService,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  parseCookies,
  type AuthPrincipal,
  type TokenPair,
} from "./auth.js";
import { createCorsMiddleware } from "./cors.js";
import { AppDatabase } from "./database.js";
import { TelemetrySimulator } from "./simulator.js";
import { WeatherProviderError, WeatherService } from "./weather.js";

interface AuthenticatedRequest extends Request {
  user: AuthPrincipal;
}

export interface AppServices {
  database: AppDatabase;
  auth: AuthService;
  simulator: TelemetrySimulator;
  weather?: WeatherService;
  connectionCount: () => number;
  disconnectClients: () => number;
}

/** 异步安全处理函数 */
/**
 * 把 async 路由处理器包装成 Express 能正确处理错误的中间件。
 *
 * Express 4 只用同步 try/catch 调用处理器，而 async 处理器返回的是 Promise：
 * 内部 `await` 失败或主动 throw 时，错误变成一个没有 catch 的 rejected Promise，
 * 请求既不会返回响应也不会进错误中间件，最终表现为客户端一直挂着 + 进程 unhandledRejection。
 *
 * 这里先 `Promise.resolve(...)` 把「同步返回 / 异步返回」统一成 Promise，再统一 `.catch(next)`，
 * 让错误交回 Express，由文件末尾的统一错误中间件转成 401 / 409 / 500 响应。
 *
 * 补充一点：同步抛出的异常其实不需要这层包装，Express 自己的 try/catch 就能接住；
 * 这个函数真正兜住的是 async 处理器里的异步失败。
 */
function asyncSafe(
  handler: (request: Request, response: Response) => void | Promise<void>,
): express.RequestHandler {
  return (request, response, next) => {
    // 每个路由不必各写一遍 try/catch：失败一律走 next(error) 进统一错误处理。
    Promise.resolve(handler(request, response)).catch(next);
  };
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** 公共用户信息  */
function publicProfile(user: UserSession): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    first_name: user.displayName,
    displayName: user.displayName,
    is_superuser: user.role === "admin",
    role: user.role,
    can_visit_realtime: true,
    can_visit_history: true,
  };
}

function setRefreshCookie(
  request: Request,
  response: Response,
  tokens: TokenPair,
): void {
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",  /**  */
    secure: request.secure,
    expires: new Date(tokens.refreshTokenExpiresAt),
    path: "/api/auth",
  });
}

/**
 * 登录 / 注册的响应体：用户档案统一挂在 user 下，与凭证字段同级。
 * 早期版本同时把档案字段平铺到根级（`...profile`），两套并存只为兼容旧调用方，现已统一去掉。
 */
function authResponse(tokens: TokenPair): Record<string, unknown> {
  return {
    user: publicProfile(tokens.user),
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
  };
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

function legacyPoint(point: TelemetryPoint): Record<string, unknown> {
  return {
    sequence: point.sequence,
    robot_id: point.robotId,
    time: point.sampledAt,
    longitude: point.longitude,
    latitude: point.latitude,
    geo_location: [point.longitude, point.latitude],
    altitude: point.altitude,
    speed: point.speed,
    heading: point.heading,
    speed_direction: point.windDirection,
    pri_co2: point.priCo2,
    pri_ch4: point.priCh4,
    pri_c2h6: point.priC2h6,
    pri_co: point.priCo,
    pri_n2o: point.priN2o,
    pri_h2o: point.priH2o,
    picarro_hp_12ch4_dry: point.picarroCh4,
    picarro_hr_12ch4_dry: point.picarroCh4,
    picarro_12co2_dry: point.picarroCo2,
    picarro_delta_ich4_raw: (point.picarroCh4 - point.priCh4) * 100,
    picarro_h2o: point.picarroH2o,
    wind_speed: point.windSpeed,
    wind_direction: point.windDirection,
    weather_data: {
      temp: point.temperature,
      humidity: point.humidity,
      pressure: point.pressure,
      windSpeed: point.windSpeed,
      windDirection: point.windDirection,
    },
  };
}

export function createApp(services: AppServices): express.Express {
  const app = express();
  const weather = services.weather ?? new WeatherService();
  const simulatorStatus = () => services.simulator.getStatus(services.connectionCount());
  app.disable("x-powered-by");
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: "64kb" }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({ ok: true, now: new Date().toISOString() });
  });

  app.post(
    "/api/auth/register",
    asyncSafe(async (request, response) => {
      const { username, displayName, password } = request.body as Record<string, unknown>;
      services.auth.register(String(username ?? ""), String(displayName ?? ""), String(password ?? ""));
      const tokens = await services.auth.login(String(username), String(password));
      setRefreshCookie(request, response, tokens);
      response.clearCookie(SESSION_COOKIE, { path: "/" });
      response.status(201).json({ ...authResponse(tokens), message: "注册成功" });
    }),
  );

  app.post(
    "/api/auth/login",
    asyncSafe(async (request, response) => {
      const { username, password } = request.body as Record<string, unknown>;
      const tokens = await services.auth.login(String(username ?? ""), String(password ?? ""));
      setRefreshCookie(request, response, tokens);
      response.clearCookie(SESSION_COOKIE, { path: "/" });
      response.json(authResponse(tokens));
    }),
  );

  app.post(
    "/api/auth/refresh",
    asyncSafe(async (request, response) => {
      const refreshToken = parseCookies(request.headers.cookie)[REFRESH_COOKIE];
      if (!refreshToken) {
        throw new AuthError("缺少刷新凭证", 401, "REFRESH_TOKEN_INVALID");
      }
      try {
        const tokens = await services.auth.refresh(refreshToken);
        setRefreshCookie(request, response, tokens);
        response.json({
          accessToken: tokens.accessToken,
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        });
      } catch (error) {
        if (error instanceof AuthError) clearRefreshCookie(response);
        throw error;
      }
    }),
  );

  const requireAuth: express.RequestHandler = (request, _response, next) => {
    services.auth
      .principalFromRequest(request)
      .then((principal) => {
        (request as AuthenticatedRequest).user = principal;
        next();
      })
      .catch(next);
  };

  app.get("/api/auth/session", requireAuth, (request, response) => {
    response.json(publicProfile((request as AuthenticatedRequest).user));
  });

  app.post("/api/auth/logout", requireAuth, (request, response) => {
    services.auth.revokeFamily((request as AuthenticatedRequest).user.familyId);
    clearRefreshCookie(response);
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.status(204).end();
  });

  const requireAdmin = (request: Request, response: Response, next: NextFunction): void => {
    if ((request as AuthenticatedRequest).user.role !== "admin") {
      response.status(403).json({ code: "FORBIDDEN", message: "仅管理员可操作模拟后台" });
      return;
    }
    next();
  };

  app.use("/api/telemetry", requireAuth);
  app.get("/api/telemetry/latest", (request, response) => {
    const robotId = String(request.query.robotId ?? "QH-ZHC-01");
    const limit = Math.min(5_000, Math.max(1, Number(request.query.limit) || 500));
    response.json({
      points: services.database.latestTelemetry(robotId, limit),
      latestSequence: services.database.latestSequence(robotId),
    });
  });
  app.get("/api/telemetry/history", (request, response) => {
    const robotId = String(request.query.robotId ?? "QH-ZHC-01");
    const rawFrom = request.query.from;
    const rawTo = request.query.to;
    const from = validDate(rawFrom);
    const to = validDate(rawTo);
    if ((rawFrom && !from) || (rawTo && !to)) {
      response.status(400).json({ code: "INVALID_RANGE", message: "历史时间格式无效" });
      return;
    }
    if (from && to && Date.parse(from) >= Date.parse(to)) {
      response.status(400).json({ code: "INVALID_RANGE", message: "结束时间必须晚于开始时间" });
      return;
    }
    const limit = Math.min(20_000, Math.max(1, Number(request.query.limit) || 5_000));
    response.json(services.database.queryHistory(robotId, from, to, limit));
  });

  app.use("/api/chart", requireAuth);
  app.get(
    "/api/chart/weather",
    asyncSafe(async (request, response) => {
      const longitude = Number(request.query.longitude);
      const latitude = Number(request.query.latitude);
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        response.status(400).json({ code: 400, message: "经纬度参数无效", data: [] });
        return;
      }
      if (!weather.isConfigured()) {
        response.status(503).json({ code: 503, message: "天气服务暂不可用", data: [] });
        return;
      }
      try {
        const forecast = await weather.forecast(longitude, latitude);
        response.json({ code: 200, message: "ok", data: forecast });
      } catch (error) {
        if (error instanceof WeatherProviderError) {
          response.status(502).json({ code: 502, message: "天气服务请求失败", data: [] });
          return;
        }
        throw error;
      }
    }),
  );
  app.get("/api/chart/dataTrans/between", (request, response) => {
    const start = validDate(request.query.start_time);
    const end = validDate(request.query.end_time);
    if (!start || !end || Date.parse(start) >= Date.parse(end)) {
      response.status(400).json({ code: 400, message: "历史时间范围无效", data: [] });
      return;
    }
    const result = services.database.queryHistory("QH-ZHC-01", start, end, 3_000);
    response.json({
      code: 200,
      message: "查询成功",
      data: result.points.map(legacyPoint),
      total: result.total,
      sampled: result.truncated,
    });
  });
  app.get("/api/chart/dataTrans/5min", (request, response) => {
    const to = validDate(request.query.time) ?? new Date().toISOString();
    const from = new Date(Date.parse(to) - 5 * 60_000).toISOString();
    const result = services.database.queryHistory("QH-ZHC-01", from, to, 300);
    response.json({
      code: 200,
      message: "查询成功",
      data: result.points.map(legacyPoint),
      total: result.total,
      sampled: result.truncated,
    });
  });

  app.use("/api/admin/simulator", requireAuth, requireAdmin);
  app.get("/api/admin/simulator", (_request, response) => {
    response.json({ status: simulatorStatus() });
  });
  app.patch(
    "/api/admin/simulator/config",
    asyncSafe((request, response) => {
      const patch = request.body as Partial<SimulatorConfig>;
      services.simulator.updateConfig(patch);
      response.json({ status: simulatorStatus() });
    }),
  );
  app.post(
    "/api/admin/simulator/action",
    asyncSafe((request, response) => {
      const { action } = request.body as { action?: unknown };
      if (action === "start") {
        services.simulator.start();
        response.json({ status: simulatorStatus() });
        return;
      }
      if (action === "pause") {
        services.simulator.pause();
        response.json({ status: simulatorStatus() });
        return;
      }
      if (action === "disconnect") {
        const disconnected = services.disconnectClients();
        response.json({ status: simulatorStatus(), disconnected });
        return;
      }
      response.status(400).json({ code: "INVALID_ACTION", message: "不支持的模拟器操作" });
    }),
  );

  const webRoot = path.resolve(import.meta.dirname, "../../../QHZHC_Web/dist");
  if (fs.existsSync(webRoot)) {
    app.use(express.static(webRoot, { index: false, maxAge: "1h" }));
    app.use((request, response, next) => {
      if (request.method === "GET" && request.accepts("html")) {
        response.sendFile(path.join(webRoot, "index.html"));
      } else {
        next();
      }
    });
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof AuthError) {
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      response.status(409).json({ code: "CONFLICT", message: "数据已存在" });
      return;
    }
    console.error(error);
    response.status(500).json({ code: "INTERNAL_ERROR", message: "服务端处理失败" });
  });
  return app;
}

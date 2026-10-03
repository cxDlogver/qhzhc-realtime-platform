import path from "node:path";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  jwtSecret: string;
  telemetryRetention: number;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const jwtSecret =
    overrides.jwtSecret ??
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production"
      ? ""
      : "qhzhc-development-secret-change-me-now");
  if (new TextEncoder().encode(jwtSecret).byteLength < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes");
  }
  return {
    host: overrides.host ?? process.env.HOST ?? "127.0.0.1",
    port: overrides.port ?? positiveInteger(process.env.PORT, 18080),
    databasePath:
      overrides.databasePath ??
      path.resolve(process.cwd(), process.env.DATABASE_PATH ?? ".data/qhzhc.sqlite"),
    accessTokenTtlMs:
      overrides.accessTokenTtlMs ??
      positiveInteger(process.env.ACCESS_TOKEN_TTL_MINUTES, 15) * 60 * 1000,
    refreshTokenTtlMs:
      overrides.refreshTokenTtlMs ??
      positiveInteger(process.env.REFRESH_TOKEN_TTL_DAYS, 7) * 24 * 60 * 60 * 1000,
    jwtSecret,
    telemetryRetention:
      overrides.telemetryRetention ?? positiveInteger(process.env.TELEMETRY_RETENTION, 100_000),
  };
}

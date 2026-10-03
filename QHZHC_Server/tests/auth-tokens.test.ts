import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthError, AuthService } from "../src/server/auth.js";
import { loadConfig } from "../src/server/config.js";
import { AppDatabase } from "../src/server/database.js";

const AUTH_OPTIONS = {
  accessTokenTtlMs: 60_000,
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
};

describe("access and refresh token lifecycle", () => {
  let database: AppDatabase;
  let auth: AuthService;

  beforeEach(() => {
    database = new AppDatabase(":memory:");
    auth = new AuthService(database, AUTH_OPTIONS);
  });

  afterEach(() => {
    database.close();
  });

  it("issues a verifiable access JWT and an opaque refresh token", async () => {
    const tokens = await auth.login("admin", "Admin@123456");

    expect(tokens.accessToken.split(".")).toHaveLength(3);
    expect(tokens.refreshToken.split(".")).toHaveLength(1);
    expect(tokens.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(tokens.refreshTokenExpiresAt).toBeGreaterThan(tokens.accessTokenExpiresAt);

    await expect(auth.verifyAccessToken(tokens.accessToken)).resolves.toMatchObject({
      id: 1,
      username: "admin",
      role: "admin",
      familyId: tokens.familyId,
    });
  });

  it("rotates a refresh token once and revokes the family when the old token is replayed", async () => {
    const login = await auth.login("admin", "Admin@123456");
    const rotated = await auth.refresh(login.refreshToken);

    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    expect(rotated.familyId).toBe(login.familyId);
    await expect(auth.verifyAccessToken(rotated.accessToken)).resolves.toMatchObject({
      familyId: login.familyId,
    });

    await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSED",
      status: 401,
    } satisfies Partial<AuthError>);
    await expect(auth.verifyAccessToken(rotated.accessToken)).rejects.toMatchObject({
      code: "TOKEN_FAMILY_REVOKED",
      status: 401,
    } satisfies Partial<AuthError>);
  });

  it("loads separate access and refresh lifetimes", () => {
    const config = loadConfig({
      accessTokenTtlMs: 15 * 60_000,
      refreshTokenTtlMs: 7 * 24 * 60 * 60_000,
      jwtSecret: AUTH_OPTIONS.jwtSecret,
    });

    expect(config.accessTokenTtlMs).toBe(15 * 60_000);
    expect(config.refreshTokenTtlMs).toBe(7 * 24 * 60 * 60_000);
    expect(config.jwtSecret).toBe(AUTH_OPTIONS.jwtSecret);
  });
});

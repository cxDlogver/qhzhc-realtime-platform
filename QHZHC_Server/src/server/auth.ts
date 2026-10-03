import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { errors, jwtVerify, SignJWT } from "jose";
import type { UserSession } from "../shared/index.js";
import { AppDatabase } from "./database.js";
import { hashPassword, verifyPassword } from "./password.js";

export const SESSION_COOKIE = "qhzhc_session";
export const REFRESH_COOKIE = "qhzhc_refresh";
const ACCESS_TOKEN_ISSUER = "qhzhc-auth";
const ACCESS_TOKEN_AUDIENCE = "qhzhc-api";

export interface AuthOptions {
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  jwtSecret: string;
}

export interface AuthPrincipal extends UserSession {
  familyId: string;
  tokenId: string;
  accessTokenExpiresAt: number;
}

export interface TokenPair {
  user: UserSession;
  familyId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export function parseCookies(rawCookie: string | undefined): Record<string, string> {
  if (!rawCookie) return {};
  return Object.fromEntries(
    rawCookie.split(";").flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 0) return [];
      const key = entry.slice(0, separator).trim();
      const value = entry.slice(separator + 1).trim();
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

export class AuthService {
  private readonly options: AuthOptions;
  private readonly jwtKey: Uint8Array;

  constructor(
    private readonly database: AppDatabase,
    options: AuthOptions,
  ) {
    this.options = options;
    this.jwtKey = new TextEncoder().encode(this.options.jwtSecret);
    if (this.jwtKey.byteLength < 32) {
      throw new Error("JWT secret must contain at least 32 bytes");
    }
  }

  /** 注册校验逻辑 */
  register(username: string, displayName: string, password: string): UserSession {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      throw new AuthError("账号需为 3-24 位字母、数字或下划线", 400, "INVALID_USERNAME");
    }
    if (displayName.trim().length < 2 || displayName.trim().length > 30) {
      throw new AuthError("显示名称需为 2-30 个字符", 400, "INVALID_DISPLAY_NAME");
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new AuthError("密码至少 8 位，且同时包含字母和数字", 400, "WEAK_PASSWORD");
    }
    if (this.database.findUserByUsername(username)) {
      throw new AuthError("该账号已存在", 409, "USERNAME_EXISTS");
    }
    const { hash, salt } = hashPassword(password);
    return this.database.createUser(username, displayName.trim(), hash, salt);
  }

  /** 登录校验逻辑 */
  async login(username: string, password: string): Promise<TokenPair> {
    const user = this.database.findUserByUsername(username);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      throw new AuthError("账号或密码错误", 401, "INVALID_CREDENTIALS");
    }
    const sessionUser: UserSession = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };
    const familyId = randomUUID();
    const refreshToken = randomBytes(32).toString("base64url");
    const refreshTokenExpiresAt = Date.now() + this.options.refreshTokenTtlMs;
    this.database.createRefreshTokenFamily(
      refreshToken,
      familyId,
      user.id,
      refreshTokenExpiresAt,
    );
    return this.issueTokenPair(sessionUser, familyId, refreshToken, refreshTokenExpiresAt);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const nextRefreshToken = randomBytes(32).toString("base64url");
    const rotation = this.database.rotateRefreshToken(refreshToken, nextRefreshToken);
    if (rotation.kind === "invalid") {
      throw new AuthError("刷新凭证无效", 401, "REFRESH_TOKEN_INVALID");
    }
    if (rotation.kind === "expired") {
      throw new AuthError("刷新凭证已过期", 401, "REFRESH_TOKEN_EXPIRED");
    }
    if (rotation.kind === "revoked") {
      throw new AuthError("登录会话已撤销", 401, "TOKEN_FAMILY_REVOKED");
    }
    if (rotation.kind === "reused") {
      throw new AuthError("检测到刷新凭证重放", 401, "REFRESH_TOKEN_REUSED");
    }
    return this.issueTokenPair(
      rotation.user,
      rotation.familyId,
      nextRefreshToken,
      rotation.refreshTokenExpiresAt,
    );
  }

  async verifyAccessToken(accessToken: string): Promise<AuthPrincipal> {
    try {
      const verified = await jwtVerify(accessToken, this.jwtKey, {
        algorithms: ["HS256"],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
      });
      const userId = Number(verified.payload.sub);
      const familyId = verified.payload.sid;
      const tokenId = verified.payload.jti;
      const expiresAt = Number(verified.payload.exp) * 1000;
      if (
        !Number.isSafeInteger(userId) ||
        userId <= 0 ||
        typeof familyId !== "string" ||
        !familyId ||
        typeof tokenId !== "string" ||
        !tokenId ||
        !Number.isFinite(expiresAt)
      ) {
        throw new AuthError("访问凭证字段无效", 401, "ACCESS_TOKEN_INVALID");
      }
      if (!this.database.isTokenFamilyActive(familyId)) {
        throw new AuthError("登录会话已撤销", 401, "TOKEN_FAMILY_REVOKED");
      }
      const user = this.database.findUserById(userId);
      if (!user) {
        throw new AuthError("用户不存在", 401, "ACCESS_TOKEN_INVALID");
      }
      return {
        ...user,
        familyId,
        tokenId,
        accessTokenExpiresAt: expiresAt,
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error instanceof errors.JWTExpired) {
        throw new AuthError("访问凭证已过期", 401, "ACCESS_TOKEN_EXPIRED");
      }
      throw new AuthError("访问凭证无效", 401, "ACCESS_TOKEN_INVALID");
    }
  }

  /**
   * 从 HTTP 请求头取出 Bearer 凭证并校验，得到可直接挂到 `request.user` 上的身份主体。
   *
   * 这一层只负责「从报文中取出凭证」这一件事：不读 body、不读 Cookie，业务判断一概不做。
   * Token 的真伪、是否过期、所属 family 是否被撤销，全部交给 verifyAccessToken。
   *
   * @param request 只用到 headers，因此入参收窄成 Pick<IncomingMessage, "headers">，测试里可直接构造对象。
   * @returns 校验通过的身份主体 user；失败抛 AuthError。
   */
  async principalFromRequest(
    request: Pick<IncomingMessage, "headers">,
  ): Promise<AuthPrincipal> {
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === "string"
        ? /^Bearer\s+(.+)$/i.exec(authorization.trim())
        : null;
    // 「没有 header」与「格式不对」返回同一个错误码，避免借错误信息探测凭证格式。
    if (!match?.[1]) {
      throw new AuthError("缺少访问凭证", 401, "ACCESS_TOKEN_MISSING");
    }
    return this.verifyAccessToken(match[1]);
  }

  revokeFamily(familyId: string): void {
    this.database.revokeTokenFamily(familyId);
  }

  /** 签发访问和刷新凭证 */
  private async issueTokenPair(
    user: UserSession,
    familyId: string,
    refreshToken: string,
    refreshTokenExpiresAt: number,
  ): Promise<TokenPair> {
    const issuedAt = Date.now();
    const accessTokenExpiresAt = issuedAt + this.options.accessTokenTtlMs;
    const tokenId = randomUUID();
    const accessToken = await new SignJWT({
      sid: familyId,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setSubject(String(user.id))
      .setJti(tokenId)
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(Math.floor(accessTokenExpiresAt / 1000))
      .sign(this.jwtKey);
    return {
      user,
      familyId,
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}

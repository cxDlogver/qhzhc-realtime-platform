import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { HistoryResponse, TelemetryPoint, UserSession } from "../shared/index.js";
import { hashPassword } from "./password.js";

type NewTelemetryPoint = Omit<TelemetryPoint, "sequence">;

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  role: "admin" | "operator";
}

interface RefreshTokenRow extends SessionRow {
  token_hash: string;
  family_id: string;
  user_id: number;
  expires_at: number;
  consumed_at: number | null;
  revoked_at: number | null;
}

export type RefreshRotationResult =
  | {
      kind: "rotated";
      familyId: string;
      user: UserSession;
      refreshTokenExpiresAt: number;
    }
  | { kind: "invalid" }
  | { kind: "expired"; familyId: string }
  | { kind: "revoked"; familyId: string }
  | { kind: "reused"; familyId: string };

interface SessionRow {
  id: number;
  username: string;
  display_name: string;
  expires_at: number;
  role: "admin" | "operator";
}

interface TelemetryRow {
  sequence: number;
  payload: string;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AppDatabase {
  private readonly database: DatabaseSync;

  constructor(databasePath: string, private readonly telemetryRetention = 100_000) {
    if (databasePath !== ":memory:") {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
    this.migrate();
    this.seedDefaultUser();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_hash TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        parent_token_hash TEXT,
        replaced_by_hash TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS telemetry (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        robot_id TEXT NOT NULL,
        sampled_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS telemetry_robot_sequence
        ON telemetry(robot_id, sequence);
      CREATE INDEX IF NOT EXISTS telemetry_sampled_at
        ON telemetry(sampled_at);
      CREATE INDEX IF NOT EXISTS telemetry_robot_sampled_at
        ON telemetry(robot_id, sampled_at);
      CREATE INDEX IF NOT EXISTS sessions_expires_at
        ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS refresh_tokens_family_id
        ON refresh_tokens(family_id);
      CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at
        ON refresh_tokens(expires_at);
    `);
  }

  private seedDefaultUser(): void {
    const existing = this.findUserByUsername("admin");
    if (existing) return;
    const { hash, salt } = hashPassword("Admin@123456");
    this.database
      .prepare(
        `INSERT INTO users(username, display_name, password_hash, password_salt, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("admin", "系统管理员", hash, salt, "admin", Date.now());
  }

  createUser(username: string, displayName: string, passwordHash: string, salt: string): UserSession {
    const result = this.database
      .prepare(
        `INSERT INTO users(username, display_name, password_hash, password_salt, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(username, displayName, passwordHash, salt, "operator", Date.now());
    return {
      id: Number(result.lastInsertRowid),
      username,
      displayName,
      role: "operator",
    };
  }

  findUserByUsername(username: string): UserRow | undefined {
    return this.database
      .prepare(
        `SELECT id, username, display_name, password_hash, password_salt, role
         FROM users WHERE username = ? COLLATE NOCASE`,
      )
      .get(username) as unknown as UserRow | undefined;
  }

  findUserById(userId: number): UserSession | null {
    const row = this.database
      .prepare(
        `SELECT id, username, display_name, role
         FROM users WHERE id = ?`,
      )
      .get(userId) as unknown as Omit<UserRow, "password_hash" | "password_salt"> | undefined;
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    };
  }

  createRefreshTokenFamily(
    token: string,
    familyId: string,
    userId: number,
    expiresAt: number,
    now = Date.now(),
  ): void {
    this.database
      .prepare(
        `INSERT INTO refresh_tokens(
           token_hash, family_id, user_id, parent_token_hash, replaced_by_hash,
           created_at, expires_at, consumed_at, revoked_at
         ) VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`,
      )
      .run(tokenHash(token), familyId, userId, now, expiresAt);
  }

  rotateRefreshToken(
    currentToken: string,
    nextToken: string,
    now = Date.now(),
  ): RefreshRotationResult {
    const currentHash = tokenHash(currentToken);
    const nextHash = tokenHash(nextToken);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare(
          `SELECT refresh_tokens.token_hash, refresh_tokens.family_id,
                  refresh_tokens.user_id, refresh_tokens.expires_at,
                  refresh_tokens.consumed_at, refresh_tokens.revoked_at,
                  users.id, users.username, users.display_name, users.role
           FROM refresh_tokens
           JOIN users ON users.id = refresh_tokens.user_id
           WHERE refresh_tokens.token_hash = ?`,
        )
        .get(currentHash) as unknown as RefreshTokenRow | undefined;

      if (!row) {
        this.database.exec("COMMIT");
        return { kind: "invalid" };
      }
      if (row.revoked_at !== null) {
        this.database.exec("COMMIT");
        return { kind: "revoked", familyId: row.family_id };
      }
      if (row.consumed_at !== null) {
        this.database
          .prepare(
            `UPDATE refresh_tokens
             SET revoked_at = ?
             WHERE family_id = ? AND revoked_at IS NULL`,
          )
          .run(now, row.family_id);
        this.database.exec("COMMIT");
        return { kind: "reused", familyId: row.family_id };
      }
      if (row.expires_at <= now) {
        this.database.exec("COMMIT");
        return { kind: "expired", familyId: row.family_id };
      }

      this.database
        .prepare(
          `UPDATE refresh_tokens
           SET consumed_at = ?, replaced_by_hash = ?
           WHERE token_hash = ?`,
        )
        .run(now, nextHash, currentHash);
      this.database
        .prepare(
          `INSERT INTO refresh_tokens(
             token_hash, family_id, user_id, parent_token_hash, replaced_by_hash,
             created_at, expires_at, consumed_at, revoked_at
           ) VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL)`,
        )
        .run(nextHash, row.family_id, row.user_id, currentHash, now, row.expires_at);
      this.database.exec("COMMIT");
      return {
        kind: "rotated",
        familyId: row.family_id,
        refreshTokenExpiresAt: row.expires_at,
        user: {
          id: row.id,
          username: row.username,
          displayName: row.display_name,
          role: row.role,
        },
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  isTokenFamilyActive(familyId: string, now = Date.now()): boolean {
    const row = this.database
      .prepare(
        `SELECT 1 AS active
         FROM refresh_tokens
         WHERE family_id = ?
           AND consumed_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > ?
         LIMIT 1`,
      )
      .get(familyId, now) as unknown as { active: number } | undefined;
    return row?.active === 1;
  }

  revokeTokenFamily(familyId: string, now = Date.now()): void {
    this.database
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = ?
         WHERE family_id = ? AND revoked_at IS NULL`,
      )
      .run(now, familyId);
  }

  createSession(token: string, userId: number, expiresAt: number): void {
    this.database
      .prepare("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash(token), userId, expiresAt);
  }

  findSession(token: string, now = Date.now()): UserSession | null {
    const row = this.database
      .prepare(
        `SELECT users.id, users.username, users.display_name, users.role, sessions.expires_at
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ?`,
      )
      .get(tokenHash(token)) as unknown as SessionRow | undefined;
    if (!row || row.expires_at <= now) {
      if (row) this.deleteSession(token);
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    };
  }

  deleteSession(token: string): void {
    this.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  }

  cleanupExpiredSessions(now = Date.now()): void {
    this.database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  }

  cleanupExpiredRefreshTokens(now = Date.now()): void {
    this.database.prepare("DELETE FROM refresh_tokens WHERE expires_at <= ?").run(now);
  }

  insertTelemetry(points: NewTelemetryPoint[]): TelemetryPoint[] {
    if (points.length === 0) return [];
    const statement = this.database.prepare(
      "INSERT INTO telemetry(robot_id, sampled_at, payload) VALUES (?, ?, ?)",
    );
    const inserted: TelemetryPoint[] = [];
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const point of points) {
        const result = statement.run(point.robotId, point.sampledAt, JSON.stringify(point));
        inserted.push({ ...point, sequence: Number(result.lastInsertRowid) });
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    this.pruneTelemetry();
    return inserted;
  }

  private pruneTelemetry(): void {
    const latest = this.latestSequence();
    const cutoff = latest - this.telemetryRetention;
    if (cutoff > 0) {
      this.database.prepare("DELETE FROM telemetry WHERE sequence <= ?").run(cutoff);
    }
  }

  latestSequence(robotId = "QH-ZHC-01"): number {
    const row = this.database
      .prepare("SELECT COALESCE(MAX(sequence), 0) AS value FROM telemetry WHERE robot_id = ?")
      .get(robotId) as unknown as { value: number };
    return Number(row.value);
  }

  earliestSequence(robotId = "QH-ZHC-01"): number {
    const row = this.database
      .prepare("SELECT COALESCE(MIN(sequence), 0) AS value FROM telemetry WHERE robot_id = ?")
      .get(robotId) as unknown as { value: number };
    return Number(row.value);
  }

  telemetryBySequence(
    robotId: string,
    fromInclusive: number,
    toInclusive: number,
    limit = 5_000,
  ): TelemetryPoint[] {
    const rows = this.database
      .prepare(
        `SELECT sequence, payload FROM telemetry
         WHERE robot_id = ? AND sequence >= ? AND sequence <= ?
         ORDER BY sequence ASC LIMIT ?`,
      )
      .all(robotId, fromInclusive, toInclusive, limit) as unknown as TelemetryRow[];
    return rows.map((row) => ({ ...JSON.parse(row.payload), sequence: row.sequence }) as TelemetryPoint);
  }

  telemetryByTimeBucket(
    robotId: string,
    bucketStartMs: number,
  ): TelemetryPoint[] {
    const from = new Date(bucketStartMs).toISOString();
    const to = new Date(bucketStartMs + 1_000).toISOString();
    const rows = this.database
      .prepare(
        `SELECT sequence, payload FROM telemetry
         WHERE robot_id = ? AND sampled_at >= ? AND sampled_at < ?
         ORDER BY sampled_at ASC, sequence ASC`,
      )
      .all(robotId, from, to) as unknown as TelemetryRow[];
    return rows.map(
      (row) => ({ ...JSON.parse(row.payload), sequence: row.sequence }) as TelemetryPoint,
    );
  }

  earliestTelemetryBucketStartMs(robotId: string): number | null {
    const row = this.database
      .prepare("SELECT MIN(sampled_at) AS value FROM telemetry WHERE robot_id = ?")
      .get(robotId) as unknown as { value: string | null };
    if (!row.value) return null;
    const value = Date.parse(row.value);
    return Number.isFinite(value) ? Math.floor(value / 1_000) * 1_000 : null;
  }

  latestTelemetry(robotId: string, limit = 500): TelemetryPoint[] {
    const rows = this.database
      .prepare(
        `SELECT sequence, payload FROM (
           SELECT sequence, payload FROM telemetry
           WHERE robot_id = ? ORDER BY sequence DESC LIMIT ?
         ) ORDER BY sequence ASC`,
      )
      .all(robotId, limit) as unknown as TelemetryRow[];
    return rows.map((row) => ({ ...JSON.parse(row.payload), sequence: row.sequence }) as TelemetryPoint);
  }

  queryHistory(robotId: string, from: string | null, to: string | null, limit: number): HistoryResponse {
    const conditions = ["robot_id = ?"];
    const parameters: SQLInputValue[] = [robotId];
    if (from) {
      conditions.push("sampled_at >= ?");
      parameters.push(from);
    }
    if (to) {
      conditions.push("sampled_at <= ?");
      parameters.push(to);
    }
    const where = conditions.join(" AND ");
    const count = this.database
      .prepare(`SELECT COUNT(*) AS value FROM telemetry WHERE ${where}`)
      .get(...parameters) as unknown as { value: number };
    const total = Number(count.value);
    let rows: TelemetryRow[];
    if (total <= limit) {
      rows = this.database
        .prepare(
          `SELECT sequence, payload FROM telemetry WHERE ${where}
           ORDER BY sequence ASC LIMIT ?`,
        )
        .all(...parameters, limit) as unknown as TelemetryRow[];
    } else if (limit === 1) {
      rows = this.database
        .prepare(
          `SELECT sequence, payload FROM telemetry WHERE ${where}
           ORDER BY sequence DESC LIMIT 1`,
        )
        .all(...parameters) as unknown as TelemetryRow[];
    } else {
      const step = Math.ceil((total - 1) / (limit - 1));
      rows = this.database
        .prepare(
          `WITH ordered AS (
             SELECT sequence, payload,
                    ROW_NUMBER() OVER (ORDER BY sequence ASC) AS row_number
             FROM telemetry WHERE ${where}
           )
           SELECT sequence, payload FROM ordered
           WHERE row_number = 1
              OR row_number = ?
              OR ((row_number - 1) % ?) = 0
           ORDER BY sequence ASC LIMIT ?`,
        )
        .all(...parameters, total, step, limit) as unknown as TelemetryRow[];
    }
    return {
      points: rows.map(
        (row) => ({ ...JSON.parse(row.payload), sequence: row.sequence }) as TelemetryPoint,
      ),
      total,
      truncated: total > limit,
      range: { from, to },
    };
  }

  clearTelemetry(): void {
    this.database.exec("DELETE FROM telemetry; DELETE FROM sqlite_sequence WHERE name = 'telemetry';");
  }

  close(): void {
    this.database.close();
  }
}

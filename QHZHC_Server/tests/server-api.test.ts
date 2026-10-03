import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { AuthService } from "../src/server/auth.js";
import { AppDatabase } from "../src/server/database.js";
import { createTelemetryPoint } from "../src/server/point-factory.js";
import { TelemetrySimulator } from "../src/server/simulator.js";

describe("HTTP API", () => {
  let database: AppDatabase;
  let simulator: TelemetrySimulator;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    database = new AppDatabase(":memory:", 10_000);
    const auth = new AuthService(database, {
      accessTokenTtlMs: 60_000,
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
      jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
    });
    simulator = new TelemetrySimulator(database);
    app = createApp({
      database,
      auth,
      simulator,
      connectionCount: () => 3,
      disconnectClients: () => 3,
    });
  });

  afterEach(() => {
    simulator.close();
    database.close();
  });

  it("keeps protected telemetry endpoints behind a bearer access token", async () => {
    await request(app).get("/api/telemetry/latest").expect(401);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "Admin@123456" })
      .expect(200);
    expect(login.body.accessToken.split(".")).toHaveLength(3);
    expect(login.headers["set-cookie"]?.[0]).toContain("qhzhc_refresh=");
    database.insertTelemetry(Array.from({ length: 12 }, (_, index) =>
      createTelemetryPoint(index, index, "QH-ZHC-01", "route"),
    ));
    const latest = await request(app)
      .get("/api/telemetry/latest?limit=5")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(latest.body.points).toHaveLength(5);
    expect(latest.body.points.at(-1).sequence).toBe(12);
  });

  it("registers an account and returns an access token plus refresh cookie", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ username: "operator_1", displayName: "测试操作员", password: "Passw0rd!" })
      .expect(201);
    expect(response.body.user).toMatchObject({ username: "operator_1", role: "operator" });
    expect(response.body.accessToken.split(".")).toHaveLength(3);
    expect(response.headers["set-cookie"]?.[0]).toContain("qhzhc_refresh=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("rotates the refresh cookie and revokes the family when the old cookie is replayed", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "Admin@123456" })
      .expect(200);
    const firstCookie = login.headers["set-cookie"];

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", firstCookie)
      .expect(200);
    const nextCookie = refreshed.headers["set-cookie"];
    expect(refreshed.body.accessToken).not.toBe(login.body.accessToken);
    expect(nextCookie?.[0]).toContain("qhzhc_refresh=");
    expect(nextCookie?.[0]).not.toBe(firstCookie?.[0]);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", firstCookie)
      .expect(401);
    expect(replay.body.code).toBe("REFRESH_TOKEN_REUSED");
    expect(replay.headers["set-cookie"]?.[0]).toContain("qhzhc_refresh=;");

    await request(app)
      .get("/api/telemetry/latest")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(401);
  });

  it("updates simulator sampling settings and supports start, pause and disconnect", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "Admin@123456" });
    const authorization = `Bearer ${login.body.accessToken}`;
    const configured = await request(app)
      .patch("/api/admin/simulator/config")
      .set("Authorization", authorization)
      .send({ pointsPerSecond: 9999, pattern: "circle" })
      .expect(200);
    expect(configured.body.status.config).toMatchObject({
      pointsPerSecond: 20,
      pattern: "circle",
    });
    await request(app).post("/api/admin/simulator/action").set("Authorization", authorization).send({ action: "start" }).expect(200);
    await request(app).post("/api/admin/simulator/action").set("Authorization", authorization).send({ action: "pause" }).expect(200);
    const disconnected = await request(app).post("/api/admin/simulator/action").set("Authorization", authorization).send({ action: "disconnect" }).expect(200);
    expect(disconnected.body.disconnected).toBe(3);
  });
});

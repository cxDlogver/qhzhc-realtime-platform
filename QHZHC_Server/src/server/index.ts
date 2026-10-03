import { createServer } from "node:http";
import { createApp } from "./app.js";
import { AuthService } from "./auth.js";
import { loadConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import { RobotSocketHub } from "./robot-socket-hub.js";
import { TelemetrySimulator } from "./simulator.js";
import { TelemetryStreamService } from "./telemetry-stream.js";
import { WeatherService } from "./weather.js";

const config = loadConfig();
const database = new AppDatabase(config.databasePath, config.telemetryRetention);
const auth = new AuthService(database, {
  accessTokenTtlMs: config.accessTokenTtlMs,
  refreshTokenTtlMs: config.refreshTokenTtlMs,
  jwtSecret: config.jwtSecret,
});
const simulator = new TelemetrySimulator(database);
const telemetryStream = new TelemetryStreamService(database);
const weather = new WeatherService();
let socketHub: RobotSocketHub | null = null;

const app = createApp({
  database,
  auth,
  simulator,
  weather,
  connectionCount: () => socketHub?.connectionCount() ?? 0,
  disconnectClients: () => socketHub?.disconnectAll() ?? 0,
});
const server = createServer(app);
socketHub = new RobotSocketHub(server, auth, telemetryStream);
telemetryStream.setPublisher((bucket) => socketHub?.publish(bucket));

server.listen(config.port, config.host, () => {
  telemetryStream.start();
  simulator.start();
  console.log(`QHZHC server listening on http://${config.host}:${config.port}`);
  console.log("Demo account: admin / Admin@123456");
});

const tokenCleanup = setInterval(() => {
  database.cleanupExpiredSessions();
  database.cleanupExpiredRefreshTokens();
}, 60 * 60 * 1000);

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down...`);
  clearInterval(tokenCleanup);
  telemetryStream.close();
  simulator.close();
  socketHub?.close();
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/server-api.test.ts", "tests/websocket.test.ts"],
    fileParallelism: false,
    hookTimeout: 15000,
    testTimeout: 15000
  }
});

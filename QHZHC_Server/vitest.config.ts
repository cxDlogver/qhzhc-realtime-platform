import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/auth-tokens.test.ts",
      "tests/protocol.test.ts",
      "tests/server-services.test.ts",
      "tests/frontend-realtime.test.ts",
      "tests/weather.test.ts",
      "tests/cors-policy.test.ts", "tests/performance.test.ts", "tests/performance-api.test.ts"
    ]
  }
});

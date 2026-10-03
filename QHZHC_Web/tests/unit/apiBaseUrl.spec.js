import { resolveApiBaseUrl, resolveWebSocketBaseUrl } from "@/utils/apiBaseUrl";

describe("API base URL resolution", () => {
  test("uses localhost backend when the frontend is opened through localhost", () => {
    expect(
      resolveApiBaseUrl("", {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("http://localhost:18080");
  });

  test("uses 127.0.0.1 backend when the frontend is opened through 127.0.0.1", () => {
    expect(
      resolveApiBaseUrl("", {
        protocol: "http:",
        hostname: "127.0.0.1",
      }),
    ).toBe("http://127.0.0.1:18080");
  });

  test("keeps an explicitly configured API base URL unchanged", () => {
    expect(
      resolveApiBaseUrl("https://api.example.test", {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("https://api.example.test");
  });

  test("aligns a configured local loopback API host with the browser hostname", () => {
    expect(
      resolveApiBaseUrl("http://127.0.0.1:18080", {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("http://localhost:18080");
  });

  test("stays same-origin on the dev server because proxy forwards the API", () => {
    expect(
      resolveApiBaseUrl("", {
        protocol: "http:",
        hostname: "127.0.0.1",
        port: "9527",
      }),
    ).toBe("");
  });
});

describe("WebSocket base URL resolution", () => {
  test("points to the backend directly even when the page is served by the dev server", () => {
    // WebSocket 不走 devServer 代理："/ws" 是 webpack-dev-server 的 HMR 端点
    expect(
      resolveWebSocketBaseUrl("", {
        protocol: "http:",
        hostname: "127.0.0.1",
        port: "9527",
      }),
    ).toBe("ws://127.0.0.1:18080");
  });

  test("follows the page hostname for loopback hosts", () => {
    expect(
      resolveWebSocketBaseUrl("", {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("ws://localhost:18080");
  });

  test("upgrades to wss when the page is served over https", () => {
    expect(
      resolveWebSocketBaseUrl("", {
        protocol: "https:",
        hostname: "qhzhc.test",
      }),
    ).toBe("wss://127.0.0.1:18080");
  });

  test("derives the WebSocket scheme from a configured API base URL", () => {
    expect(
      resolveWebSocketBaseUrl("https://api.example.test", {
        protocol: "http:",
        hostname: "localhost",
      }),
    ).toBe("wss://api.example.test");
  });
});

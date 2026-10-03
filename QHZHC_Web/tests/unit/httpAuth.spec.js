import {
  applyAccessToken,
  createAuthErrorHandler,
} from "@/services/httpAuth";

describe("HTTP access token integration", () => {
  test("adds the in-memory access token to the Authorization header", () => {
    const config = applyAccessToken(
      { url: "/api/telemetry/latest", headers: {} },
      "access.jwt",
    );

    expect(config.headers.Authorization).toBe("Bearer access.jwt");
  });

  test("refreshes a 401 response and retries the original request once", async () => {
    const client = { request: jest.fn().mockResolvedValue({ data: "ok" }) };
    const manager = {
      getAccessToken: jest.fn(),
      setAccessToken: jest.fn(),
      clearAccessToken: jest.fn(),
      refreshAccessToken: jest.fn().mockResolvedValue("rotated.jwt"),
    };
    const onUnauthenticated = jest.fn();
    const handler = createAuthErrorHandler(client, manager, onUnauthenticated);
    const error = {
      response: { status: 401 },
      config: {
        url: "/api/telemetry/latest",
        headers: { Accept: "application/json" },
      },
    };

    await expect(handler(error)).resolves.toEqual({ data: "ok" });
    expect(manager.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      _authRetry: true,
      headers: expect.objectContaining({
        Authorization: "Bearer rotated.jwt",
      }),
    }));
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  test("does not refresh auth endpoints or retry an already retried request", async () => {
    const client = { request: jest.fn() };
    const manager = {
      getAccessToken: jest.fn(),
      setAccessToken: jest.fn(),
      clearAccessToken: jest.fn(),
      refreshAccessToken: jest.fn(),
    };
    const onUnauthenticated = jest.fn().mockResolvedValue(undefined);
    const handler = createAuthErrorHandler(client, manager, onUnauthenticated);
    const refreshError = {
      response: { status: 401 },
      config: { url: "/api/auth/refresh", headers: {} },
    };
    const retriedError = {
      response: { status: 401 },
      config: { url: "/api/telemetry/latest", headers: {}, _authRetry: true },
    };

    await expect(handler(refreshError)).rejects.toBe(refreshError);
    await expect(handler(retriedError)).rejects.toBe(retriedError);
    expect(manager.refreshAccessToken).not.toHaveBeenCalled();
    expect(manager.clearAccessToken).toHaveBeenCalledTimes(1);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  test("clears authentication when refresh fails", async () => {
    const refreshFailure = new Error("refresh expired");
    const client = { request: jest.fn() };
    const manager = {
      getAccessToken: jest.fn(),
      setAccessToken: jest.fn(),
      clearAccessToken: jest.fn(),
      refreshAccessToken: jest.fn().mockRejectedValue(refreshFailure),
    };
    const onUnauthenticated = jest.fn().mockResolvedValue(undefined);
    const handler = createAuthErrorHandler(client, manager, onUnauthenticated);
    const error = {
      response: { status: 401 },
      config: { url: "/api/chart/dataTrans/5min", headers: {} },
    };

    await expect(handler(error)).rejects.toBe(refreshFailure);
    expect(manager.clearAccessToken).toHaveBeenCalled();
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(client.request).not.toHaveBeenCalled();
  });
});

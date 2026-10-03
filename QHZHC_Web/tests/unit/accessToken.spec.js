import { createAccessTokenManager } from "@/services/accessToken";

describe("access token manager", () => {
  test("keeps the access token in memory", () => {
    const manager = createAccessTokenManager(async () => ({
      accessToken: "unused",
      accessTokenExpiresAt: Date.now() + 60_000,
    }));

    manager.setAccessToken("access.jwt");

    expect(manager.getAccessToken()).toBe("access.jwt");
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    manager.clearAccessToken();
    expect(manager.getAccessToken()).toBeNull();
  });

  test("coalesces concurrent refreshes into one request", async () => {
    let resolveRefresh;
    const refreshRequest = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const manager = createAccessTokenManager(refreshRequest);

    const first = manager.refreshAccessToken();
    const second = manager.refreshAccessToken();
    resolveRefresh({
      accessToken: "rotated.jwt",
      accessTokenExpiresAt: Date.now() + 60_000,
    });

    await expect(first).resolves.toBe("rotated.jwt");
    await expect(second).resolves.toBe("rotated.jwt");
    expect(refreshRequest).toHaveBeenCalledTimes(1);
    expect(manager.getAccessToken()).toBe("rotated.jwt");
  });

  test("clears failed refresh state so a later attempt can retry", async () => {
    const refreshRequest = jest
      .fn()
      .mockRejectedValueOnce(new Error("expired"))
      .mockResolvedValueOnce({
        accessToken: "next.jwt",
        accessTokenExpiresAt: Date.now() + 60_000,
      });
    const manager = createAccessTokenManager(refreshRequest);

    await expect(manager.refreshAccessToken()).rejects.toThrow("expired");
    await expect(manager.refreshAccessToken()).resolves.toBe("next.jwt");
    expect(refreshRequest).toHaveBeenCalledTimes(2);
  });
});

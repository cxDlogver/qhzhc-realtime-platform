import { describe, expect, it, vi } from "vitest";
import { WeatherProviderError, WeatherService } from "../src/server/weather.js";

describe("WeatherService", () => {
  it("fetches hourly and daily forecasts once and reuses coordinate caches", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/24h")) {
        return new Response(JSON.stringify({ code: "200", hourly: [{ temp: "24" }] }));
      }
      return new Response(JSON.stringify({ code: "200", daily: [{ tempMax: "27" }] }));
    });
    const service = new WeatherService("server-only-key", fetchImpl, () => 1_000);

    const first = await service.forecast(104.817693, 28.169435);
    const second = await service.forecast(104.817694, 28.169436);

    expect(first).toEqual({ hourly: [{ temp: "24" }], daily: [{ tempMax: "27" }] });
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [input] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      expect(url.searchParams.get("key")).toBe("server-only-key");
      expect(url.searchParams.get("location")).toBe("104.8177,28.1694");
    }
  });

  it("keeps missing keys and provider details behind a generic service error", async () => {
    const missing = new WeatherService("", vi.fn());
    await expect(missing.forecast(104.8, 28.1)).rejects.toBeInstanceOf(
      WeatherProviderError,
    );

    const failed = new WeatherService("secret", async () => {
      throw new Error("provider secret failure");
    });
    await expect(failed.forecast(104.8, 28.1)).rejects.toMatchObject({
      message: "weather provider request",
    });
  });
});

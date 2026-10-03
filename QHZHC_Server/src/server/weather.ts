const QWEATHER_BASE_URL = "https://devapi.qweather.com/v7/grid-weather";

type ForecastField = "hourly" | "daily";
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ForecastConfig {
  path: "24h" | "7d";
  field: ForecastField;
  ttlMs: number;
}

interface CacheEntry {
  expiresAt: number;
  data: unknown[];
}

const FORECASTS: ForecastConfig[] = [
  { path: "24h", field: "hourly", ttlMs: 60 * 60_000 },
  { path: "7d", field: "daily", ttlMs: 12 * 60 * 60_000 },
];

export interface WeatherForecast {
  hourly: unknown[];
  daily: unknown[];
}

export class WeatherProviderError extends Error {}

export class WeatherService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly apiKey = String(process.env.QWEATHER_API_KEY ?? "").trim(),
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async forecast(longitude: number, latitude: number): Promise<WeatherForecast> {
    if (!this.isConfigured()) throw new WeatherProviderError("weather key missing");
    const [hourly, daily] = await Promise.all(
      FORECASTS.map((config) => this.forecastPart(config, longitude, latitude)),
    );
    return { hourly: hourly ?? [], daily: daily ?? [] };
  }

  private async forecastPart(
    config: ForecastConfig,
    longitude: number,
    latitude: number,
  ): Promise<unknown[]> {
    const cacheKey = `${config.path}:${longitude.toFixed(4)}:${latitude.toFixed(4)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.data;

    const url = new URL(`${QWEATHER_BASE_URL}/${config.path}`);
    url.searchParams.set("location", `${longitude.toFixed(4)},${latitude.toFixed(4)}`);
    url.searchParams.set("key", this.apiKey);
    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new WeatherProviderError("weather provider status");
      const payload = (await response.json()) as Record<string, unknown>;
      const data = payload[config.field];
      if (payload.code !== "200" || !Array.isArray(data)) {
        throw new WeatherProviderError("weather provider payload");
      }
      this.cache.set(cacheKey, {
        data,
        expiresAt: this.now() + config.ttlMs,
      });
      return data;
    } catch (error) {
      if (error instanceof WeatherProviderError) throw error;
      throw new WeatherProviderError("weather provider request");
    }
  }
}

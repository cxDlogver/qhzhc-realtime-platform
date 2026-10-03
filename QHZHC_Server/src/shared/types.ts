export const GAS_KEYS = [
  "priCo2",
  "priCh4",
  "priC2h6",
  "priCo",
  "priN2o",
  "picarroCh4",
] as const;

export type GasKey = (typeof GAS_KEYS)[number];

export const GAS_LABELS: Record<GasKey, string> = {
  priCo2: "PRI CO₂",
  priCh4: "PRI CH₄",
  priC2h6: "PRI C₂H₆",
  priCo: "PRI CO",
  priN2o: "PRI N₂O",
  picarroCh4: "Picarro CH₄",
};

/**
 * 单个遥测采样点，同时是服务端与客户端之间的线格式（wire format）。
 *
 * `sequence` 由数据库 `telemetry` 表的主键 AUTOINCREMENT 分配，仅作为数据记录标识；
 * 其余业务字段由 {@link createTelemetryPoint} 按模拟图案生成，内容形如一次真实的走航采样。
 * 客户端收到后经 `toLegacyPoint()` 转成下划线命名的旧字段，供图表与地图渲染使用。
 */
export interface TelemetryPoint {
  /** 全局单调递增序号（不按 robotId 分段），由 telemetry 表主键 AUTOINCREMENT 分配。 */
  sequence: number;
  /** 走航车标识，取自 WebSocket 路径 `/ws/robots/{robotId}`，当前固定为 QH-ZHC-01。 */
  robotId: string;
  /** 采样时刻，ISO 8601 UTC 字符串；客户端按它做折线图的时间窗口裁剪。 */
  sampledAt: string;
  /** 经度（WGS84 度，东经为正），保留 7 位小数。 */
  longitude: number;
  /** 纬度（WGS84 度，北纬为正），保留 7 位小数。 */
  latitude: number;
  /** 海拔（米）。 */
  altitude: number;
  /** 行驶速度（km/h）。 */
  speed: number;
  /** 航向角（0-360°，正北为 0、顺时针），由当前点与下一点的坐标反算，用于地图箭头朝向。 */
  heading: number;
  /** PRI 分析仪 CO₂ 通道（ppm），模拟基准 408，羽流叠加最多 +65。 */
  priCo2: number;
  /** PRI 分析仪 CH₄ 通道（ppm），模拟基准 1.88，羽流叠加最多 +0.72。 */
  priCh4: number;
  /** PRI 分析仪 C₂H₆ 通道，模拟基准 0.02，羽流叠加最多 +0.2。 */
  priC2h6: number;
  /** PRI 分析仪 CO 通道（ppm），模拟基准 0.11，羽流叠加最多 +0.08。 */
  priCo: number;
  /** PRI 分析仪 N₂O 通道（ppm），模拟基准 0.331，羽流叠加最多 +0.025。 */
  priN2o: number;
  /** PRI 分析仪 H₂O 通道，模拟基准 0.9，波动 ±0.18。 */
  priH2o: number;
  /** Picarro 分析仪 CH₄ 通道（ppm）：与 PRI 同气体的第二套仪器，用于交叉比对，模拟基准 1.91。 */
  picarroCh4: number;
  /** Picarro 分析仪 CO₂ 通道（ppm），模拟基准 411。 */
  picarroCo2: number;
  /** Picarro 分析仪 H₂O 通道，模拟基准 0.86。 */
  picarroH2o: number;
  /** 风速（m/s）。 */
  windSpeed: number;
  /** 风向（0-360°），模拟值以「航向 + 47°」为基准叠加波动。 */
  windDirection: number;
  /** 环境温度（℃）。 */
  temperature: number;
  /** 相对湿度（%）。 */
  humidity: number;
  /** 大气压（hPa）。 */
  pressure: number;
}

export const SIMULATOR_POINT_RATES = [1, 5, 10, 20] as const;
export type SimulatorPointRate = (typeof SIMULATOR_POINT_RATES)[number];

export const DELIVERY_POINT_LIMITS = [0, 1, 2, 5, 10, 20] as const;
export type DeliveryPointLimit = (typeof DELIVERY_POINT_LIMITS)[number];

export type SimulatorPattern = "route" | "circle" | "burst";
export type TelemetryBucketStatus = "live" | "no-data";

export interface SimulatorConfig {
  robotId: string;
  pointsPerSecond: SimulatorPointRate;
  pattern: SimulatorPattern;
}

export interface TelemetrySecondBucket {
  bucketStartMs: number;
  bucketEndMs: number;
  status: TelemetryBucketStatus;
  points: TelemetryPoint[];
}

export interface SimulatorStatus {
  running: boolean;
  config: SimulatorConfig;
  committedSequence: number;
  generatedPoints: number;
  lastGeneratedAt: string | null;
  updatedAt: string;
  connectedClients: number;
}

export interface UserSession {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "operator";
}

export interface HistoryResponse {
  points: TelemetryPoint[];
  total: number;
  truncated: boolean;
  range: { from: string | null; to: string | null };
}

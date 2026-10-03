import type { LegacyTelemetryPoint } from "../services/realtimeTypes";

export interface DataEnvelope<T> {
  code: number;
  data: T[];
  message?: string;
  msg?: string;
  [key: string]: unknown;
}

export type ThresholdRange = readonly [number, number];

export const REALTIME_CHART_WINDOW_MS = 5 * 60 * 1000;
export const REALTIME_VISUAL_HISTORY_MAX_POINTS = 6_000;
/**
 * 实时地图数组的容量上限：20 点/秒 × 60 秒 × 60 分 × 24 小时 = 1728000，
 * 即按 20 点/秒连续接收一整天的数据量。
 * 这只是内存保护，超出后丢弃最旧的点；**渲染窗口另由「最大历史时间保留」控制**，
 * 两者相互独立——数组保留全量，地图只绘制窗口内的点。
 */
export const REALTIME_MAP_MAX_POINTS = 20 * 60 * 24 * 60;

export function appendRealtimePoint<T extends object>(
  points: T[] | null | undefined,
  point: T | null | undefined,
  maxPoints = 300,
): T[] {
  const currentPoints = Array.isArray(points) ? points : [];
  if (!point || typeof point !== "object") {
    return currentPoints.slice(-maxPoints);
  }
  return [...currentPoints, point].slice(-maxPoints);
}

/**
 * 实时地图追加：数组由非深度响应式容器持有，追加过程不创建中间数组。
 * maxPoints 只做容量保护，超出时丢弃最旧的点；它不参与渲染筛选，
 * 地图实际绘制的时间范围由「最大历史时间保留」决定。
 */
export function appendRealtimeBatch<T extends object>(
  points: T[] | null | undefined,
  incoming: T[] | null | undefined,
  maxPoints = REALTIME_MAP_MAX_POINTS,
): T[] {
  const currentPoints = Array.isArray(points) ? points : [];
  if (Array.isArray(incoming)) {
    for (const point of incoming) {
      if (point && typeof point === "object") currentPoints.push(point);
    }
  }
  const limit = Math.floor(maxPoints);
  if (limit > 0 && currentPoints.length > limit) {
    currentPoints.splice(0, currentPoints.length - limit);
  }
  return currentPoints;
}

export function appendRealtimeTimeWindow<
  T extends { time?: string | number | Date },
>(
  points: T[] | null | undefined,
  incoming: T[] | null | undefined,
  windowMs = REALTIME_CHART_WINDOW_MS,
  maxPoints = REALTIME_VISUAL_HISTORY_MAX_POINTS,
): T[] {
  const combined = [
    ...(Array.isArray(points) ? points : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ];
  const timestamped = combined
    .map((point) => {
      const value = point && point.time;
      const timestamp =
        value instanceof Date
          ? value.getTime()
          : value === undefined || value === null
            ? Number.NaN
            : new Date(value).getTime();
      return { point, timestamp };
    })
    .filter(({ point, timestamp }) => {
      return Boolean(point) && Number.isFinite(timestamp);
    });

  if (!timestamped.length) {
    return [];
  }

  const end = Math.max(...timestamped.map(({ timestamp }) => timestamp));
  const start = end - windowMs;
  return timestamped
    .filter(({ timestamp }) => timestamp >= start && timestamp <= end)
    .map(({ point }) => point)
    .slice(-Math.max(1, Math.floor(maxPoints)));
}

export function normalizeEnvelope<T = LegacyTelemetryPoint>(payload: unknown): DataEnvelope<T> {
  if (!payload || typeof payload !== "object") {
    throw new Error("response must be an object");
  }
  const envelope = payload as Partial<DataEnvelope<T>>;
  if (!Array.isArray(envelope.data)) {
    throw new Error("data must be an array");
  }
  if (!Number.isFinite(Number(envelope.code))) {
    throw new Error("code must be numeric");
  }
  return {
    ...envelope,
    code: Number(envelope.code),
  } as DataEnvelope<T>;
}

export function validateHistoryRange(
  day: string,
  range: readonly [string, string] | string[] | null | undefined,
): { start: string; end: string } {
  if (!day || !Array.isArray(range) || !range[0] || !range[1]) {
    throw new Error("请选择日期和完整时间范围");
  }

  const start = `${day} ${range[0]}`;
  const end = `${day} ${range[1]}`;
  const startDate = new Date(start.replace(/-/g, "/"));
  const endDate = new Date(end.replace(/-/g, "/"));
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate >= endDate
  ) {
    throw new Error("结束时间必须晚于开始时间");
  }

  return { start, end };
}

export function validateThresholdRanges(
  ranges: ReadonlyArray<ThresholdRange | number[]> | null | undefined,
): Array<[number, number]> {
  if (!Array.isArray(ranges) || !ranges.length) {
    throw new Error("阈值区间不能为空");
  }

  const normalizedRanges: Array<[number, number]> = ranges.map((range) => {
    const lower = Number(range && range[0]);
    const upper = Number(range && range[1]);
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
      throw new Error("必须为有限数值");
    }
    if (lower >= upper) {
      throw new Error("下界必须小于上界");
    }
    return [lower, upper];
  });

  normalizedRanges.slice(1).forEach((range, index) => {
    if (range[0] !== normalizedRanges[index][1]) {
      throw new Error("区间必须连续");
    }
  });

  return normalizedRanges;
}

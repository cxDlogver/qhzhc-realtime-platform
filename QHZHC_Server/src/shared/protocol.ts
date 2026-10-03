import {
  DELIVERY_POINT_LIMITS,
  type DeliveryPointLimit,
  type TelemetryBucketStatus,
  type TelemetryPoint,
} from "./types.js";

export const PROTOCOL_VERSION = 2;
export const WS_CLOSE = {
  NORMAL: 1000,
  AUTHENTICATION_EXPIRED: 4001,
  FORBIDDEN: 4003,
  PROTOCOL_ERROR: 4100,
  SERVER_ERROR: 4500,
} as const;

export type ClientMessage =
  | {
      type: "authenticate";
      accessToken: string;
      protocolVersion: number;
      robotId: string;
      resumeFromBucketStartMs: number;
      maxPointsPerSecond: DeliveryPointLimit;
    }
  | { type: "ping"; nonce: string; sentAt: number }
  | { type: "resend_time_range"; fromBucketStartMs: number };

export type ServerMessage =
  | {
      type: "welcome";
      protocolVersion: number;
      connectionId: string;
      robotId: string;
      heartbeatIntervalMs: number;
      latestBucketStartMs: number | null;
      resumedFromBucketStartMs: number;
    }
  | {
      type: "telemetry_second";
      batchId: string;
      bucketStartMs: number;
      bucketEndMs: number;
      status: TelemetryBucketStatus;
      points: TelemetryPoint[];
      sentAt: number;
      replay: boolean;
    }
  | {
      type: "replay_complete";
      throughBucketStartMs: number;
    }
  | { type: "pong"; nonce: string; serverTime: number; latestBucketStartMs: number | null }
  | {
      type: "gap";
      requestedFromBucketStartMs: number;
      earliestAvailableBucketStartMs: number | null;
      latestBucketStartMs: number;
      action: "skip-to-latest";
    }
  | { type: "error"; code: string; message: string; recoverable: boolean };

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "authenticate":
      return (
        typeof candidate.accessToken === "string" &&
        candidate.accessToken.length > 0 &&
        candidate.protocolVersion === PROTOCOL_VERSION &&
        typeof candidate.robotId === "string" &&
        isNaturalSecond(candidate.resumeFromBucketStartMs) &&
        DELIVERY_POINT_LIMITS.includes(
          candidate.maxPointsPerSecond as DeliveryPointLimit,
        )
      );
    case "ping":
      return typeof candidate.nonce === "string" && Number.isFinite(candidate.sentAt);
    case "resend_time_range":
      return isNaturalSecond(candidate.fromBucketStartMs);
    default:
      return false;
  }
}

function isNaturalSecond(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) % 1_000 === 0;
}

export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

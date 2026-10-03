import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, isClientMessage } from "../src/shared/index.js";

describe("WebSocket protocol validation", () => {
  it("accepts time-cursor authentication, ping and bucket resend shapes", () => {
    expect(isClientMessage({
      type: "authenticate",
      accessToken: "header.payload.signature",
      protocolVersion: PROTOCOL_VERSION,
      robotId: "QH-ZHC-01",
      resumeFromBucketStartMs: 1_700_000_000_000,
      maxPointsPerSecond: 2,
    })).toBe(true);
    expect(isClientMessage({ type: "ping", nonce: "1", sentAt: 1 })).toBe(true);
    expect(isClientMessage({
      type: "resend_time_range",
      fromBucketStartMs: 1_700_000_000_000,
    })).toBe(true);
  });

  it("rejects unsupported versions, ACK and invalid natural-second cursors", () => {
    expect(isClientMessage({
      type: "authenticate",
      accessToken: "header.payload.signature",
      protocolVersion: 99,
      robotId: "QH-ZHC-01",
      resumeFromBucketStartMs: 1_700_000_000_000,
      maxPointsPerSecond: 0,
    })).toBe(false);
    expect(isClientMessage({
      type: "authenticate",
      accessToken: "",
      protocolVersion: PROTOCOL_VERSION,
      robotId: "QH-ZHC-01",
      resumeFromBucketStartMs: 1_700_000_000_000,
      maxPointsPerSecond: 0,
    })).toBe(false);
    expect(isClientMessage({ type: "ack", sequence: 9 })).toBe(false);
    expect(isClientMessage({
      type: "resend_time_range",
      fromBucketStartMs: 1_700_000_000_123,
    })).toBe(false);
    expect(isClientMessage({ type: "unknown" })).toBe(false);
  });
});

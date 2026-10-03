import {
  REALTIME_CLOSE_CODE,
  resolveRealtimeRecoveryAction,
} from "@/views/DataVisualization/services/realtimeConnectionPolicy";

describe("realtime connection recovery policy", () => {
  test("refreshes credentials only for authentication expiration", () => {
    expect(
      resolveRealtimeRecoveryAction(
        REALTIME_CLOSE_CODE.AUTHENTICATION_EXPIRED,
      ),
    ).toBe("refresh-token");
  });

  test.each([
    REALTIME_CLOSE_CODE.FORBIDDEN,
    REALTIME_CLOSE_CODE.PROTOCOL_ERROR,
  ])("stops for non-recoverable close code %s", (closeCode) => {
    expect(resolveRealtimeRecoveryAction(closeCode)).toBe("stop");
  });

  test.each([
    REALTIME_CLOSE_CODE.NORMAL,
    REALTIME_CLOSE_CODE.ABNORMAL_CLOSURE,
    REALTIME_CLOSE_CODE.SERVICE_RESTART,
    REALTIME_CLOSE_CODE.TRY_AGAIN_LATER,
    REALTIME_CLOSE_CODE.HEARTBEAT_TIMEOUT,
    REALTIME_CLOSE_CODE.PAGE_HIDDEN,
    REALTIME_CLOSE_CODE.SERVER_ERROR,
  ])("reconnects for recoverable close code %s", (closeCode) => {
    expect(resolveRealtimeRecoveryAction(closeCode)).toBe("reconnect");
  });
});

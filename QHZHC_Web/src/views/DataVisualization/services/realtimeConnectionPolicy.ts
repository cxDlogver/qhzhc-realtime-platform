export const REALTIME_CLOSE_CODE = {
  NORMAL: 1000,
  ABNORMAL_CLOSURE: 1006,
  SERVICE_RESTART: 1012,
  TRY_AGAIN_LATER: 1013,
  HEARTBEAT_TIMEOUT: 4000,
  AUTHENTICATION_EXPIRED: 4001,
  PAGE_HIDDEN: 4002,
  FORBIDDEN: 4003,
  PROTOCOL_ERROR: 4100,
  SERVER_ERROR: 4500,
} as const;

export type RealtimeRecoveryAction =
  | "refresh-token"
  | "reconnect"
  | "stop";

export function resolveRealtimeRecoveryAction(
  closeCode: number,
): RealtimeRecoveryAction {
  if (closeCode === REALTIME_CLOSE_CODE.AUTHENTICATION_EXPIRED) {
    return "refresh-token";
  }
  if (
    closeCode === REALTIME_CLOSE_CODE.FORBIDDEN ||
    closeCode === REALTIME_CLOSE_CODE.PROTOCOL_ERROR
  ) {
    return "stop";
  }
  return "reconnect";
}

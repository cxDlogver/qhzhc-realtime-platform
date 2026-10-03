import request from "@/utils/request";
import type { AxiosError, AxiosResponse } from "axios";
import { normalizeEnvelope } from "../utils/visualizationData";
import type { LegacyTelemetryPoint } from "./realtimeTypes";

export interface HistoryEnvelope {
  code: number;
  message?: string;
  msg?: string;
  data: LegacyTelemetryPoint[];
  [key: string]: unknown;
}

export interface HistoryApiError extends Error {
  code: number;
}

function toApiError(payload: Partial<HistoryEnvelope>, status?: number): HistoryApiError {
  const error = new Error(
    payload.message || payload.msg || "历史数据查询失败",
  ) as HistoryApiError;
  error.code = Number(payload.code || status || 500);
  return error;
}

function unwrapResponse(response: AxiosResponse<unknown>): HistoryEnvelope {
  const payload = normalizeEnvelope<LegacyTelemetryPoint>(response.data);
  const status = response.status;
  if (
    (status && (status < 200 || status >= 300)) ||
    payload.code < 200 ||
    payload.code >= 300
  ) {
    throw toApiError(payload, status);
  }
  return payload;
}

export async function fetchHistoryRange(
  startTime: string,
  endTime: string,
): Promise<HistoryEnvelope> {
  try {
    const response = await request({
      url: "/api/chart/dataTrans/between",
      method: "get",
      params: {
        start_time: startTime,
        end_time: endTime,
      },
    });
    return unwrapResponse(response);
  } catch (error: unknown) {
    const axiosError = error as AxiosError<Partial<HistoryEnvelope>>;
    if (axiosError.response?.data) {
      throw toApiError(axiosError.response.data, axiosError.response.status);
    }
    throw error;
  }
}

export async function fetchFiveMinuteWindow(time?: string): Promise<HistoryEnvelope> {
  try {
    const params = time ? { time } : {};
    const response = await request({
      url: "/api/chart/dataTrans/5min",
      method: "get",
      params,
    });
    return unwrapResponse(response);
  } catch (error: unknown) {
    const axiosError = error as AxiosError<Partial<HistoryEnvelope>>;
    if (axiosError.response?.data) {
      throw toApiError(axiosError.response.data, axiosError.response.status);
    }
    throw error;
  }
}

export interface TelemetryPoint {
  sequence: number;
  robotId: string;
  sampledAt: string;
  longitude: number;
  latitude: number;
  altitude: number;
  speed: number;
  heading: number;
  priCo2: number;
  priCh4: number;
  priC2h6: number;
  priCo: number;
  priN2o: number;
  priH2o: number;
  picarroCh4: number;
  picarroCo2: number;
  picarroH2o: number;
  windSpeed: number;
  windDirection: number;
  temperature: number;
  humidity: number;
  pressure: number;
}

export type DeliveryPointLimit = 0 | 1 | 2 | 5 | 10 | 20;
export type TelemetryBucketStatus = "live" | "no-data";

export type ServerMessage =
  | {
      type: "welcome";
      protocolVersion: number;
      connectionId: string;
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
  | { type: "replay_complete"; throughBucketStartMs: number }
  | {
      type: "pong";
      nonce: string;
      serverTime: number;
      latestBucketStartMs: number | null;
    }
  | {
      type: "gap";
      requestedFromBucketStartMs: number;
      earliestAvailableBucketStartMs: number | null;
      latestBucketStartMs: number;
      action: "skip-to-latest";
    }
  | { type: "error"; code: string; message: string; recoverable: boolean };

export interface LegacyTelemetryPoint {
  sequence: number;
  robot_id: string;
  time: string;
  longitude: number;
  latitude: number;
  geo_location: [number, number];
  altitude: number;
  speed: number;
  heading: number;
  speed_direction: number;
  pri_co2: number;
  pri_ch4: number;
  pri_c2h6: number;
  pri_co: number;
  pri_n2o: number;
  pri_h2o: number;
  picarro_hp_12ch4_dry: number;
  picarro_hr_12ch4_dry: number;
  picarro_12co2_dry: number;
  picarro_delta_ich4_raw: number;
  picarro_h2o: number;
  wind_speed: number;
  wind_direction: number;
  weather_data: {
    temp: number;
    humidity: number;
    pressure: number;
    windSpeed: number;
    windDirection: number;
  };
}

export function toLegacyPoint(point: TelemetryPoint): LegacyTelemetryPoint {
  return {
    sequence: point.sequence,
    robot_id: point.robotId,
    time: point.sampledAt,
    longitude: point.longitude,
    latitude: point.latitude,
    geo_location: [point.longitude, point.latitude],
    altitude: point.altitude,
    speed: point.speed,
    heading: point.heading,
    speed_direction: point.windDirection,
    pri_co2: point.priCo2,
    pri_ch4: point.priCh4,
    pri_c2h6: point.priC2h6,
    pri_co: point.priCo,
    pri_n2o: point.priN2o,
    pri_h2o: point.priH2o,
    picarro_hp_12ch4_dry: point.picarroCh4,
    picarro_hr_12ch4_dry: point.picarroCh4,
    picarro_12co2_dry: point.picarroCo2,
    picarro_delta_ich4_raw: (point.picarroCh4 - point.priCh4) * 100,
    picarro_h2o: point.picarroH2o,
    wind_speed: point.windSpeed,
    wind_direction: point.windDirection,
    weather_data: {
      temp: point.temperature,
      humidity: point.humidity,
      pressure: point.pressure,
      windSpeed: point.windSpeed,
      windDirection: point.windDirection,
    },
  };
}

import request from "@/utils/request";

export type SimulatorPattern = "route" | "circle" | "burst";

export interface SimulatorConfig {
  pointsPerSecond: 1 | 5 | 10 | 20;
  robotId: string;
  pattern: SimulatorPattern;
}

export interface SimulatorStatus {
  running: boolean;
  config: SimulatorConfig;
  committedSequence: number;
  generatedPoints: number;
  lastGeneratedAt: string | null;
  connectedClients: number;
  updatedAt: string;
}

interface StatusEnvelope {
  status: SimulatorStatus;
  disconnected?: number;
}

export async function fetchSimulatorStatus(): Promise<SimulatorStatus> {
  const response = await request.get<StatusEnvelope>("/api/admin/simulator");
  return response.data.status;
}

export async function updateSimulatorConfig(
  config: SimulatorConfig,
): Promise<SimulatorStatus> {
  const response = await request.patch<StatusEnvelope>(
    "/api/admin/simulator/config",
    config,
  );
  return response.data.status;
}

export async function runSimulatorAction(
  action: "start" | "pause" | "disconnect",
): Promise<StatusEnvelope> {
  const response = await request.post<StatusEnvelope>(
    "/api/admin/simulator/action",
    { action },
  );
  return response.data;
}

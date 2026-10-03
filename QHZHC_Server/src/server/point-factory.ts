import type { SimulatorPattern, TelemetryPoint } from "../shared/index.js";

type NewTelemetryPoint = Omit<TelemetryPoint, "sequence">;

type Coordinate = readonly [longitude: number, latitude: number];

const ROUTE_POINTS_PER_SEGMENT = 50;
const ROUTE_CURVE_FREQUENCY = 0.012;
const CIRCLE_POINT_COUNT = 600;
const CIRCLE_CENTER: Coordinate = [104.817692, 28.169435];
const BURST_CENTER: Coordinate = [104.8144763, 28.1589373];

// Simplified in timestamp order from legacy-reference/.../sample_data/GPS.csv.
const ROUTE_WAYPOINTS: readonly Coordinate[] = [
  [104.8106553, 28.1693623],
  [104.8091485, 28.1659728],
  [104.8056355, 28.1657953],
  [104.8032575, 28.1639377],
  [104.8017368, 28.1612093],
  [104.8029065, 28.1587157],
  [104.8039058, 28.160786],
  [104.8074632, 28.1612865],
  [104.8046217, 28.1575248],
  [104.8045687, 28.1542515],
  [104.7989403, 28.1517632],
  [104.7987548, 28.1484015],
  [104.8003405, 28.145489],
  [104.8022032, 28.146417],
  [104.8053032, 28.150449],
  [104.8176882, 28.1560532],
  [104.815909, 28.1553538],
  [104.8163352, 28.156386],
  [104.8152923, 28.1573322],
  [104.8160485, 28.1592105],
  [104.8151205, 28.1596178],
  [104.8144763, 28.1589373],
];

function wave(index: number, frequency: number, amplitude: number): number {
  return Math.sin(index * frequency) * amplitude;
}

function rounded(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function routeCoordinate(index: number): Coordinate {
  const outboundPointCount =
    (ROUTE_WAYPOINTS.length - 1) * ROUTE_POINTS_PER_SEGMENT;
  if (index > outboundPointCount) {
    const routeEnd = ROUTE_WAYPOINTS.at(-1)!;
    const previousWaypoint = ROUTE_WAYPOINTS.at(-2)!;
    const terminalLongitude = routeEnd[0] - previousWaypoint[0];
    const terminalLatitude = routeEnd[1] - previousWaypoint[1];
    const terminalLength = Math.hypot(terminalLongitude, terminalLatitude);
    const tangentLongitude = terminalLongitude / terminalLength;
    const tangentLatitude = terminalLatitude / terminalLength;
    const normalLongitude = -tangentLatitude;
    const normalLatitude = tangentLongitude;
    const stepLength = terminalLength / ROUTE_POINTS_PER_SEGMENT;
    const continuationIndex = index - outboundPointCount;
    const forwardDistance = continuationIndex * stepLength;
    const lateralDistance =
      stepLength *
      12 *
      (1 - Math.cos(continuationIndex * ROUTE_CURVE_FREQUENCY));

    return [
      routeEnd[0] +
        tangentLongitude * forwardDistance +
        normalLongitude * lateralDistance,
      routeEnd[1] +
        tangentLatitude * forwardDistance +
        normalLatitude * lateralDistance,
    ];
  }

  const routeIndex = index;
  const segmentIndex = Math.min(
    Math.floor(routeIndex / ROUTE_POINTS_PER_SEGMENT),
    ROUTE_WAYPOINTS.length - 2,
  );
  const progress =
    (routeIndex - segmentIndex * ROUTE_POINTS_PER_SEGMENT) /
    ROUTE_POINTS_PER_SEGMENT;
  const start = ROUTE_WAYPOINTS[segmentIndex]!;
  const end = ROUTE_WAYPOINTS[segmentIndex + 1]!;
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
  ];
}

function circleCoordinate(index: number): Coordinate {
  const phase = ((index % CIRCLE_POINT_COUNT) / CIRCLE_POINT_COUNT) * Math.PI * 2;
  return [
    CIRCLE_CENTER[0] + Math.cos(phase) * 0.0016,
    CIRCLE_CENTER[1] + Math.sin(phase) * 0.0012,
  ];
}

function burstCoordinate(index: number): Coordinate {
  return [
    BURST_CENTER[0] + wave(index, 0.09, 0.00018),
    BURST_CENTER[1] + wave(index, 0.07, 0.00018),
  ];
}

function coordinateFor(index: number, pattern: SimulatorPattern): Coordinate {
  if (pattern === "route") return routeCoordinate(index);
  if (pattern === "circle") return circleCoordinate(index);
  return burstCoordinate(index);
}

function headingBetween(current: Coordinate, next: Coordinate): number {
  const latitude = ((current[1] + next[1]) / 2) * (Math.PI / 180);
  const east = (next[0] - current[0]) * Math.cos(latitude);
  const north = next[1] - current[1];
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

export function createTelemetryPoint(
  index: number,
  sampledAt: number,
  robotId: string,
  pattern: SimulatorPattern,
): NewTelemetryPoint {
  const [longitude, latitude] = coordinateFor(index, pattern);
  const heading = headingBetween(
    [longitude, latitude],
    coordinateFor(index + 1, pattern),
  );
  const plume = Math.max(0, Math.sin(index * 0.031) + wave(index, 0.007, 0.7));

  return {
    robotId,
    sampledAt: new Date(sampledAt).toISOString(),
    longitude: rounded(longitude, 7),
    latitude: rounded(latitude, 7),
    altitude: rounded(118 + wave(index, 0.021, 4), 2),
    speed: rounded(21 + wave(index, 0.043, 6), 2),
    heading: rounded(heading, 2),
    priCo2: rounded(408 + plume * 65 + wave(index, 0.13, 3), 3),
    priCh4: rounded(1.88 + plume * 0.72 + wave(index, 0.11, 0.035), 4),
    priC2h6: rounded(0.02 + plume * 0.2, 4),
    priCo: rounded(0.11 + plume * 0.08, 4),
    priN2o: rounded(0.331 + plume * 0.025, 4),
    priH2o: rounded(0.9 + wave(index, 0.02, 0.18), 4),
    picarroCh4: rounded(1.91 + plume * 0.68 + wave(index, 0.08, 0.026), 4),
    picarroCo2: rounded(411 + plume * 61 + wave(index, 0.12, 2.7), 3),
    picarroH2o: rounded(0.86 + wave(index, 0.02, 0.16), 4),
    windSpeed: rounded(2.8 + wave(index, 0.023, 1.2), 2),
    windDirection: rounded((heading + 47 + wave(index, 0.01, 25)) % 360, 2),
    temperature: rounded(24 + wave(index, 0.008, 3.2), 2),
    humidity: rounded(61 + wave(index, 0.009, 11), 2),
    pressure: rounded(1008 + wave(index, 0.005, 4.5), 2),
  };
}

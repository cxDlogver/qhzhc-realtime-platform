import { getChart } from "@/views/DataVisualization/components/chartData";
import {
  appendRealtimePoint,
  appendRealtimeBatch,
  appendRealtimeTimeWindow,
  normalizeEnvelope,
  validateHistoryRange,
} from "@/views/DataVisualization/utils/visualizationData";

describe("visualization data helpers", () => {
  test("appendRealtimePoint retains only the configured latest points", () => {
    const points = Array.from({ length: 300 }, (_, index) => ({
      time: String(index),
    }));

    const result = appendRealtimePoint(points, { time: "300" }, 300);

    expect(result).toHaveLength(300);
    expect(result[0].time).toBe("1");
    expect(result[299].time).toBe("300");
  });

  test("realtime map history appends all points without copying or eviction", () => {
    const existing = Array.from({ length: 5 }, (_, sequence) => ({ sequence }));
    const incoming = [{ sequence: 5 }, { sequence: 6 }];

    const result = appendRealtimeBatch(existing, incoming);

    expect(result).toBe(existing);
    expect(result.map((point) => point.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(existing).toHaveLength(7);
    expect(incoming).toHaveLength(2);
  });

  test("appendRealtimeTimeWindow retains the inclusive latest five minutes", () => {
    const result = appendRealtimeTimeWindow(
      [
        { time: "2026-08-22T09:59:59.000Z" },
        { time: "2026-08-22T10:00:00.000Z" },
      ],
      [
        { time: "invalid" },
        { time: "2026-08-22T10:03:00.000Z" },
        { time: "2026-08-22T10:05:00.000Z" },
      ],
    );

    expect(result.map((point) => point.time)).toEqual([
      "2026-08-22T10:00:00.000Z",
      "2026-08-22T10:03:00.000Z",
      "2026-08-22T10:05:00.000Z",
    ]);
  });

  test("appendRealtimeTimeWindow returns no points without a valid timestamp", () => {
    expect(
      appendRealtimeTimeWindow([{ time: "invalid" }], [{ value: 2.1 }]),
    ).toEqual([]);
  });

  test("normalizeEnvelope rejects a non-array data field", () => {
    expect(() => normalizeEnvelope({ code: 200, data: {} })).toThrow(
      "data must be an array",
    );
  });

  test("validateHistoryRange rejects an incomplete range", () => {
    expect(() => validateHistoryRange("", ["10:00:00", "10:05:00"])).toThrow(
      "请选择日期和完整时间范围",
    );
  });

  test("validateHistoryRange rejects a reverse range", () => {
    expect(() =>
      validateHistoryRange("2026-07-19", ["11:00:00", "10:00:00"]),
    ).toThrow("结束时间必须晚于开始时间");
  });
});

describe("visualization chart options", () => {
  test("CH4 chart uses the high-range Picarro field at or above 12 ppm", () => {
    const option = getChart({
      chartName: "CH4",
      containerWidth: 480,
      isIntialization: true,
      data: [
        {
          time: "2026-07-19 10:00:00",
          picarro_hp_12ch4_dry: 12.1,
          picarro_hr_12ch4_dry: 12.4,
          pri_ch4: 2.1,
        },
      ],
    });

    expect(option.series[0].data).toEqual([
      ["2026-07-19 10:00:00", 12.4],
    ]);
  });

  test("CH4 chart keeps a single realtime point visible and avoids x-axis label overlap", () => {
    const option = getChart({
      chartName: "CH4",
      containerWidth: 480,
      isIntialization: true,
      data: [
        {
          time: "2026-07-19 10:00:00",
          picarro_hp_12ch4_dry: 2.4,
          picarro_hr_12ch4_dry: 2.5,
          pri_ch4: 2.1,
        },
      ],
    });

    expect(option.series.every((series) => series.showSymbol)).toBe(true);
    expect(option.xAxis.axisLabel.hideOverlap).toBe(true);
    expect(option.xAxis.axisLabel.rotate).toBeLessThan(0);
  });

  test("realtime time-series charts use the supplied five-minute bounds", () => {
    const timeWindow = {
      start: Date.parse("2026-08-22T10:00:00.000Z"),
      end: Date.parse("2026-08-22T10:05:00.000Z"),
    };
    const data = [
      {
        time: "2026-08-22T10:05:00.000Z",
        picarro_hp_12ch4_dry: 2.4,
        picarro_hr_12ch4_dry: 2.5,
        pri_ch4: 2.1,
        picarro_delta_ich4_raw: -3.2,
      },
    ];

    for (const chartName of ["CH4", "iCH4"]) {
      const option = getChart({
        chartName,
        containerWidth: 480,
        isIntialization: true,
        data,
        timeWindow,
      });

      expect(option.xAxis.min).toBe(timeWindow.start);
      expect(option.xAxis.max).toBe(timeWindow.end);
    }
  });

  test("historical time-series charts keep their natural time range", () => {
    for (const chartName of ["CO2", "iCH4"]) {
      const option = getChart({
        chartName,
        containerWidth: 480,
        isIntialization: true,
        data: [],
      });

      expect(option.xAxis).not.toHaveProperty("min");
      expect(option.xAxis).not.toHaveProperty("max");
    }
  });

  test("weekly weather chart accepts an empty forecast", () => {
    expect(() =>
      getChart({
        chartName: "weekWeather",
        containerWidth: 480,
        isIntialization: true,
        data: [],
      }),
    ).not.toThrow();
  });

  test("wind chart uses the ECharts 5 item style shape", () => {
    const option = getChart({
      chartName: "windspeed",
      containerWidth: 480,
      data: [],
      isIntialization: true,
    });

    expect(
      option.series
        .filter((series) => series.itemStyle)
        .some((series) =>
          Object.prototype.hasOwnProperty.call(series.itemStyle, "normal"),
        ),
    ).toBe(false);
  });

  test("wind chart maps realtime wind fields into concentration series", () => {
    const time = "2026-08-22T10:05:00.000Z";
    const option = getChart({
      chartName: "windspeed",
      containerWidth: 480,
      isIntialization: true,
      data: [
        {
          time,
          wind_speed: 3.4,
          wind_direction: 135,
          pri_ch4: 2.3,
        },
        {
          time: "2026-08-22T10:05:01.000Z",
          wind_speed: "invalid",
          wind_direction: 180,
          pri_ch4: 2.4,
        },
      ],
    });

    expect(option.series.find((series) => series.name === "2-2.5").data).toEqual(
      [[3.4, 135, 2.3, time]],
    );
    expect(option.title[1].text).toBe("W=3.40 m/s");
    expect(
      option.series.flatMap((series) => series.data),
    ).toHaveLength(1);
  });
});

import request from "@/utils/request";
import {
  fetchFiveMinuteWindow,
  fetchHistoryRange,
} from "@/views/DataVisualization/services/historyApi";

jest.mock("@/utils/request", () => jest.fn());

describe("history API", () => {
  beforeEach(() => {
    request.mockReset();
  });

  test("range search sends the selected timestamps", async () => {
    request.mockResolvedValue({
      status: 200,
      data: { code: 200, message: "ok", data: [] },
    });

    await fetchHistoryRange(
      "2026-07-19 10:00:00",
      "2026-07-19 10:05:00",
    );

    expect(request).toHaveBeenCalledWith({
      url: "/api/chart/dataTrans/between",
      method: "get",
      params: {
        start_time: "2026-07-19 10:00:00",
        end_time: "2026-07-19 10:05:00",
      },
    });
  });

  test("five-minute search validates the response envelope", async () => {
    request.mockResolvedValue({
      status: 200,
      data: { code: 200, message: "ok", data: {} },
    });

    await expect(
      fetchFiveMinuteWindow("2026-07-19 10:00:00"),
    ).rejects.toThrow("data must be an array");
  });

  test("latest five-minute search omits the point time parameter", async () => {
    request.mockResolvedValue({
      status: 200,
      data: { code: 200, message: "ok", data: [] },
    });

    await fetchFiveMinuteWindow();

    expect(request).toHaveBeenCalledWith({
      url: "/api/chart/dataTrans/5min",
      method: "get",
      params: {},
    });
    expect(Object.keys(request.mock.calls[0][0].params)).toEqual([]);
  });

  test("a semantic API failure rejects with the server message", async () => {
    request.mockResolvedValue({
      status: 403,
      data: { code: 403, message: "没有历史数据查询权限", data: [] },
    });

    await expect(
      fetchHistoryRange("2026-07-19 10:00:00", "2026-07-19 10:05:00"),
    ).rejects.toMatchObject({
      message: "没有历史数据查询权限",
      code: 403,
    });
  });
});

jest.mock("@/views/DataVisualization/services/historyApi", () => ({
  fetchFiveMinuteWindow: jest.fn(),
  fetchHistoryRange: jest.fn(),
}));
jest.mock(
  "@/views/DataVisualization/components/PlanimetricMap.vue",
  () => ({}),
);
jest.mock(
  "@/views/DataVisualization/components/StereoscopicMap.vue",
  () => ({}),
);
jest.mock("@/views/DataVisualization/components/Weather.vue", () => ({}));
jest.mock("@/views/DataVisualization/components/Charts.vue", () => ({}));
jest.mock("@/views/DataVisualization/components/legend.vue", () => ({}));
jest.mock("@/views/DataVisualization/components/Details.vue", () => ({}));
jest.mock(
  "@/views/DataVisualization/components/RangeConfig.vue",
  () => ({}),
);

import DataVisualization from "@/views/DataVisualization/dataVisualization.vue";
import {
  fetchFiveMinuteWindow,
  fetchHistoryRange,
} from "@/views/DataVisualization/services/historyApi";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function bindDataVisualizationMethods(vm) {
  Object.entries(DataVisualization.methods).forEach(([name, method]) => {
    if (!Object.prototype.hasOwnProperty.call(vm, name)) {
      vm[name] = method.bind(vm);
    }
  });
  return vm;
}

function createViewModel() {
  return bindDataVisualizationMethods({
    day: "2026-07-19",
    value1: ["10:00:00", "10:05:00"],
    gasSelect: false,
    canVisitRealtime: true,
    canVisitHistory: true,
    searchType: 2,
    historyRequestSequence: 0,
    realtimeRequestSequence: 0,
    historyStatus: "idle",
    historyError: "",
    historyData: { code: 200, message: "ok", data: [] },
    mapList: [],
    checkData: false,
    detailsFlag: false,
    dateShow: true,
    loading: false,
    signalState: "",
    detailData: {},
    mapType: 1,
    viewFlag: true,
    weatherLocationUpdate: jest.fn(),
    $message: { warning: jest.fn() },
    $refs: {
      childMap: {
        removeTC: jest.fn(),
        updatedMapSize: jest.fn(),
      },
    },
    $store: { state: { gasData: null } },
    stopRealtime: jest.fn(),
    startRealtime: jest.fn(),
    renderHistoryResult: jest.fn(),
    $nextTick: (callback) => callback(),
  });
}

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("history query lifecycle", () => {
  beforeEach(() => {
    fetchFiveMinuteWindow.mockReset();
    fetchFiveMinuteWindow.mockResolvedValue({
      code: 200,
      message: "ok",
      data: [],
    });
    fetchHistoryRange.mockReset();
    sessionStorage.clear();
  });

  test("does not render a late historical result after switching to realtime", async () => {
    const deferred = createDeferred();
    fetchHistoryRange.mockReturnValue(deferred.promise);
    const vm = createViewModel();

    const searchPromise = DataVisualization.methods.searchHistory.call(vm);
    DataVisualization.methods.changeSearch.call(vm, 1);
    deferred.resolve({
      code: 200,
      message: "ok",
      data: [{ time: "2026-07-19 10:01:00" }],
    });
    await searchPromise;

    expect(vm.searchType).toBe(1);
    expect(vm.mapList).toEqual([]);
    expect(vm.historyData).toEqual({ code: 200, message: "ok", data: [] });
    expect(vm.historyStatus).toBe("idle");
    expect(vm.historyError).toBe("");
    expect(vm.renderHistoryResult).not.toHaveBeenCalled();
  });

  test("does not show a late historical error after switching to realtime", async () => {
    const deferred = createDeferred();
    fetchHistoryRange.mockReturnValue(deferred.promise);
    const vm = createViewModel();

    const searchPromise = DataVisualization.methods.searchHistory.call(vm);
    DataVisualization.methods.changeSearch.call(vm, 1);
    deferred.reject(new Error("历史数据查询失败"));
    await searchPromise;

    expect(vm.searchType).toBe(1);
    expect(vm.historyStatus).toBe("idle");
    expect(vm.historyError).toBe("");
    expect(vm.$message.warning).not.toHaveBeenCalled();
  });

  test("does not enter historical mode without history permission", () => {
    const vm = createViewModel();
    vm.searchType = 1;
    vm.canVisitHistory = false;

    DataVisualization.methods.changeSearch.call(vm, 2);

    expect(vm.searchType).toBe(1);
    expect(vm.stopRealtime).not.toHaveBeenCalled();
    expect(vm.$message.warning).toHaveBeenCalledWith("暂无历史查询权限");
  });

  test("initial realtime entry loads the latest five-minute window for charts and map", async () => {
    const latestWindow = {
      code: 200,
      message: "ok",
      data: [
        { time: "2026-07-20 10:00:00", geo_location: [104.1, 28.1] },
        { time: "2026-07-20 10:04:59", geo_location: [104.2, 28.2] },
      ],
    };
    fetchFiveMinuteWindow.mockResolvedValue(latestWindow);
    const vm = createViewModel();
    vm.searchType = 1;
    vm.sessionProfile = {};
    vm.gasTypeData = { PRI: [{ label: "CH4", value: "pri_ch4" }] };
    vm.gasType = "PRI";
    vm.gasTypeList = [];
    vm.getSessionProfile = jest.fn(() => ({ is_superuser: true }));

    DataVisualization.created.call(vm);
    await flushPromises();

    expect(fetchFiveMinuteWindow).toHaveBeenCalledWith();
    expect(vm.gasdata).toEqual(latestWindow);
    expect(vm.mapList).toEqual(latestWindow.data);
    expect(vm.detailData).toBe(latestWindow.data[1]);
    expect(vm.checkData).toBe(true);
    expect(vm.detailsFlag).toBe(true);
    expect(vm.weatherLocationUpdate).toHaveBeenCalledWith(latestWindow.data[1]);
    expect(vm.startRealtime).toHaveBeenCalledTimes(1);
  });

  test("initial realtime window redraws only the active map", () => {
    const latestWindow = {
      code: 200,
      message: "ok",
      data: [
        {
          time: "2026-07-20 10:00:00",
          geo_location: [104.1, 28.1],
          pri_ch4: 1.5,
        },
        {
          time: "2026-07-20 10:04:59",
          geo_location: [104.2, 28.2],
          pri_ch4: 1.8,
        },
      ],
    };
    const vm = createViewModel();
    vm.searchType = 1;
    vm.gasName = "CH4";
    vm.gasValue = "pri_ch4";
    vm.$refs.childMap.redrawRealtimeWindow = jest.fn();
    vm.$refs.child3DMap = { redrawRealtimeWindow: jest.fn() };

    DataVisualization.methods.applyRealtimeInitialWindow.call(vm, latestWindow);

    expect(vm.$refs.childMap.updatedMapSize).toHaveBeenCalledTimes(1);
    expect(vm.$refs.childMap.redrawRealtimeWindow).toHaveBeenCalledWith(
      "pri_ch4",
      "CH4",
      latestWindow.data,
    );
    expect(vm.$refs.child3DMap.redrawRealtimeWindow).not.toHaveBeenCalled();
  });

  test("3D switching resizes the active viewer before rebuilding realtime entities", () => {
    const vm = createViewModel();
    vm.mapType = 2;
    vm.gasName = "CH4";
    vm.gasValue = "pri_ch4";
    vm.mapList = [{ time: "2026-07-20 10:05:00" }];
    vm.$refs.childMap.redrawRealtimeWindow = jest.fn();
    vm.$refs.child3DMap = {
      updatedMapSize: jest.fn(),
      redrawRealtimeWindow: jest.fn(),
    };

    DataVisualization.methods.redrawRealtimeWindow.call(vm);

    expect(vm.$refs.childMap.updatedMapSize).not.toHaveBeenCalled();
    expect(vm.$refs.childMap.redrawRealtimeWindow).not.toHaveBeenCalled();
    expect(vm.$refs.child3DMap.updatedMapSize).toHaveBeenCalledTimes(1);
    expect(vm.$refs.child3DMap.redrawRealtimeWindow).toHaveBeenCalledWith(
      "pri_ch4",
      vm.mapList,
    );
    expect(
      vm.$refs.child3DMap.updatedMapSize.mock.invocationCallOrder[0],
    ).toBeLessThan(
      vm.$refs.child3DMap.redrawRealtimeWindow.mock.invocationCallOrder[0],
    );
  });

  test("switching map type preserves the user's follow preference", () => {
    const vm = createViewModel();
    vm.mapType = 2;
    vm.viewFlag = false;
    vm.searchType = 1;
    vm.redrawRealtimeWindow = jest.fn();

    DataVisualization.methods.checkMapType.call(vm, 1);

    expect(vm.mapType).toBe(1);
    expect(vm.viewFlag).toBe(false);
    expect(vm.redrawRealtimeWindow).toHaveBeenCalledTimes(1);
  });

  test("switching into 3D does not rebuild the snapshot already rendered on mount", () => {
    const vm = createViewModel();
    vm.mapType = 1;
    vm.viewFlag = true;
    vm.searchType = 1;
    vm.redrawRealtimeWindow = jest.fn();
    vm.$refs.child3DMap = {
      updatedMapSize: jest.fn(),
      changeView: jest.fn(),
    };

    DataVisualization.methods.checkMapType.call(vm, 2);

    expect(vm.mapType).toBe(2);
    expect(vm.$refs.child3DMap.updatedMapSize).toHaveBeenCalledTimes(1);
    expect(vm.$refs.child3DMap.changeView).toHaveBeenCalledWith(true);
    expect(vm.redrawRealtimeWindow).not.toHaveBeenCalled();
  });

  test("panel layout changes resize the active 3D map", () => {
    const vm = createViewModel();
    vm.mapType = 2;
    vm.$refs.childMap = undefined;
    vm.$refs.child3DMap = { updatedMapSize: jest.fn() };

    DataVisualization.methods.leftClick.call(vm);

    expect(vm.$refs.child3DMap.updatedMapSize).toHaveBeenCalledTimes(1);
  });

  test("follow preference changes are applied to the active 3D map immediately", () => {
    const vm = createViewModel();
    vm.mapType = 2;
    vm.$refs.childMap = undefined;
    vm.$refs.child3DMap = { changeView: jest.fn() };

    expect(DataVisualization.watch.viewFlag).toEqual(expect.any(Function));
    DataVisualization.watch.viewFlag.call(vm, false);

    expect(vm.$refs.child3DMap.changeView).toHaveBeenCalledWith(false);
  });

  test("switching from history to realtime replaces historical results with the latest five-minute window", async () => {
    const latestWindow = {
      code: 200,
      message: "ok",
      data: [
        { time: "2026-07-20 11:00:00", geo_location: [104.1, 28.1] },
        { time: "2026-07-20 11:04:59", geo_location: [104.2, 28.2] },
      ],
    };
    fetchFiveMinuteWindow.mockResolvedValue(latestWindow);
    const vm = createViewModel();
    vm.gasdata = {
      code: 200,
      message: "ok",
      data: [{ time: "old-history-point" }],
    };
    vm.mapList = [{ time: "old-history-point" }];
    vm.historyData = vm.gasdata;
    vm.checkData = true;
    vm.detailsFlag = true;

    await DataVisualization.methods.changeSearch.call(vm, 1);
    await flushPromises();

    expect(fetchFiveMinuteWindow).toHaveBeenCalledWith();
    expect(vm.searchType).toBe(1);
    expect(vm.historyData).toEqual({ code: 200, message: "ok", data: [] });
    expect(vm.gasdata).toEqual(latestWindow);
    expect(vm.mapList).toEqual(latestWindow.data);
    expect(vm.detailData).toBe(latestWindow.data[1]);
    expect(vm.checkData).toBe(true);
    expect(vm.detailsFlag).toBe(true);
    expect(vm.startRealtime).toHaveBeenCalledTimes(1);
  });

  test("does not request historical data without history permission", async () => {
    const vm = createViewModel();
    vm.canVisitHistory = false;

    await DataVisualization.methods.searchHistory.call(vm);

    expect(fetchHistoryRange).not.toHaveBeenCalled();
    expect(vm.historyStatus).toBe("error");
    expect(vm.historyError).toBe("暂无历史查询权限");
  });

  test("successful historical query publishes the returned range to charts and panels", async () => {
    const result = {
      code: 200,
      message: "ok",
      data: [
        { time: "2026-07-19 10:00:00", pri_ch4: 2.1 },
        { time: "2026-07-19 10:01:00", pri_ch4: 2.2 },
      ],
    };
    fetchHistoryRange.mockResolvedValue(result);
    const vm = createViewModel();
    vm.gasdata = {
      code: 200,
      message: "ok",
      data: [{ time: "old-realtime-point", pri_ch4: 1.8 }],
    };

    await DataVisualization.methods.searchHistory.call(vm);

    expect(vm.historyData).toBe(result);
    expect(vm.gasdata).toBe(result);
    expect(vm.mapList).toEqual(result.data);
    expect(vm.checkData).toBe(true);
    expect(vm.historyStatus).toBe("success");
    expect(vm.renderHistoryResult).toHaveBeenCalled();
  });

  test("realtime chart data keeps the recent point window instead of only the latest packet", () => {
    const vm = {
      searchType: 1,
      gasdata: { code: 200, message: "ok", data: [] },
      mapList: [],
      detailData: {},
      detailsFlag: false,
      weatherLocationUpdate: jest.fn(),
      signalState: "",
      stopRealtime: jest.fn(),
      $router: { replace: jest.fn() },
      $route: { fullPath: "/dataVisualization" },
    };

    DataVisualization.methods.handleRealtimePacket.call(vm, {
      code: 200,
      message: "ok",
      data: [{ time: "2026-07-19 10:00:00", pri_ch4: 2.1 }],
    });
    DataVisualization.methods.handleRealtimePacket.call(vm, {
      code: 200,
      message: "ok",
      data: [{ time: "2026-07-19 10:00:01", pri_ch4: 2.2 }],
    });

    expect(vm.gasdata.data.map((point) => point.time)).toEqual([
      "2026-07-19 10:00:00",
      "2026-07-19 10:00:01",
    ]);
    expect(vm.mapList.map((point) => point.time)).toEqual([
      "2026-07-19 10:00:00",
      "2026-07-19 10:00:01",
    ]);
  });

  test("switching gas in realtime redraws existing map concentration layers", () => {
    const vm = createViewModel();
    const mapPoints = [
      { time: "2026-07-20 10:00:00", pri_ch4: 1.5, pri_co2: 4.5 },
      { time: "2026-07-20 10:00:01", pri_ch4: 1.8, pri_co2: 4.8 },
    ];
    vm.searchType = 1;
    vm.mapList = mapPoints;
    vm.gasName = "CH4";
    vm.gasValue = "pri_ch4";
    vm.$refs.legendChild = { getGasRange: jest.fn() };
    vm.$refs.childMap.redrawConcentrationByGas = jest.fn();
    vm.$refs.child3DMap = { redrawConcentrationByGas: jest.fn() };

    DataVisualization.methods.checkGasName.call(vm, {
      label: "CO2",
      value: "pri_co2",
    });

    expect(vm.gasName).toBe("CO2");
    expect(vm.gasValue).toBe("pri_co2");
    expect(vm.$refs.legendChild.getGasRange).toHaveBeenCalledWith("CO2");
    expect(vm.renderHistoryResult).not.toHaveBeenCalled();
    expect(vm.$refs.childMap.redrawConcentrationByGas).toHaveBeenCalledWith(
      "pri_co2",
      "CO2",
      mapPoints,
    );
    expect(vm.$refs.child3DMap.redrawConcentrationByGas).toHaveBeenCalledWith(
      "pri_co2",
      mapPoints,
    );
  });
});

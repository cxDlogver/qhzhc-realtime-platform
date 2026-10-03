/* eslint-env jest, node */
import fs from "fs";
import path from "path";
import { parseComponent } from "vue-template-compiler";
import request from "@/utils/request";

jest.mock("@/utils/request", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function loadWeatherComponent() {
  const componentPath = path.resolve(
    __dirname,
    "../../src/views/DataVisualization/components/Weather.vue",
  );
  const source = fs.readFileSync(componentPath, "utf-8");
  const script = parseComponent(source).script.content;
  const factorySource = script
    .replace(/^import .*;$/gm, "")
    .replace("export default", "return");

  return new Function(
    "request",
    "echarts",
    "getChart",
    "weatherIconMap",
    factorySource,
  )(request, {}, () => ({}), {});
}

function createWeatherVm(component, location) {
  const vm = {
    location,
    $bus: { $emit: jest.fn() },
    $nextTick: (callback) => callback(),
  };

  Object.assign(vm, component.data.call(vm));
  Object.keys(component.methods).forEach((methodName) => {
    vm[methodName] = component.methods[methodName].bind(vm);
  });
  vm.initCharts = jest.fn();
  return vm;
}

function forecast(label) {
  return {
    data: {
      code: 200,
      data: {
        hourly: [{ fxTime: "2026-07-19T10:00+08:00", text: label }],
        daily: [],
      },
    },
  };
}

async function flushWeatherUpdate() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("WeatherForecast", () => {
  beforeEach(() => {
    request.get.mockReset();
  });

  test("uses the newest location when an earlier weather request resolves later", async () => {
    const component = loadWeatherComponent();
    const firstRequest = deferred();
    const secondRequest = deferred();
    request.get
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const vm = createWeatherVm(component, [104.817693, 28.169435]);
    const firstLoad = vm.loadWeather();

    vm.location = [105.817693, 29.169435];
    component.watch.location.handler.call(vm);

    expect(request.get).toHaveBeenCalledTimes(2);
    expect(request.get).toHaveBeenLastCalledWith("/api/chart/weather", {
      params: { longitude: 105.817693, latitude: 29.169435 },
    });

    secondRequest.resolve(forecast("B"));
    await flushWeatherUpdate();
    expect(vm.dayClimate[0].text).toBe("B");

    firstRequest.resolve(forecast("A"));
    await firstLoad;
    await flushWeatherUpdate();

    expect(vm.dayClimate[0].text).toBe("B");
    expect(vm.lastWeatherLocationKey).toBe("105.82,29.17");
  });

  test("reuses a forecast when realtime coordinates stay in the same location bucket", async () => {
    const component = loadWeatherComponent();
    request.get.mockResolvedValueOnce(forecast("晴"));
    const vm = createWeatherVm(component, [104.817693, 28.169435]);

    await vm.loadWeather();
    await flushWeatherUpdate();

    vm.location = [104.8178, 28.16949];
    component.watch.location.handler.call(vm);

    expect(request.get).toHaveBeenCalledTimes(1);
    expect(vm.lastWeatherLocationKey).toBe("104.82,28.17");
  });

  test("does not retry a failed weather request for the same location without user action", async () => {
    const component = loadWeatherComponent();
    request.get
      .mockRejectedValueOnce({
        response: { data: { message: "天气服务暂不可用" } },
      })
      .mockResolvedValueOnce(forecast("晴"));
    const vm = createWeatherVm(component, [104.817693, 28.169435]);

    await vm.loadWeather();
    vm.location = [104.8178, 28.16949];
    component.watch.location.handler.call(vm);

    expect(request.get).toHaveBeenCalledTimes(1);
    expect(vm.weatherStatus).toBe("error");

    await vm.retryWeather();

    expect(request.get).toHaveBeenCalledTimes(2);
    expect(vm.weatherStatus).toBe("success");
  });

  test("keeps an invalid-location error when an earlier request resolves later", async () => {
    const component = loadWeatherComponent();
    const pendingRequest = deferred();
    request.get.mockReturnValueOnce(pendingRequest.promise);

    const vm = createWeatherVm(component, [104.817693, 28.169435]);
    const firstLoad = vm.loadWeather();

    vm.location = [181, 28.169435];
    component.watch.location.handler.call(vm);

    expect(vm.weatherStatus).toBe("error");
    expect(vm.weatherError).toBe("暂无有效位置，无法获取天气预报");

    pendingRequest.resolve(forecast("stale"));
    await firstLoad;
    await flushWeatherUpdate();

    expect(vm.weatherStatus).toBe("error");
    expect(vm.weatherError).toBe("暂无有效位置，无法获取天气预报");
    expect(vm.dayClimate).toEqual([]);
    expect(vm.lastWeatherLocationKey).toBe("");
  });

  test("keeps an invalid-location error when an earlier request rejects later", async () => {
    const component = loadWeatherComponent();
    const pendingRequest = deferred();
    request.get.mockReturnValueOnce(pendingRequest.promise);

    const vm = createWeatherVm(component, [104.817693, 28.169435]);
    const firstLoad = vm.loadWeather();

    vm.location = [181, 28.169435];
    component.watch.location.handler.call(vm);

    pendingRequest.reject(new Error("stale request failure"));
    await firstLoad;
    await flushWeatherUpdate();

    expect(vm.weatherStatus).toBe("error");
    expect(vm.weatherError).toBe("暂无有效位置，无法获取天气预报");
    expect(vm.dayClimate).toEqual([]);
    expect(vm.lastWeatherLocationKey).toBe("");
  });

  test("falls back to realtime wind speed and direction when station fields are absent", () => {
    const component = loadWeatherComponent();
    const vm = createWeatherVm(component, [104.817693, 28.169435]);

    component.watch.latestPoint.handler.call(vm, {
      pressure: 1073.5254,
      relative_humidity: 100,
      r: 2.34567,
      angle: 341.88996595580545,
    });

    expect(vm.pressure).toBe("1073.525");
    expect(vm.speed_of_true_wind).toBe("2.346");
    expect(vm.direction_of_true_wind).toBe("341.89°");
  });

  test("updates station weather values from the latest point only", () => {
    const component = loadWeatherComponent();
    const vm = createWeatherVm(component, [104.817693, 28.169435]);

    component.watch.latestPoint.handler.call(vm, {
      pressure: 1073.1,
      relative_humidity: 90,
      r: 1.111,
      angle: 10,
    });
    component.watch.latestPoint.handler.call(vm, {
      pressure: 1073.5254,
      relative_humidity: 100,
      r: 2.34567,
      angle: 341.88996595580545,
    });

    expect(component.watch.latestPoint.deep).toBe(false);
    expect(vm.pressure).toBe("1073.525");
    expect(vm.speed_of_true_wind).toBe("2.346");
    expect(vm.direction_of_true_wind).toBe("341.89°");
  });
});

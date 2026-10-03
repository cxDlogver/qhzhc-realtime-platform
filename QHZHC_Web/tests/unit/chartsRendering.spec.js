import { shallowMount } from "@vue/test-utils";
import * as echarts from "echarts";
import Charts from "@/views/DataVisualization/components/Charts.vue";

const mockSetOption = jest.fn();
const mockDispose = jest.fn();
const mockResize = jest.fn();

jest.mock("echarts", () => ({
  init: jest.fn(() => ({
    setOption: mockSetOption,
    dispose: mockDispose,
    resize: mockResize,
  })),
}));

jest.mock("@/utils/resize", () => ({}));

describe("VisualizationCharts rendering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("updates ECharts synchronously so the renderer is mounted immediately", () => {
    shallowMount(Charts, {
      propsData: {
        chartName: "CH4",
        newdata: {
          data: [
            {
              time: "2026-07-19 10:00:00",
              picarro_hp_12ch4_dry: 2.4,
              picarro_hr_12ch4_dry: 2.5,
              pri_ch4: 2.1,
            },
          ],
        },
      },
    });

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(mockSetOption).toHaveBeenCalledTimes(1);
    expect(mockSetOption.mock.calls[0][1]).toEqual({
      notMerge: true,
      lazyUpdate: true,
    });
    expect(mockResize).not.toHaveBeenCalled();
  });

  test("realtime charts derive an exact rolling five-minute time axis", () => {
    const end = Date.parse("2026-08-22T10:05:00.000Z");

    shallowMount(Charts, {
      propsData: {
        chartName: "CH4",
        searchType: 1,
        newdata: {
          data: [
            {
              time: "2026-08-22T10:05:00.000Z",
              picarro_hp_12ch4_dry: 2.4,
              picarro_hr_12ch4_dry: 2.5,
              pri_ch4: 2.1,
            },
          ],
        },
      },
    });

    const option = mockSetOption.mock.calls[0][0];
    expect(option.xAxis.min).toBe(end - 5 * 60 * 1000);
    expect(option.xAxis.max).toBe(end);
  });

  test("history charts do not force the realtime five-minute time axis", () => {
    shallowMount(Charts, {
      propsData: {
        chartName: "CH4",
        searchType: 2,
        newdata: {
          data: [
            {
              time: "2026-08-22T10:05:00.000Z",
              picarro_hp_12ch4_dry: 2.4,
              picarro_hr_12ch4_dry: 2.5,
              pri_ch4: 2.1,
            },
          ],
        },
      },
    });

    const option = mockSetOption.mock.calls[0][0];
    expect(option.xAxis).not.toHaveProperty("min");
    expect(option.xAxis).not.toHaveProperty("max");
  });

  test("coalesces nearby realtime updates and cancels pending work on destroy", async () => {
    jest.useFakeTimers();
    try {
      const wrapper = shallowMount(Charts, {
        propsData: { chartName: "CH4", searchType: 1, newdata: { data: [] } },
      });
      await wrapper.setProps({ newdata: { data: [{ time: "2026-08-22T10:05:00.000Z" }] } });
      await wrapper.setProps({ newdata: { data: [{ time: "2026-08-22T10:05:01.000Z" }] } });
      expect(mockSetOption).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(120);
      expect(mockSetOption).toHaveBeenCalledTimes(2);
      await wrapper.setProps({ newdata: { data: [{ time: "2026-08-22T10:05:02.000Z" }] } });
      wrapper.destroy();
      jest.advanceTimersByTime(120);
      expect(mockSetOption).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

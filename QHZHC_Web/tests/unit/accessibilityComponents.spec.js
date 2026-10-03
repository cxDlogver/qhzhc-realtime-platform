import Details from "@/views/DataVisualization/components/Details.vue";
import Legend from "@/views/DataVisualization/components/legend.vue";
import { shallowMount } from "@vue/test-utils";

describe("visualization accessibility components", () => {
  test("details accepts a direct visualization point and fills missing fields", () => {
    const point = Details.computed.dataForm.call({
      detailData: {
        longitude: 104.817693,
        latitude: 28.169435,
        time: "2026-07-19 10:00:00",
      },
    });

    expect(point.longitude).toBe(104.817693);
    expect(point.latitude).toBe(28.169435);
    expect(point.pri_ch4).toBe("");

    const wrapper = shallowMount(Details, {
      propsData: { detailData: point },
    });

    expect(wrapper.find("button").exists()).toBe(true);
    expect(wrapper.find("button").attributes("aria-label")).toBe(
      "收起详情信息",
    );
  });

  test("details numeric values keep at most three decimal places", () => {
    expect(Details.filters.numFilter(104.851625)).toBe("104.852");
    expect(Details.filters.numFilterTwo(627.9430406885183)).toBe("627.943");
    expect(Details.filters.numFilterTwo(58.3)).toBe("58.3");
  });

  test("details formats timestamps as year-month-day hour-minute-second", () => {
    expect(
      Details.computed.dataForm.call({
        detailData: { time: "2026-07-19T10:20:30.456" },
      }).time,
    ).toBe("2026-07-19 10:20:30");
    expect(
      Details.computed.dataForm.call({
        detailData: { time: "2026-07-19 10:20:30" },
      }).time,
    ).toBe("2026-07-19 10:20:30");
    expect(
      Details.computed.dataForm.call({ detailData: { time: "" } }).time,
    ).toBe("-");
  });

  test("legend renders safe labels when a gas range is unavailable", () => {
    const vm = {
      $store: {
        getters: {
          GET_GasData: {},
        },
      },
      gasName: "CH4",
      legendList: Legend.data().legendList,
      formatRange: Legend.methods.formatRange,
    };

    Legend.methods.getGasRange.call(vm, "CH4");

    expect(vm.legendList.slice(0, 5).map((item) => item.label)).toEqual([
      "未配置",
      "未配置",
      "未配置",
      "未配置",
      "未配置",
    ]);

    const wrapper = shallowMount(Legend, {
      propsData: { gasName: "CH4" },
      mocks: { $store: vm.$store },
    });

    expect(wrapper.find("button").attributes("aria-expanded")).toBe("true");
  });
});

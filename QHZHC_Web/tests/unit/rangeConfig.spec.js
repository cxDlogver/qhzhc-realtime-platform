import {
  validateThresholdRanges,
} from "@/views/DataVisualization/utils/visualizationData";

describe("threshold range validation", () => {
  test.each([
    [
      [["a", 2], [2, 3], [3, 4], [4, 5], [5, 6]],
      "必须为有限数值",
    ],
    [
      [[2, 1], [2, 3], [3, 4], [4, 5], [5, 6]],
      "下界必须小于上界",
    ],
    [
      [[0, 2], [1, 3], [3, 4], [4, 5], [5, 6]],
      "区间必须连续",
    ],
  ])("rejects invalid ranges", (ranges, message) => {
    expect(() => validateThresholdRanges(ranges)).toThrow(message);
  });
});

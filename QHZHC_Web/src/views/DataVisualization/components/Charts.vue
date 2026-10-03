<template>
  <div class="chart-container">
    <div ref="root" id="main"></div>
    <div v-if="!gasdata.length" class="empty-state">暂无数据</div>
  </div>
</template>

<style lang="scss" scoped>
.chart-container {
  position: relative;
  width: 100%;
  height: 100%;
}

#main {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding-top: 1%;
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
</style>

<script lang="ts">
import * as echarts from "echarts";
import { getChart } from "./chartData";
import { REALTIME_CHART_WINDOW_MS } from "../utils/visualizationData";
import resize from "@/utils/resize";

export default {
  name: "VisualizationCharts",
  mixins: [resize],
  props: {
    chartName: {
      type: String,
      required: true,
    },
    newdata: {
      type: Object,
      default: () => ({}),
    },
    searchType: {
      type: Number,
      default: 1,
    },
  },
  data() {
    return {
      chart: null,
      gasdata: [],
      chartUpdateTimer: null,
    };
  },
  watch: {
    newdata: {
      handler() {
        this.scheduleUpdateOptions();
      },
      deep: false,
    },
    searchType() {
      if (this.chartUpdateTimer !== null) {
        clearTimeout(this.chartUpdateTimer);
        this.chartUpdateTimer = null;
      }
      this.updateOptions();
    },
  },
  mounted() {
    this.chart = echarts.init(this.$refs.root);
    this.updateOptions();
  },
  beforeDestroy() {
    if (this.chartUpdateTimer !== null) {
      clearTimeout(this.chartUpdateTimer);
      this.chartUpdateTimer = null;
    }
    if (this.chart) {
      this.chart.dispose();
      this.chart = null;
    }
  },
  methods: {
    scheduleUpdateOptions() {
      if (this.searchType !== 1) {
        this.updateOptions();
        return;
      }
      if (this.chartUpdateTimer !== null) return;
      this.chartUpdateTimer = setTimeout(() => {
        this.chartUpdateTimer = null;
        this.updateOptions();
      }, 120);
    },
    getRealtimeTimeWindow(points) {
      if (this.searchType !== 1) {
        return undefined;
      }
      const timestamps = points
        .map((point) => new Date(point && point.time).getTime())
        .filter((timestamp) => Number.isFinite(timestamp));
      if (!timestamps.length) {
        return undefined;
      }
      const end = Math.max(...timestamps);
      return {
        start: end - REALTIME_CHART_WINDOW_MS,
        end,
      };
    },
    updateOptions() {
      this.gasdata = Array.isArray(this.newdata && this.newdata.data)
        ? this.newdata.data.slice()
        : [];
      if (!this.chart) {
        return;
      }
      const options = getChart({
        chartName: this.chartName,
        data: this.gasdata,
        containerWidth: this.$refs.root.clientWidth,
        isIntialization: true,
        timeWindow: this.getRealtimeTimeWindow(this.gasdata),
      });
      this.chart.setOption(options, {
        notMerge: true,
        lazyUpdate: true,
      });
    },
  },
};
</script>

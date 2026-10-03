<template>
  <div class="page">
    <div class="toolbar">
      <span class="tag">chartName:</span>
      <select v-model="chartName">
        <option value="pri_ch4">pri_ch4</option>
        <option value="pri_co2">pri_co2</option>
        <option value="wind">wind</option>
      </select>

      <span class="tag">模式:</span>
      <button :class="{active: searchType === 1}" @click="switchRealtime">实时</button>
      <button :class="{active: searchType === 2}" @click="switchHistory">历史</button>

      <span class="tag">实时状态:</span>
      <button v-if="!realtimeRunning" @click="startRealtime">开始</button>
      <button v-else @click="stopRealtime">停止</button>

      <label class="tag">
        <input type="checkbox" v-model="simulateMissing" />
        模拟断点（随机缺失）
      </label>

      <span class="info">窗口: {{ newdata.begin_time }} ~ {{ newdata.end_time }}</span>
    </div>

    <div class="chart-wrap">
      <!-- 你的子组件：props 名称保持一致 -->
      <GasChart
        :chartName="chartName"
        :newdata="newdata"
        :searchType="searchType"
      />
    </div>
  </div>
</template>

<script>
// 子组件路径按你项目实际改
import GasChart from "./Charts.vue";

function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatTime(d) {
  // 输出：YYYY-MM-DD HH:mm:ss（和你子组件 new Date(str.replace(/-/g,'/')) 兼容）
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

export default {
  name: "RealtimeChartPage",
  components: { GasChart },

  data() {
    return {
      chartName: "CO2",

      // 1=实时，2=历史（与你子组件逻辑一致：切换会 clearChart）
      searchType: 1,

      // 子组件期望的入参
      newdata: {
        begin_time: "",
        end_time: "",
        data: [],
      },

      // 父组件内部：保存近5分钟的原始点
      buffer: [],

      // 实时输入控制
      realtimeRunning: false,
      timer: null,
      simulateMissing: true,

      // 5分钟窗口（ms）
      windowMs: 5 * 60 * 1000,
      tickMs: 1000,
    };
  },

  mounted() {
    // 初始化一次，避免子组件 mounted 时 newdata 为空导致显示异常
    this.bootstrapWindow();
    this.startRealtime();
  },

  beforeDestroy() {
    this.stopRealtime();
  },

  methods: {
    bootstrapWindow() {
      const now = new Date();
      const begin = new Date(now.getTime() - this.windowMs);

      this.buffer = []; // 初始空：让子组件 toFullMinutes() 去补 begin/end 两个点也可以
      this.newdata = {
        begin_time: formatTime(begin),
        end_time: formatTime(now),
        data: [],
      };
    },

    // ========== 模式切换 ==========
    switchRealtime() {
      if (this.searchType !== 1) this.searchType = 1;
      if (!this.realtimeRunning) this.startRealtime();
    },

    switchHistory() {
      // 演示：切到历史就停止实时，并塞一段“历史数据”（你也可以换成 HTTP 请求）
      if (this.searchType !== 2) this.searchType = 2;
      this.stopRealtime();
      this.loadMockHistory();
    },

    loadMockHistory() {
      // 给一段过去5分钟的“稀疏历史数据”（每10秒一个点）
      const end = new Date(Date.now() - 60 * 1000); // 假设历史结束点=1分钟前
      const begin = new Date(end.getTime() - this.windowMs);

      const arr = [];
      for (let t = begin.getTime(); t <= end.getTime(); t += 10 * 1000) {
        const d = new Date(t);
        arr.push(this.makePoint(d));
      }

      this.buffer = arr.slice();
      this.newdata = {
        begin_time: formatTime(begin),
        end_time: formatTime(end),
        data: arr, // 注意：必须是数组
      };
    },

    // ========== 实时推送 ==========
    startRealtime() {
      if (this.realtimeRunning) return;
      this.realtimeRunning = true;

      // 立刻推一次，保证页面一进来就有 end_time
      this.pushRealtimeTick();

      this.timer = setInterval(() => {
        this.pushRealtimeTick();
      }, this.tickMs);
    },

    stopRealtime() {
      this.realtimeRunning = false;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },

    pushRealtimeTick() {
      if (this.searchType !== 1) return;

      const now = new Date();
      const begin = new Date(now.getTime() - this.windowMs);

      // 随机缺失：模拟“这一秒没有数据，但 end_time 仍推进”
      const shouldDrop = this.simulateMissing && Math.random() < 0.2;

      if (!shouldDrop) {
        const p = this.makePoint(now);
        this.buffer.push(p);
      }

      // 滑动窗口裁剪：只保留 begin 之后的数据
      const beginTs = begin.getTime();
      while (this.buffer.length && new Date(this.buffer[0].time.replace(/-/g, "/")).getTime() < beginTs) {
        this.buffer.shift();
      }

      // 关键：生成新对象，触发子组件 watch(newdata)
      this.newdata = {
        begin_time: formatTime(begin),
        end_time: formatTime(now),
        data: this.buffer.slice(), // 新数组引用
      };
    },

    // 生成一条数据点：time 必须有，其余字段按你图表需要补
    makePoint(dateObj) {
      const t = dateObj.getTime() / 1000; // 秒级时间轴
      const time = formatTime(dateObj);

      // ---------- 气体浓度（平滑变化 + 微噪声） ----------
      const pri_ch4 = 2.0 + Math.sin(t / 30) * 0.3 + Math.random() * 0.05;   // ppm
      const pri_co2 = 410 + Math.sin(t / 60) * 8 + Math.random() * 1.5;      // ppm
      const pri_co  = 0.6 + Math.sin(t / 45) * 0.1 + Math.random() * 0.03;   // ppm
      const pri_c2h6 = 0.15 + Math.sin(t / 50) * 0.03 + Math.random() * 0.01;
      const pri_n2o = 0.32 + Math.sin(t / 80) * 0.02 + Math.random() * 0.005;

      // ---------- Picarro 系列（内部传感器值） ----------
      const picarro_12co2_dry = pri_co2 + Math.random();
      const picarro_delta_ich4_raw = pri_ch4 * 0.98 + Math.random() * 0.02;
      const picarro_h2o = 800 + Math.sin(t / 70) * 50 + Math.random() * 10;
      const picarro_hp_12ch4_dry = pri_ch4 * 1.01;
      const picarro_hr_12ch4_dry = pri_ch4 * 0.99;

      // ---------- 风速 / 风向 ----------
      const wind = 2.5 + Math.sin(t / 20) * 1.0 + Math.random() * 0.3;       // m/s
      const wind_zspeed = Math.sin(t / 25) * 0.5;                            // 垂直风速
      const speed = wind + Math.random() * 0.2;
      const speed_direction = (t * 3) % 360;                                 // 0–360°

      // ---------- 地理 / 高度 ----------
      const latitude = 39.9042 + Math.sin(t / 300) * 0.0003;
      const longitude = 116.4074 + Math.cos(t / 300) * 0.0003;
      const altitude = 45 + Math.sin(t / 120) * 2;

      return {
        time,

        // ====== 气体 ======
        pri_ch4: +pri_ch4.toFixed(3),
        pri_co2: +pri_co2.toFixed(2),
        pri_co: +pri_co.toFixed(3),
        pri_c2h6: +pri_c2h6.toFixed(3),
        pri_n2o: +pri_n2o.toFixed(3),
        pri_h2o: +picarro_h2o.toFixed(1),

        // ====== Picarro ======
        picarro_12co2_dry: +picarro_12co2_dry.toFixed(2),
        picarro_delta_ich4_raw: +picarro_delta_ich4_raw.toFixed(4),
        picarro_h2o: +picarro_h2o.toFixed(1),
        picarro_hp_12ch4_dry: +picarro_hp_12ch4_dry.toFixed(3),
        picarro_hr_12ch4_dry: +picarro_hr_12ch4_dry.toFixed(3),

        // ====== 风 ======
        wind: +wind.toFixed(2),
        wind_zspeed: +wind_zspeed.toFixed(2),
        speed: +speed.toFixed(2),
        speed_direction: +speed_direction.toFixed(0),

        // ====== 地理 ======
        latitude: +latitude.toFixed(6),
        longitude: +longitude.toFixed(6),
        altitude: +altitude.toFixed(2),

        geo_location: `${latitude.toFixed(6)},${longitude.toFixed(6)}`
      };
    }

  },
};
</script>

<style scoped lang="scss">
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #e9e9e9;
  flex-wrap: wrap;
}
.tag {
  font-size: 12px;
  color: #666;
}
button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
  border-radius: 6px;
}
button.active {
  border-color: #999;
  font-weight: 600;
}
.info {
  font-size: 12px;
  color: #444;
}
.chart-wrap {
  flex: 1;
  min-height: 0;
  padding: 12px;
}
.chart-wrap :deep(#main) {
  /* 确保子组件图表容器拿得到高度 */
  height: 100%;
}
</style>

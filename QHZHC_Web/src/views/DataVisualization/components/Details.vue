<!-- 详情数据 -->
<template>
  <!-- 详情信息 -->
  <div class="control-box">
    <div class="data-box" v-if="boxShow">
      <div class="data-item">
        <span><i class="iconfont icon-zhengwuwaiwang"></i>经度：</span>
        <span class="data-value">{{ dataForm.longitude | numFilter }}</span>
      </div>
      <div class="data-item">
        <span><i class="iconfont icon-rongqi"></i>纬度：</span>
        <span class="data-value">{{ dataForm.latitude | numFilter }} </span>
      </div>
      <div class="data-item">
        <span><i class="iconfont icon-shishishuju"></i>海拔：</span>
        <span class="data-value">{{ dataForm.altitude | numFilter }}m</span>
      </div>
      <div class="data-item">
        <span><i class="iconfont icon-shuiqizongliang"></i>Picarro水汽数据：</span>
        <span class="data-value">{{ dataForm.picarro_h2o | numFilterTwo }}%</span>
      </div>
      <div class="data-item">
        <span><i class="iconfont icon-shuiqizongliang"></i>PRI水汽数据：</span>
        <span class="data-value">{{ dataForm.pri_h2o | numFilterTwo }}%</span>
      </div>
      <div class="data-item">
        <span>时间：</span>
        <span class="data-value">{{ dataForm.time }}</span>
      </div>
      <div class="data-item" v-if="searchType == 1">
        <span>车速：</span>
        <span class="data-value">{{ dataForm.speed | numFilterTwo }}km/h</span>
      </div>
      <div class="data-item" v-if="searchType == 2">
        <span>{{ gasName }}：</span>
        <span class="data-value">{{ dataForm[gasValue] | numFilterTwo }}ppm</span>
      </div>
    </div>
    <button
      v-if="boxShow"
      type="button"
      class="open-btn close-btn iconfont icon-jiantou_yemian_xiangzuo"
      :aria-expanded="String(boxShow)"
      aria-label="收起详情信息"
      @click="toggleBox"
    ></button>
    <button
      v-else
      type="button"
      class="open-btn iconfont icon-jiantou_yemian_xiangyou"
      :aria-expanded="String(boxShow)"
      aria-label="展开详情信息"
      @click="toggleBox"
    ></button>
  </div>
</template>
<script lang="ts">
const DEFAULT_DETAIL_POINT = {
  altitude: "",
  latitude: "",
  longitude: "",
  picarro_12co2_dry: "",
  picarro_delta_ich4_raw: "",
  picarro_h2o: "",
  picarro_hp_12ch4_dry: "",
  picarro_hr_12ch4_dry: "",
  pri_c2h6: "",
  pri_ch4: "",
  pri_co: "",
  pri_co2: "",
  pri_h2o: "",
  pri_n2o: "",
  speed: "",
  speed_direction: "",
  time: "",
};

function formatDecimal(value, maxDigits = 3) {
  if (value === "" || value === null || value === undefined) {
    return "-";
  }
  const number = Number(value);
  return Number.isFinite(number)
    ? Number(number.toFixed(maxDigits)).toString()
    : "-";
}

function formatDateTime(value) {
  if (value === "" || value === null || value === undefined) {
    return "-";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const pad = (part) => String(part).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") +
    " " +
    [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join(":");
}

export default {
  name: "VisualizationDetails",
  props: {
    searchType: {
      type: Number,
      default: 1,
    },
    detailData: {
      type: Object,
      default: () => ({}),
    },
    gasName: {
      type: String,
      default: "",
    },
    gasValue: {
      type: String,
      default: "",
    },
  },
  data() {
    return {
      boxShow: true,
    };
  },
  computed: {
    dataForm() {
      if (!this.detailData || typeof this.detailData !== "object") {
        return { ...DEFAULT_DETAIL_POINT };
      }
      return {
        ...DEFAULT_DETAIL_POINT,
        ...this.detailData,
        time: formatDateTime(this.detailData.time),
      };
    },
  },
  filters: {
    numFilter(value) {
      return formatDecimal(value);
    },
    numFilterTwo(value) {
      return formatDecimal(value);
    },
  },
  methods: {
    toggleBox() {
      this.boxShow = !this.boxShow;
    },
  },
};
</script>
<style lang="scss" scoped>
.control-box {
  position: absolute;
  width: 254px;
  height: 270px;
  bottom: 50px;
  left: 20px;
  z-index: 666;
  .data-box {
    position: absolute;
    width: 270px;
    bottom: 0;
    left: 0px;
    z-index: 666;
    background: linear-gradient(319deg,
        rgba(0, 149, 255, 0.0804) -7%,
        rgba(18, 35, 54, 0.4) 86%);
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 4px;
    padding: 6px;
    padding-bottom: 0;
    .data-item {
      height: 31px;
      border-radius: 2px;
      opacity: 1;
      line-height: 29px;
      background: rgba(18, 35, 54, 0.83);
      box-sizing: border-box;
      border: 0.6px solid rgba(255, 255, 255, 0.12);
      margin-bottom: 6px;
      color: rgba(255, 255, 255, 0.8);
      padding: 0 6px;
      i {
        margin-right: 6px;
      }
      .data-value {
        color: #0095ff;
      }
    }
  }
  .open-btn {
    height: 53px;
    width: 21px;
    position: absolute;
    bottom: 0;
    background: url("../../../assets/imgs/cbtn.png") no-repeat;
    background-size: 21px 53px;
    writing-mode: vertical-rl;
    text-align: center;
    padding: 0px;
    display: flex;
    -webkit-display: flex;
    flex-direction: column;
    /* align-content: center; */
    /* vertical-align: middle; */
    justify-content: center;
    cursor: pointer;
    font-size: 13px;
    border: 0;
    color: inherit;
    font: inherit;
    outline-offset: 2px;
  }
  .close-btn {
    left: 270px;
  }
}
</style>

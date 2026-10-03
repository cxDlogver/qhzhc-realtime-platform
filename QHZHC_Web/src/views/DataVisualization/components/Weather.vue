<template>
  <div id="weather-container">
    <div class="arrow">
      <i
        v-if="activeName === 'first'"
        class="iconfont1 icon-circle-left disabled"
        @click="sliderMoveToLeft"
      ></i>
    </div>
    <div class="main">
      <div v-if="weatherLoading" class="weather-state" role="status">
        正在加载天气预报...
      </div>
      <div
        v-else-if="weatherStatus === 'error'"
        class="weather-state weather-error"
        role="alert"
      >
        {{ weatherError }}
        <button type="button" class="weather-retry" @click="retryWeather">
          重试
        </button>
      </div>
      <div
        v-else-if="
          weatherStatus === 'success' &&
          !dayClimate.length &&
          !weekClimate.length
        "
        class="weather-state"
      >
        暂无天气预报
      </div>
      <!-- 顶部当前气温、天气、 风速-->
      <div class="current-weather">
        <div class="current-climate">
          <!-- 天气预报的气候信息 -->
          <div v-if="dayClimate.length > 0" class="climate-info1">
            <svg class="weather-icon" aria-hidden="true">
              <use
                :xlink:href="
                  '#' + getWeatherIcon(dayClimate[0].fxTime, dayClimate[0].text)
                "
              ></use>
            </svg>
            <!-- <i :class="'weather-icon iconfont '+ getWeatherIcon(dayClimate[0].fxTime, dayClimate[0].text)"></i> -->
            <div class="weather-text">
              <div class="current-temperature">
                {{ dayClimate[0].temp }}<sup>&deg;C</sup>
              </div>
              <div class="current-text">{{ dayClimate[0].text }}</div>
            </div>
          </div>
          <!-- 气象站实时的气候信息 -->
          <div class="climate-info2">
            <div class="station-data">
              <div class="station-icon">
                <img :src="require('@/assets/imgs/spfx-icon.png')" alt="" />
              </div>
              <div class="station-text">
                {{ direction_of_true_wind | emptyValue }}<br />水平风向
              </div>
            </div>
            <div class="station-data">
              <div class="station-icon">
                <img :src="require('@/assets/imgs/sd-icon.png')" alt="" />
              </div>
              <div class="station-text">
                {{ relative_humidity | emptyValue
                }}<span v-if="relative_humidity">%</span><br />湿度
              </div>
            </div>

            <div class="station-data">
              <div class="station-icon">
                <img :src="require('@/assets/imgs/fs-icon.png')" alt="" />
              </div>
              <div class="station-text">
                {{ speed_of_true_wind | emptyValue
                }}<span v-if="speed_of_true_wind">m/s</span><br />水平风速
              </div>
            </div>
            <div class="station-data">
              <div class="station-icon">
                <img :src="require('@/assets/imgs/qy-icon.png')" alt="" />
              </div>
              <div class="station-text">
                {{ pressure | emptyValue }}<br />气压
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 分割线 -->
      <hr class="splitter" />
      <!-- 天气预测表 -->
      <div class="forecast-tabs">
        <el-tabs class="tabs" v-model="activeName" @tab-click="handleClick">
          <el-tab-pane id="day-tab" label="当日逐小时预报" name="first">
            <!-- 24小时天气 -->
            <div class="day-weather" style="height: 30%">
              <div
                class="weather-item day-item"
                v-for="(climate, index) of dayClimate"
                :key="index"
              >
                <!-- <div style="font-size: 14px;">{{ climate.fxTime.split("T")[1].substring(0, 5) }}</div> -->
                <div style="font-size: 14px">
                  {{ climate.fxTime | msToDate }}
                </div>
                <svg class="weather-icon" aria-hidden="true">
                  <use
                    :xlink:href="
                      '#' + getWeatherIcon(climate.fxTime, climate.text)
                    "
                  ></use>
                </svg>
                <!-- <i :class="'weather-icon iconfont '+getWeatherIcon(climate.fxTime, climate.text)"></i> -->
                <div>{{ climate.text }}</div>
              </div>
            </div>
            <!-- 24小时图表 -->
            <div class="day-weather" ref="root1" style="height: 35%"></div>
            <!-- 24小时风速 -->
            <div class="day-weather" style="height: 35%">
              <div
                class="weather-item day-item"
                v-for="climate of dayClimate"
                :key="climate.fxTime"
              >
                <div class="fengsu">
                  <span
                    style="font: 700 14px 'Microsoft YaHei'; color: #1deb85"
                    >{{ climate.windSpeed }}</span
                  >
                  km/h
                </div>
                <div class="fengxiang">
                  <i
                    class="iconfont icon-fill_fangxiang"
                    :style="`transform: rotate(${
                      Number(climate.wind360) - 45 - 180
                    }deg);`"
                  ></i>
                  <div>{{ climate.windDir }}</div>
                </div>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane id="week-tab" label="七天天气预报" name="second">
            <!-- 七天天气 -->
            <div class="week-weather" style="height: 30%">
              <div
                class="weather-item week-item"
                v-for="climate of weekClimate"
                :key="climate.fxDate"
              >
                <div style="font-size: 14px">
                  {{ climate.fxDate.substring(5) }}
                </div>
                <svg class="weather-icon" aria-hidden="true">
                  <use
                    :xlink:href="
                      '#' +
                      getWeatherIcon(climate.fxDate + 'T12', climate.textDay)
                    "
                  ></use>
                </svg>
                <!-- <i :class="'weather-icon iconfont '+getWeatherIcon(climate.fxDate+'T12', climate.textDay)"></i> -->
                <div>{{ climate.textDay }}</div>
              </div>
            </div>
            <!-- 七天天气图表 -->
            <div class="week-weather" ref="root2" style="height: 50%"></div>
            <!-- 七天降雨量和云量 -->
            <div class="week-weather" style="height: 20%">
              <div
                class="weather-item week-item"
                v-for="climate of weekClimate"
                :key="climate.fxDate"
              >
                <div class="cloud_precip fengxiang">
                  <!-- <div style="font-size: 12px;">雨量</div>
                  <div style="color:#1DEB85;">{{ climate.cloud }}%</div>
                  <hr class="splitter"> -->
                  <div style="font-size: 12px">降雨量</div>
                  <div style="color: #1deb85">{{ climate.precip }}</div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
    <div class="arrow">
      <i
        v-if="activeName === 'first'"
        class="iconfont1 icon-circle-right"
        @click="sliderMoveToRight"
      ></i>
    </div>
  </div>
</template>

<style lang="scss" scoped>
#weather-container {
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  width: 100%;
  height: 100%;
  .arrow {
    padding-top: 90px;
    box-sizing: border-box;
    width: 18px;
    height: 100%;
    display: flex;
    align-items: center;
    .icon-circle-left,
    .icon-circle-right {
      color: #6fb2e1;
      font-size: 18px;
      cursor: pointer;
      z-index: 10;
    }
    .icon-circle-right.disabled,
    .icon-circle-left.disabled {
      color: grey;
      font-size: 18px;
      cursor: default;
      z-index: 10;
    }
  }
  .splitter {
    width: 100%;
    margin: 0;
    padding: 0;
    opacity: 0.3;
  }
  .main {
    width: calc(100% - 36px);
    height: 100%;
    .current-weather {
      display: flex;
      align-items: center;
      height: 80px;
      width: 100%;
      .current-climate {
        display: flex;
        justify-content: center;
        height: 100%;
        width: 100%;
        .climate-info1 {
          display: flex;
          justify-content: space-evenly;
          align-items: center;
          height: 100%;
          width: 40%;
          font-weight: 400;
          .weather-icon {
            // width: 100%;
            height: 80%;
          }
          .weather-text {
            .current-temperature {
              font: 700 30px "Microsoft YaHei";
              sup {
                font: 700 14px "Microsoft YaHei";
                vertical-align: top;
              }
            }
            .current-text {
              font-size: 16px;
            }
          }
        }
        .climate-info2 {
          display: flex;
          justify-content: space-around;
          height: 100%;
          width: 70%;
          .station-data {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-evenly;
            height: 100%;
            width: 50px;
            .station-icon {
              width: 34px;
              height: 34px;
              border-radius: 4px;
              opacity: 1;
              // background: linear-gradient(136deg, #5891FF 5%, rgba(88, 145, 255, 0) 51%), rgba(189, 212, 255, 0.09);
              box-sizing: border-box;
              // border: 1px solid;
              // border-image: linear-gradient(311deg, rgba(189, 212, 255, 0) -1%, #00FFFF 114%) 1;
              // backdrop-filter: blur(8.36px);
              img {
                width: 100%;
                height: 100%;
              }
            }
            .station-text {
              font-size: 12px;
              text-align: center;
            }
          }
        }
      }
    }
    .weather-state {
      color: #b9cae7;
      font-size: 12px;
      min-height: 20px;
      padding: 2px 0;
      text-align: center;
    }
    .weather-error {
      color: #ffb3b3;
    }
    .weather-retry {
      background: transparent;
      border: 1px solid #6fb2e1;
      border-radius: 3px;
      color: #d5e8ff;
      cursor: pointer;
      font-size: 12px;
      margin-left: 8px;
      padding: 1px 6px;
    }
    .forecast-tabs {
      height: calc(100% - 80px);
      width: 100%;
      .el-tabs {
        width: 100%;
        height: 100%;
        /** el-tabs的标签框 */
        :deep(.el-tabs__header) {
          height: 30px;
          margin-bottom: 0;
          .el-tabs__nav-wrap,
          .el-tabs__nav-scroll,
          .el-tabs__nav {
            height: 100%;
          }
          .el-tabs__nav-wrap::after {
            position: static;
          }
          .el-tabs__item {
            height: 100%;
            line-height: 30px;
            font-size: 16px;
            color: #999;
            padding: 0 20px;
          }
          .el-tabs__item.is-active {
            color: white;
            /* 字体颜色 */
            font-weight: 700;
            border-radius: 6px;
            background-color: #20304d;
          }
        }
        /** el-tabs的内容框 */
        :deep(.el-tabs__content) {
          width: 100%;
          height: calc(100% - 30px);
          .el-tab-pane {
            display: flex;
            flex-direction: column;
            overflow-x: scroll;
            overflow-y: hidden;
            width: 100%;
            height: 100%;
            .day-weather {
              display: flex;
              min-width: (100% * 24 / 7);
              height: 33%;
              .day-item {
                width: (100% / 24);
              }
            }
            .week-weather {
              display: flex;
              width: 100%;
              height: 33%;
              .week-item {
                width: (100% / 7);
              }
            }
            .weather-item {
              display: flex;
              flex-direction: column;
              font-size: 12px;
              justify-content: space-evenly;
              align-items: center;
              .weather-icon {
                height: 30%;
                width: 100%;
              }
              .fengsu {
                height: 20%;
              }
              .fengxiang {
                display: flex;
                height: 50%;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                opacity: 1;
                background: linear-gradient(
                  180deg,
                  #273754 0%,
                  rgba(8, 14, 25, 0) 100%
                );
                width: 90%;
                font-size: 10px;

                .icon-fill_fangxiang {
                  font-size: 20px;
                  color: #1deb85;
                  background: radial-gradient(
                    circle at 60%,
                    rgba(29, 235, 133, 0.5),
                    rgba(39, 55, 84, 0) 70%
                  );
                  border-radius: 0.4px;
                  opacity: 1;
                }
              }
              .cloud_precip {
                height: 100%;
                justify-content: space-evenly;
              }
            }
          }
          /* 自定义滚动条整体区域 */
          #day-tab::-webkit-scrollbar {
            height: 0px;
            /* 水平滚动条的高度 */
          }

          /* 自定义滚动条滑块部分 */
          // #day-tab::-webkit-scrollbar-thumb {
          //   background-color: #3498db; /* 滑块的颜色 */
          //   border-radius: 10px; /* 滑块的圆角 */
          // }
        }
      }
    }
  }
}
</style>

<script lang="ts">
import { getChart } from "./chartData";
import * as echarts from "echarts";
import weatherIconMap from "../../../utils/weatherIconMap";
import request from "@/utils/request";

const WEATHER_LOCATION_PRECISION = 2;

function isPresent(value) {
  return value !== "" && value !== null && value !== undefined;
}

function formatDecimal(value, maxDigits = 3) {
  if (!isPresent(value)) {
    return "";
  }
  const number = Number(value);
  return Number.isFinite(number)
    ? Number(number.toFixed(maxDigits)).toString()
    : "";
}

function firstPresent(...values) {
  return values.find(isPresent);
}

function formatWindDirection(value) {
  if (!isPresent(value)) {
    return "";
  }
  const number = Number(value);
  if (Number.isFinite(number)) {
    return `${formatDecimal(number)}°`;
  }
  return String(value);
}

export default {
  name: "WeatherForecast",
  props: {
    location: {
      type: Array,
      default: () => [],
    },
    latestPoint: {
      type: Object,
      default: null,
    },
  },
  filters: {
    emptyValue(value) {
      return value || "-";
    },
    msToDate(msec) {
      const hour = new Date(msec).getHours();
      return Number.isFinite(hour)
        ? `${String(hour).padStart(2, "0")}:00`
        : "-";
    },
  },
  data() {
    return {
      chart1: null,
      chart2: null,
      activeName: "first",
      weekClimate: [],
      /*
      [0:{
          cloud: "25", // 云量百分比，表示天空中云层的覆盖程度。例如，25% 代表天空中有25%的区域被云层覆盖。
          fxDate: "2024-07-26", // 数据记录日期，使用YYYY-MM-DD格式。
          humidity: "84", // 相对湿度百分比，表示空气中水蒸气的实际量与该温度下空气能容纳的最大水蒸气量的比值。
          iconDay: "100", // 白天气象图标代码，用于显示白天气象状态的图标。
          iconNight: "305", // 晚上气象图标代码，用于显示晚上天气状态的图标。
          moonPhase: "亏凸月", // 月相描述，例如 "亏凸月" 表示亏凸月。
          moonPhaseIcon: "805", // 月相图标代码，用于显示月相的图标。
          moonrise: "22:38", // 月出时间，使用HH:MM格式。
          moonset: "10:32", // 月落时间，使用HH:MM格式。
          precip: "0.0", // 降水量，表示降水的实际量，以毫米为单位。
          pressure: "992", // 气压，以百帕（hPa）为单位。
          sunrise: "05:38", // 日出时间，使用HH:MM格式。
          sunset: "19:22", // 日落时间，使用HH:MM格式。
          tempMax: "35", // 最高温度，以摄氏度为单位。
          tempMin: "28", // 最低温度，以摄氏度为单位。
          textDay: "晴", // 白天气象描述，例如 "晴" 表示白天晴天。
          textNight: "小雨", // 晚天气象描述，例如 "小雨" 表示夜晚有小雨。
          uvIndex: "11", // 紫外线指数，表示紫外线的强度。
          vis: "24", // 能见度，以公里为单位。
          wind360Day: "45", // 白天风向，以360度表示，其中0度为北方，90度为东方，180度为南方，270度为西方。
          wind360Night: "0", // 晚上风向，以360度表示。
          windDirDay: "东北风", // 白天风向描述，例如 "东北风" 表示风来自东北方向。
          windDirNight: "北风", // 晚上风向描述，例如 "北风" 表示风来自北方向。
          windScaleDay: "3-4", // 白天风力等级，表示风速的范围，例如 "3-4"级风力。
          windScaleNight: "1-3", // 晚上风力等级，表示风速的范围。
          windSpeedDay: "24", // 白天风速，以公里每小时为单位。
          windSpeedNight: "16" // 晚上风速，以公里每小时为单位。
        }
      ]
      */
      dayClimate: [],
      temperature: "", //温度
      pressure: "", //气压
      speed_of_true_wind: "", //风速
      direction_of_true_wind: "", //风向
      relative_humidity: "", //湿度
      weatherStatus: "idle",
      weatherError: "",
      lastWeatherLocationKey: "",
      activeWeatherLocationKey: "",
      failedWeatherLocationKey: "",
      weatherRequestSequence: 0,
      /*
      [0:{
        cloud: "45", // 云量百分比
        dew: "25",   // 露点温度（摄氏度）
        fxTime: "2024-07-26T12:00+08:00", // 数据记录时间（ISO 8601格 式）
        humidity: "61", // 相对湿度百分比
        icon: "100", // 天气图标代码（通常用于显示天气状态图标）
        pop: "7", // 降水概率百分比
        precip: "0.0", // 降水量（毫米）
        pressure: "991", // 气压（百帕）
        temp: "34", // 温度（摄氏度）
        text: "晴", // 天气描述（例如：晴、阴、雨等）
        wind360: "356", // 风向（360度，0度代表北方）
        windDir: "北风", // 风向描述（例如：北风、东风等）
        windScale: "1-3", // 风力等级（例如：1-3级）
        windSpeed: "18" // 风速（公里每小时）
      }],
      */
    };
  },
  computed: {
    weatherLoading() {
      return this.weatherStatus === "loading";
    },
  },
  watch: {
    latestPoint: {
      deep: false,
      handler(point) {
        this.applyLatestPoint(point);
      },
    },
    location: {
      deep: true,
      handler() {
        this.loadWeather();
      },
    },
  },
  created() {
    this.applyLatestPoint(this.latestPoint);
    this.loadWeather();
  },
  beforeDestroy() {
    if (this.chart1) {
      this.chart1.dispose();
      this.chart1 = null;
    }
    if (this.chart2) {
      this.chart2.dispose();
      this.chart2 = null;
    }
  },
  methods: {
    applyLatestPoint(point) {
      if (!point) return;
      this.pressure = formatDecimal(point.pressure);
      this.speed_of_true_wind = formatDecimal(
        firstPresent(point.speed_of_true_wind, point.r),
      );
      this.direction_of_true_wind = formatWindDirection(
        firstPresent(point.direction_of_true_wind, point.angle),
      );
      this.relative_humidity = formatDecimal(point.relative_humidity);
    },
    handleClick() {
      if (this.activeName === "first") {
        this.$nextTick(() => {
          this.initCharts();
          this.sliderInit();
        });
      }
      if (this.activeName === "second") {
        this.$nextTick(() => {
          this.initCharts();
        });
      }
    },
    initCharts() {
      const isDaily = this.activeName === "second";
      const ref = isDaily ? "root2" : "root1";
      const chartKey = isDaily ? "chart2" : "chart1";
      const chartName = isDaily ? "weekWeather" : "dayWeather";
      const data = isDaily ? this.weekClimate : this.dayClimate;
      const container = this.$refs[ref];
      if (!container) {
        return;
      }

      if (!this[chartKey]) {
        this[chartKey] = echarts.init(container);
      }
      this[chartKey].setOption(
        getChart({
          chartName,
          containerWidth: container.clientWidth * 0.025,
          data,
        }),
        { notMerge: true, lazyUpdate: true },
      );
    },
    getWeatherLocation() {
      if (!Array.isArray(this.location) || this.location.length !== 2) {
        return null;
      }
      const longitude = Number(this.location[0]);
      const latitude = Number(this.location[1]);
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        return null;
      }
      return { longitude, latitude };
    },
    getWeatherErrorMessage(error) {
      if (error && error.response && error.response.data) {
        return error.response.data.message || "天气数据获取失败";
      }
      return (error && error.message) || "天气数据获取失败";
    },
    async loadWeather(force = false) {
      const location = this.getWeatherLocation();
      if (!location) {
        this.weatherRequestSequence += 1;
        this.activeWeatherLocationKey = "";
        this.failedWeatherLocationKey = "";
        this.weatherStatus = "error";
        this.weatherError = "暂无有效位置，无法获取天气预报";
        return;
      }

      const locationKey = `${location.longitude.toFixed(
        WEATHER_LOCATION_PRECISION,
      )},${location.latitude.toFixed(WEATHER_LOCATION_PRECISION)}`;
      if (
        (this.weatherStatus === "loading" &&
          this.activeWeatherLocationKey === locationKey) ||
        (!force &&
          ((this.weatherStatus === "success" &&
            this.lastWeatherLocationKey === locationKey) ||
            (this.weatherStatus === "error" &&
              this.failedWeatherLocationKey === locationKey)))
      ) {
        return;
      }

      const requestSequence = this.weatherRequestSequence + 1;
      this.weatherRequestSequence = requestSequence;
      this.activeWeatherLocationKey = locationKey;
      this.weatherStatus = "loading";
      this.weatherError = "";
      try {
        const response = await request.get("/api/chart/weather", {
          params: location,
        });
        const payload = response && response.data;
        const forecast = payload && payload.data;
        if (
          !payload ||
          Number(payload.code) !== 200 ||
          !forecast ||
          !Array.isArray(forecast.hourly) ||
          !Array.isArray(forecast.daily)
        ) {
          throw new Error((payload && payload.message) || "天气数据格式错误");
        }

        if (requestSequence !== this.weatherRequestSequence) {
          return;
        }
        this.dayClimate = forecast.hourly;
        this.weekClimate = forecast.daily;
        this.lastWeatherLocationKey = locationKey;
        this.failedWeatherLocationKey = "";
        this.weatherStatus = "success";
        if (this.dayClimate[0]) {
          this.$bus.$emit("weatherSignal", this.dayClimate[0]);
        }
        this.$nextTick(() => {
          this.initCharts();
        });
      } catch (error) {
        if (requestSequence !== this.weatherRequestSequence) {
          return;
        }
        this.failedWeatherLocationKey = locationKey;
        this.weatherStatus = "error";
        this.weatherError = this.getWeatherErrorMessage(error);
      }
    },
    retryWeather() {
      return this.loadWeather(true);
    },
    // 初始化滑动条
    sliderInit() {
      const container = document.getElementById("day-tab");
      if (container.scrollLeft > 0) {
        document
          .getElementsByClassName("icon-circle-left")[0]
          .classList.remove("disabled");
      }
      if (
        container.scrollLeft + container.clientWidth >=
        container.scrollWidth - 1
      ) {
        document
          .getElementsByClassName("icon-circle-right")[0]
          .classList.add("disabled");
      }
    },
    // 点击箭头向左滑动
    sliderMoveToLeft() {
      const container = document.getElementById("day-tab");
      // 向左滚动100px
      container.scrollBy({ left: -100, behavior: "smooth" });
      if (
        container.scrollLeft + container.clientWidth <=
        container.scrollWidth
      ) {
        document
          .getElementsByClassName("icon-circle-right")[0]
          .classList.remove("disabled");
      }
      if (container.scrollLeft <= 0) {
        document
          .getElementsByClassName("icon-circle-left")[0]
          .classList.add("disabled");
      }
    },
    // 点击箭头向右滑动
    sliderMoveToRight() {
      const container = document.getElementById("day-tab");
      container.scrollBy({ left: 100, behavior: "smooth" }); // 向右滚动100px
      if (container.scrollLeft >= 0) {
        document
          .getElementsByClassName("icon-circle-left")[0]
          .classList.remove("disabled");
      }
      if (
        container.scrollLeft + container.clientWidth >=
        container.scrollWidth - 1
      ) {
        document
          .getElementsByClassName("icon-circle-right")[0]
          .classList.add("disabled");
      }
    },
    // 获取天气图标
    getWeatherIcon(time, key) {
      if (typeof time === "string") {
        time = Number(time.split("T")[1].substring(0, 2));
      }
      if (time >= 7 && time <= 19) {
        return Object.keys(weatherIconMap).includes(key)
          ? weatherIconMap[key]["日"]
          : weatherIconMap["未知"]["日"];
      } else {
        return Object.keys(weatherIconMap).includes(key)
          ? weatherIconMap[key]["夜"]
          : weatherIconMap["未知"]["夜"];
      }
    },
  },
};
</script>

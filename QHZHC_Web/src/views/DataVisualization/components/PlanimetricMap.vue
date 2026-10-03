<!--
 * @Author: zhou
 * @Date: 2024-01-22 16:49:09
 * @LastEditors: zhou
 * @LastEditTime: 2024-07-04 16:16:27
 * @Description:地图
 * @param:
 * @return:
-->
<template>
  <div class="planimetric-map" :style="{ height: height, width: width }">
    <div id="olMap"></div>
    <p v-if="!isBaseMapConfigured" class="map-config-notice" role="status">
      地图底图未配置，请设置 VUE_APP_TDT_TOKEN
    </p>
  </div>
</template>

<script lang="ts">
/**
 * 地图组件（OpenLayers + 天地图底图）
 *
 * 功能概览：
 * 1) 初始化天地图底图 + 注记图层
 * 2) 维护 3 个业务图层：
 *    - iconLayer：车辆图标（实时/历史轨迹播放）
 *    - routeLayer：轨迹线（历史轨迹播放时绘制）
 *    - pointLayer：浓度点（实时/历史点绘制 + 点击选中）
 * 3) 支持两种模式：
 *    - 实时：mapList 更新时，移动车辆并追加绘制浓度点
 *    - 历史：进入历史模式后，可绘制历史点、播放历史轨迹（车辆沿线移动）
 */

import "ol/ol.css";

import OlMap from "ol/Map";
import View from "ol/View";

import { Tile as TileLayer, Vector as VectorLayer } from "ol/layer";
import XYZ from "ol/source/XYZ";
import { Vector as VectorSource } from "ol/source";

import Feature from "ol/Feature";
import { Point } from "ol/geom";
import { LineString } from "ol/geom";

import { defaults as defaultControls } from "ol/control";
import { unByKey } from "ol/Observable";

import { transform } from "ol/proj";
import {
  Style,
  Icon,
  Fill,
  Stroke,
  Circle as CircleStyle,
} from "ol/style";

import iconSrc from "@/assets/imgs/truck.png";

const ROUTE_CHUNK_MAX_POINTS = 256;

export default {
  props: {
    width: { type: String, default: "100%" },
    height: { type: String, default: "100%" },
    mapList: { type: Array, required: true },
    realtimeBatch: { type: Array, default: () => [] },
    realtimeBatchId: { type: Number, default: 0 },
    searchType: { type: Number },
    /** 「最大历史保留」窗口（毫秒）；0 表示不限制。只影响可视对象，不改动点数组。 */
    historyWindowMs: { type: Number, default: 0 },
  },

  data() {
    return {
      // ========= 地图对象 =========
      map: null,
      // 有天地图 token 时沿用原底图，否则使用免配置的公开底图，保证演示环境可直接验收。
      isBaseMapConfigured: true,

      // ========= 图层 / 数据源 =========
      iconLayer: null,       // 车辆图层（layer）
      iconSource: null,      // 车辆图标数据源（source）
      iconFeature: null,     // 车辆 Feature（唯一）

      routeLayer: null,      // 轨迹线图层（layer）
      routeSource: null,     // 轨迹线数据源（source）
      routeChunkFeature: null,
      routeChunkPointCount: 0,
      routeChunkLastCoordinate: null,

      pointLayer: null,      // 浓度点图层（layer）
      pointSource: null,     // 浓度点数据源（source）
      pointStyleCache: new Map(),
      routeStyleCache: new Map(),
      selectedPointFeature: null,

      // ========= 业务数据 =========
      points: [],            // mapList 的工作副本（点列表）
      index: 0,              // 当前绘制/播放点的游标

      // 气体浓度区间与字段
      gasRange: [],          // 当前气体的区间范围（来自 Vuex）
      gasType: "",           // 数据字段名（如 pri_ch4 / pri_co2 等）
      gasName: "",           // 气体中文名（用于取区间）

      // ========= 定时器（历史轨迹播放） =========
      timer: null,
      mapClickKey: null,
      mapClickHandler: null,

      // ========= 配色 =========
      colorList: ["#00FF44", "#FCFF63", "#FF7B10", "#F90000", "#9900FF", "#ADADAD"],

      // ========= 展示数据（点击点时写入，原逻辑依赖父组件） =========
      dataForm: this.getEmptyDataForm(),

      // 可能用于业务但你没展示：这里保留
      ip: "",
    };
  },

  created() {
    // 保持你原先逻辑：从父组件取当前气体字段与名称
    this.ip = window.location.origin;
    this.gasType = this.$parent.gasValue;
    this.gasName = this.$parent.gasName;
  },

  mounted() {
    this.initMap();
    this.bindClickEvent();

    // 进入页面时，如果已经有历史数据，则先把"之前的点"绘出来（不含最后一个实时点）
    if (Array.isArray(this.mapList) && this.mapList.length > 0) {
      this.index = this.mapList.length - 1;
      const historyPoints = this.mapList.slice(0, this.index);
      this.drawHistoryPoints(historyPoints);
      this.drawRouteSegments(historyPoints);
    }
  },
  beforeDestroy() {
    clearInterval(this.timer);
    if (this.mapClickKey) {
      unByKey(this.mapClickKey);
      this.mapClickKey = null;
    }
    this.mapClickHandler = null;
    if (this.map) {
      this.map.setTarget(null);
      this.map = null;
    }
  },

  watch: {
    // 兼容历史模式和既有外部调用；实时模式只由 realtimeBatchId 驱动，避免重复绘制。
    mapList: {
      deep: false,
      handler(newVal) {
        if (!Array.isArray(newVal) || !newVal.length) return;
        if (this.$parent && this.$parent.mapType !== 1) return;
        if (this.searchType === 1) return;
        this.points = newVal;
        this.index = newVal.length - 1;
        this.dataForm = this.points[this.index];
      },
    },
    /** 只监听批次版本，不再深度遍历不断增长的完整 mapList。 */
    realtimeBatchId() {
      if (this.searchType !== 1) return;
      if (this.$parent && this.$parent.mapType !== 1) return;
      this.drawRealtimeBatch(this.realtimeBatch);
    },

    /**
     * 查询模式切换：searchType
     * 1 = 实时查询
     * 2 = 历史查询：刷新地图尺寸 + 清空 dataForm
     */
    searchType: {
      deep: true,
      handler(newVal) {
        if (newVal === 2) {
          this.map && this.map.updateSize();
        }
      },
    },
  },

  methods: {
    /* =========================
     * 1) 基础工具方法
     * ========================= */

    /** 统一坐标转换：EPSG:4326 -> EPSG:3857 */
    to3857(lonlat) {
      return transform(lonlat, "EPSG:4326", "EPSG:3857");
    },

    hasValidGeoLocation(point) {
      return (
        point &&
        Array.isArray(point.geo_location) &&
        point.geo_location.length >= 2 &&
        Number.isFinite(Number(point.geo_location[0])) &&
        Number.isFinite(Number(point.geo_location[1]))
      );
    },

    buildFeatureId(prefix, point, fallbackIndex) {
      const timeKey = point.time || point.timestamp || fallbackIndex;
      const geoKey = this.hasValidGeoLocation(point)
        ? point.geo_location.map((value) => Number(value).toFixed(6)).join(",")
        : "unknown";
      return `${prefix}-${timeKey}-${geoKey}-${fallbackIndex}`;
    },

    /** 获取 Vuex 中当前 gasName 对应的区间范围 */
    getCurrentGasRange() {
      const type = this.gasName || this.$parent.gasName;
      const ranges = this.$store.getters.GET_GasData;
      return ranges?.[type] || [];
    },

    /** 生成空数据结构（用于历史查询切换时清空） */
    getEmptyDataForm() {
      return {
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
    },

    /** 更新地图尺寸（常用于容器显示/隐藏或切换 tab 后） */
    updatedMapSize() {
      setTimeout(() => {
        this.map && this.map.updateSize();
      }, 100);
    },

    setFollowMode(enabled) {
      if (!enabled || !this.map) {
        return;
      }
      const latestPoint =
        this.points[this.index] || this.mapList[this.mapList.length - 1];
      if (!this.hasValidGeoLocation(latestPoint)) {
        return;
      }
      this.map.updateSize();
      this.map.getView().setCenter(this.to3857(latestPoint.geo_location));
    },

    /* =========================
     * 2) 地图初始化与图层初始化
     * ========================= */

    getMapToken() {
      return (
        process.env.VUE_APP_TDT_TOKEN ||
        process.env.VUE_APP_TIANDITU_TOKEN ||
        ""
      );
    },

    initMap() {
      const mapToken = this.getMapToken();
      const maximumZoom = mapToken ? 18 : 20;
      const zoomFactor = 1.6;
      const maximumViewZoom = maximumZoom / Math.log2(zoomFactor);
      const baseLayers = mapToken
        ? [
            new TileLayer({
              className: "blueLayer",
              source: new XYZ({
                wrapX: false,
                crossOrigin: "anonymous",
                maxZoom: maximumZoom,
                url: `https://t0.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=${mapToken}`,
              }),
            }),
            new TileLayer({
              name: "注记",
              source: new XYZ({
                crossOrigin: "anonymous",
                maxZoom: maximumZoom,
                url: `https://t0.tianditu.gov.cn/DataServer?T=cia_w&x={x}&y={y}&l={z}&tk=${mapToken}`,
              }),
            }),
          ]
        : [
            new TileLayer({
              className: "blueLayer",
              source: new XYZ({
                crossOrigin: "anonymous",
                maxZoom: maximumZoom,
                url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
              }),
            }),
          ];

      // --- 2) Map + View ---
      this.map = new OlMap({
        target: "olMap",
        layers: baseLayers,
        view: new View({
          center: this.to3857([104.81769266666667, 28.169435333333332]),
          zoom: 21,
          minZoom: 8,
          maxZoom: maximumViewZoom,
          zoomFactor,
          projection: "EPSG:3857",
        }),
        controls: defaultControls({
          zoom: false,
          attribution: !mapToken,
          rotate: false,
        }),
      });

      // --- 3) 业务图层初始化 ---
      this.initIconLayer();
      this.initRouteLayer();
      this.initPointLayer();
    },

    /** 车辆图层（唯一 Feature 移动即可） */
    initIconLayer() {
      this.iconSource = new VectorSource({ features: [] });
      this.iconLayer = new VectorLayer({
        source: this.iconSource,
        zIndex: 2000,
      });
      this.map.addLayer(this.iconLayer);
    },

    /** 轨迹线图层（历史播放时追加线段） */
    getRouteStyle(color) {
      if (!this.routeStyleCache) this.routeStyleCache = new Map();
      if (!this.routeStyleCache.has(color)) {
        this.routeStyleCache.set(color, new Style({
          fill: new Fill({ color: "#12FF9B" }),
          stroke: new Stroke({ color, width: 2 }),
        }));
      }
      return this.routeStyleCache.get(color);
    },
    getPointStyle(color, radius) {
      if (!this.pointStyleCache) this.pointStyleCache = new Map();
      const key = `${color}:${radius}`;
      if (!this.pointStyleCache.has(key)) {
        this.pointStyleCache.set(key, new Style({
          image: new CircleStyle({
            radius,
            fill: new Fill({ color }),
          }),
        }));
      }
      return this.pointStyleCache.get(key);
    },
    initRouteLayer() {
      this.routeSource = new VectorSource({ features: [] });

      this.routeLayer = new VectorLayer({
        source: this.routeSource,
        zIndex: 1006,
        // style 采用 feature 的 color 字段控制线颜色（保持原机制）
        style: (feature) => this.getRouteStyle(feature.get("color")),
      });

      this.map.addLayer(this.routeLayer);
    },

    /** 浓度点图层（实时/历史点绘制 + 点击选中） */
    initPointLayer() {
      this.pointSource = new VectorSource({ features: [] });

      this.pointLayer = new VectorLayer({
        source: this.pointSource,
        zIndex: 1006,
        title: "查询站点",
        visible: true,
        // style 由 feature 自身的 color/radius 决定（保持原机制）
        style: (feature) => this.getPointStyle(
          feature.get("color"), feature.get("radius"),
        ),
      });

      this.map.addLayer(this.pointLayer);
    },

    /* =========================
     * 3) 清理逻辑（切换气体/切换模式/结束播放）
     * ========================= */

    /**
     * removeTC：清理"实时绘制/历史播放"产生的轨迹、点、车辆
     * - 结束定时器
     * - 清空点、线、车
     * - 兼容你原先 imgLayer 的移除（即使这里未展示 imgLayer 创建逻辑）
     */
    removeTC() {
      clearInterval(this.timer);
      this.timer = null;

      this.pointSource && this.pointSource.clear();
      this.routeSource && this.routeSource.clear();
      this.resetRouteChunk();
      this.selectedPointFeature = null;

      if (this.iconLayer) this.iconLayer.getSource().clear();
      if (this.iconSource && this.iconFeature) this.iconSource.removeFeature(this.iconFeature);
      this.iconFeature = null;

      // 你原逻辑：路径结束移除 imgLayer（保留以免外部依赖）
      this.imgLayer && this.map && this.map.removeLayer(this.imgLayer);
    },

    /**
     * removeCircle：实时绘制切换气体类型时
     * - 清空当前点
     * - 重新把历史点绘出来（保持你原行为）
     */
    removeCircle() {
      this.pointSource && this.pointSource.clear();
      this.selectedPointFeature = null;

      if (Array.isArray(this.mapList) && this.mapList.length > 0) {
        this.index = this.mapList.length - 1;
        const historyPoints = this.mapList.slice(0, this.index);
        this.drawHistoryPoints(historyPoints);
      }
    },

    redrawConcentrationByGas(gasType, gasName, points = this.mapList) {
      this.gasType = gasType;
      this.gasName = gasName;
      this.pointSource && this.pointSource.clear();
      this.selectedPointFeature = null;

      const nextPoints = Array.isArray(points) ? points : [];
      this.points = nextPoints;
      this.index = nextPoints.length > 0 ? nextPoints.length - 1 : 0;
      this.drawHistoryPoints(nextPoints);
    },

    redrawRealtimeWindow(gasType, gasName, points = this.mapList) {
      this.gasType = gasType;
      this.gasName = gasName;
      const nextPoints = Array.isArray(points) ? points : [];
      this.points = nextPoints;
      this.index = nextPoints.length > 0 ? nextPoints.length - 1 : 0;

      if (
        !this.map ||
        !this.routeSource ||
        !this.iconLayer ||
        !this.pointSource
      ) {
        return;
      }

      this.removeTC();
      if (!nextPoints.length) {
        return;
      }

      this.drawHistoryPoints(nextPoints);
      this.drawRouteSegments(nextPoints);

      const latestPoint = nextPoints[this.index];
      if (!this.hasValidGeoLocation(latestPoint)) {
        return;
      }
      const latestCenter = this.to3857(latestPoint.geo_location);
      if (this.$parent.viewFlag) {
        this.map.updateSize();
        this.map.getView().setCenter(latestCenter);
      }
      this.ensureOrUpdateCar(latestCenter);
    },

    /* =========================
     * 4) 实时绘制（移动车辆 + 追加一个点）
     * ========================= */

    drawRealtimeBatch(batch) {
      if (!Array.isArray(batch) || !batch.length) return;
      this.points = Array.isArray(this.mapList) ? this.mapList : [];
      // 先按保留窗口移出超窗浓度点，再绘制本批新点，保证窗口始终生效。
      this.evictOutsideHistoryWindow();
      const startIndex = Math.max(0, this.points.length - batch.length);
      const lastIndex = this.points.length - 1;
      for (let index = startIndex; index <= lastIndex; index++) {
        this.drawRealtimePoint(index, index === lastIndex);
      }
      this.index = lastIndex;
      this.dataForm = this.points[lastIndex];
    },

    /**
     * 按「最大历史保留」窗口移出超窗的浓度点可视对象，返回本次移出的点数。
     *
     * 两点约定：
     * 1. 只删除地图对象，不删除父组件的点数组——数组另有容量上限，两者独立。
     * 2. 用点自身的采样时间判断新旧，不用数组下标：数组达到容量上限后会丢弃
     *    最旧的点，下标会整体前移，只有时间稳定。
     *
     * 注意：轨迹线段按分块保留，不参与窗口淘汰（分块没有逐点时间），
     * 所以本窗口约束的是浓度点数量。
     */
    evictOutsideHistoryWindow() {
      const windowMs = Number(this.historyWindowMs) || 0;
      if (!windowMs || !this.pointSource) return 0;
      // 用 prop 而不是内部 this.points：后者只在增量绘制与切气体时赋值，
      // 初始窗口铺数据走 redrawRealtimeWindow，不会写 this.points。
      const points = Array.isArray(this.mapList) ? this.mapList : [];
      const count = points.length;
      if (count < 2) return 0;
      const latestTs = Date.parse(points[count - 1] && points[count - 1].time);
      if (!Number.isFinite(latestTs)) return 0;
      const cutoff = latestTs - windowMs;

      const features = this.pointSource.getFeatures();
      let removed = 0;
      // feature 按插入顺序排列，最旧的在前，命中窗口边界即可停止。
      while (removed < features.length) {
        const feature = features[removed];
        const data = feature && feature.get ? feature.get("data") : null;
        const ts = Date.parse(data && data.time);
        // 时间不可解析时停止，宁可不淘汰也不误删。
        if (!Number.isFinite(ts) || ts >= cutoff) break;
        this.pointSource.removeFeature(feature);
        removed += 1;
      }
      return removed;
    },

    /**
     * drawRealtimePoint（原 moveCircle）
     * - 更新当前气体区间范围 gasRange
     * - 若 viewFlag 开启则跟随最新点居中
     * - 车辆图标：首次创建；否则更新位置 + 调整朝向
     * - 浓度点：按 gasType 值映射颜色并追加绘制
     */
    drawRealtimePoint(pointIndex = this.index, updateView = true) {
      if (!this.points || !this.points[pointIndex]) return;

      // 1) 获取当前区间
      this.gasRange = this.getCurrentGasRange();

      const current = this.points[pointIndex];
      if (!this.hasValidGeoLocation(current)) return;

      const center3857 = this.to3857(current.geo_location);

      // 2) 是否跟随居中（保持你原逻辑）
      if (updateView && this.$parent.viewFlag) {
        this.map.getView().setCenter(center3857);
      }

      // 3) 更新/创建车辆 Feature
      this.ensureOrUpdateCar(center3857);

      // 4) 追加路线线段
      this.drawRouteSegment(this.points[pointIndex - 1], current);

      // 5) 绘制浓度点（半径=2：保持你原实时点效果）
      const value = current[this.gasType];
      const color = this.getColor(value);

      const pointFeature = new Feature({
        Type: "数据点",
        geometry: new Point(center3857),
        color,
        radius: 2,
        data: current,
      });
      pointFeature.setId(this.buildFeatureId("realtime-point", current, pointIndex));
      this.pointSource.addFeature(pointFeature);
    },

    /**
     * 车辆图标的创建/更新逻辑
     * - 首次：创建 Feature + Icon Style
     * - 后续：更新 geometry，并根据相邻点计算旋转角度
     */
    ensureOrUpdateCar(center3857) {
      const hasCar = this.iconSource && this.iconSource.getFeatures().length > 0 && this.iconFeature;

      if (!hasCar) {
        // 首次创建车辆
        this.iconFeature = new Feature({ geometry: new Point(center3857) });
        this.iconFeature.setStyle(
          new Style({
            image: new Icon({
              crossOrigin: "anonymous",
              src: iconSrc,
              opacity: 1,
              scale: 0.6,
            }),
            zIndex: 2000,
          })
        );
        this.iconSource.addFeature(this.iconFeature);
        return;
      }

      // 更新车辆位置
      this.iconFeature.setGeometry(new Point(center3857));

      // 更新车辆方向（需要上一个点存在）
      if (this.index - 1 > 0 && this.points[this.index - 1] && this.points[this.index]) {
        const prev = this.points[this.index - 1].geo_location;
        const curr = this.points[this.index].geo_location;
        const rotation = this.calcRotation(prev, curr);
        this.iconFeature.getStyle().getImage().setRotation(rotation);
      }
    },

    /* =========================
     * 5) 历史点绘制（不播放，仅把点画出来）
     * ========================= */

    /**
     * drawHistoryPoints（原 moveHistoryCircle）
     * - 给定 list，按 gasType 给每个点上色并绘制
     * - 用于"进入页面已有数据"或"切换气体后重画历史点"
     */
    drawHistoryPoints(list) {
      if (!Array.isArray(list) || list.length === 0) return;

      this.gasRange = this.getCurrentGasRange();

      list.forEach((item, i) => {
        const color = this.getColor(item[this.gasType]);

        const feature = new Feature({
          Type: "数据点",
          geometry: new Point(this.to3857(item.geo_location)),
          color,
          radius: 2, // 保持你原 moveHistoryCircle 半径
          data: item,
        });

        feature.setId(i);
        this.pointSource.addFeature(feature);
      });
    },

    drawRouteSegment(previous, current) {
      if (
        !this.routeSource ||
        !this.hasValidGeoLocation(previous) ||
        !this.hasValidGeoLocation(current)
      ) {
        this.resetRouteChunk();
        return;
      }

      const previousCoordinate = this.to3857(previous.geo_location);
      const currentCoordinate = this.to3857(current.geo_location);
      const last = this.routeChunkLastCoordinate;
      const continuous = last &&
        last[0] === previousCoordinate[0] &&
        last[1] === previousCoordinate[1];
      if (!this.routeChunkFeature ||
          this.routeChunkPointCount >= ROUTE_CHUNK_MAX_POINTS ||
          !continuous) {
        this.routeChunkFeature = new Feature({
          type: "LineString",
          geometry: new LineString([previousCoordinate, currentCoordinate]),
          color: "#12FF9B",
        });
        this.routeSource.addFeature(this.routeChunkFeature);
        this.routeChunkPointCount = 2;
      } else {
        this.routeChunkFeature.getGeometry().appendCoordinate(currentCoordinate);
        this.routeChunkPointCount += 1;
      }
      this.routeChunkLastCoordinate = currentCoordinate;
    },
    resetRouteChunk() {
      this.routeChunkFeature = null;
      this.routeChunkPointCount = 0;
      this.routeChunkLastCoordinate = null;
    },

    drawRouteSegments(list) {
      if (!Array.isArray(list) || list.length < 2) return;

      for (let i = 0; i < list.length - 1; i++) {
        this.drawRouteSegment(list[i], list[i + 1]);
      }
    },

    /* =========================
     * 6) 历史轨迹播放（车辆沿点移动 + 追加线段）
     * ========================= */

    /**
     * createHistoryLine（保持原功能）
     * - 清空点（因为播放时你只显示线+车）
     * - 创建车辆 Feature
     * - setInterval 播放：每 200ms 移动车辆并追加一段 LineString
     * - 播放结束清理车辆图层
     */
    createHistoryLine(data) {
      if (!Array.isArray(data) || data.length === 0) return;

      // 1) 清除浓度点
      this.pointSource.clear();
      this.selectedPointFeature = null;
      this.routeSource.clear();
      this.resetRouteChunk();

      // 2) 创建车辆
      this.iconFeature = new Feature({
        geometry: new Point(this.to3857(data[0].geo_location)),
      });

      this.iconFeature.setStyle(
        new Style({
          image: new Icon({
            crossOrigin: "anonymous",
            src: iconSrc,
            color: "#CEE4FF",
            opacity: 1,
            scale: 0.6,
            anchor: [0.48, 0.52], // 保持你原 anchor
          }),
        })
      );

      this.iconSource.addFeature(this.iconFeature);

      // 3) 播放轨迹
      let i = 0;
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (data[i + 1]) {
          // 更新车辆位置
          const p1 = data[i].geo_location;
          const p2 = data[i + 1].geo_location;

          this.iconFeature.setGeometry(new Point(this.to3857(p2)));

          // 更新车辆方向
          this.iconFeature.getStyle().getImage().setRotation(this.calcRotation(p1, p2));

          // 追加线段
          this.drawRouteSegment(data[i], data[i + 1]);

          i++;
        } else {
          // 播放结束
          clearInterval(this.timer);
          this.timer = null;
          this.iconLayer.getSource().clear(); // 保持你原"结束后清车"
        }
      }, 200);
    },

    /**
     * createCircle（原逻辑：历史查询时绘制点 + 注册点击）
     * - 清空线、车、定时器、点
     * - 居中到首点
     * - 批量绘制"半径=5"的历史点
     * - 绑定点击事件：点高亮并回填 detailData
     */
    createCircle(list) {
      if (
        !this.map ||
        !this.routeSource ||
        !this.iconLayer ||
        !this.pointSource
      ) {
        return;
      }
      // 1) 清除实时绘制路径及车辆
      this.routeSource.clear();
      this.resetRouteChunk();
      this.iconLayer.getSource().clear();

      // 2) 停止历史播放
      clearInterval(this.timer);
      this.timer = null;

      // 3) 清除点
      this.pointSource.clear();
      this.selectedPointFeature = null;

      if (!Array.isArray(list) || list.length === 0) return;

      // 4) 居中
      this.map.getView().setCenter(this.to3857(list[0].geo_location));

      // 5) 更新区间
      this.gasRange = this.getCurrentGasRange();

      // 6) 绘制路线
      this.drawRouteSegments(list);

      // 7) 绘制点（历史查询的半径更大=5：保持你原效果）
      list.forEach((item, i) => {
        const color = this.getColor(item[this.gasType]);

        const feature = new Feature({
          Type: "数据点",
          geometry: new Point(this.to3857(item.geo_location)),
          color,
          radius: 5,
          data: item,
        });

        feature.setId(i);
        this.pointSource.addFeature(feature);
      });
    },

    /* =========================
     * 7) 点击交互（历史查询点选中）
     * ========================= */

    /**
     * bindClickEvent（原 clickOnMap）
     * - 单击点：先重置所有点的样式，再高亮选中点
     * - 把 data 写到 dataForm，并同步给父组件 detailData
     */
    bindClickEvent() {
      if (!this.map || this.mapClickKey) return;
      this.mapClickHandler = this.handleMapClick.bind(this);
      this.mapClickKey = this.map.on("singleclick", this.mapClickHandler);
    },

    handleMapClick(evt) {
      if (!this.map || !this.pointSource) {
        return;
      }
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (f) => f);

      if (!feature) {
        return;
      }

      if (!feature.get || feature.get("Type") !== "数据点") {
        return;
      }

      const featureId = feature.getId ? feature.getId() : feature.id_;
      if (featureId === undefined || featureId === null) {
        return;
      }

      const selectedFeature = this.pointSource.getFeatureById(featureId);
      if (!selectedFeature) {
        return;
      }

      if (this.selectedPointFeature && this.selectedPointFeature !== selectedFeature) {
        this.selectedPointFeature.setStyle(undefined);
      }
      selectedFeature.setStyle(this.getPointStyle("#0095FF", 5));
      this.selectedPointFeature = selectedFeature;

      this.dataForm = selectedFeature.get("data");
      this.$emit("getTimePointer", this.dataForm);
    },

    /* =========================
     * 8) 颜色映射 & 角度计算
     * ========================= */

    /**
     * getColor：
     * - 根据当前 gasRange（区间数组）决定颜色
     * - 区间规则保持原逻辑：data[i] 是 [min, max]
     */
    getColor(num) {
      const data = this.gasRange || [];
      if (!data || data.length < 5) return this.colorList[5];

      // 注意：保持你原先的开闭区间逻辑（>min && <=max）
      if (num > Number(data[0][0]) && num <= data[0][1]) return this.colorList[0];
      if (num > data[1][0] && num <= data[1][1]) return this.colorList[1];
      if (num > data[2][0] && num <= data[2][1]) return this.colorList[2];
      if (num > data[3][0] && num <= data[3][1]) return this.colorList[3];
      if (num > data[4][0] && num <= data[4][1]) return this.colorList[4];
      return this.colorList[5];
    },

    /**
     * calcRotation（原 countRotate）：
     * - 将两点转成 EPSG:3857 后计算 atan2
     * - +90°：因为 Icon 默认朝向与你的图标素材方向存在偏置（保持原效果）
     */
    calcRotation(location1, location2) {
      const p1 = this.to3857(location1);
      const p2 = this.to3857(location2);
      return Math.atan2(p2[0] - p1[0], p2[1] - p1[1]) + (90 * Math.PI) / 180;
    },
  },
};
</script>

<style lang="scss" scoped>
.blueLayer {
  filter: grayscale(100%) sepia(88%) invert(100%) saturate(350%);
}

.planimetric-map {
  position: relative;
}

#olMap {
  width: 100%;
  height: 100%;
  position: relative;
}

.map-config-notice {
  position: absolute;
  z-index: 1;
  top: 12px;
  left: 12px;
  margin: 0;
  padding: 6px 10px;
  color: #f8fafc;
  font-size: 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(248, 250, 252, 0.4);
  border-radius: 4px;
}

#olMap .ol-control {
  background-color: rgba(217, 217, 217, 87%) !important;
}
</style>

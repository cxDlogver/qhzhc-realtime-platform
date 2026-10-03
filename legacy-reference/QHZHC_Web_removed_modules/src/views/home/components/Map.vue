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
  <div id="olMap">
    <!-- 新闻要点 -->
    <div class="news-box">
      <div class="news-title">
        <i class="iconfont icon-duoyun"></i>
        <span class="news-label">新闻动态</span>
      </div>
      <div class="news-content">
        <div class="news-item">
          <div class="news-time">2024-01-22 16:12:08</div>
          <p class="news-msg">
            生态环境部今日向媒体通报了2024年5月全国环境空气质量状况，国339个地级及以上城市平均空气质量优良天数比例为78.2%。
          </p>
        </div>
        <div class="news-item">
          <div class="news-time">2024-01-22 16:12:08</div>
          <p class="news-msg">
            PM2.5浓度排名前20位城市依次是拉萨、海口和舟山等城市（从第1名至第20名）；PM2.5浓度排名后20位城市依次是许昌、鹤壁和漯河等城市（从倒数第1名至倒数第20名）。
          </p>
        </div>
        <div class="news-item">
          <div class="news-time">2024-01-22 16:12:08</div>
          <p class="news-msg">
            生态环境部今日向媒体通报了2024年5月全国环境空气质量状况，国339个地级及以上城市平均空气质量优良天数比例为78.2%，同比下降10.1个百分点；平均重度及以上污染天数比例为0.5%，同比下降0.1个百分点；由沙尘天气导致的平均超标天数比例为2.9%，其中重污染天数比例为0.5%。
          </p>
        </div>
        <div class="news-item">
          <div class="news-time">2024-01-22 16:12:08</div>
          <p class="news-msg">
            生态环境部今日向媒体通报了2024年5月全国环境空气质量状况，国339个地级及以上城市平均空气质量优良天数比例为78.2%，同比下降10.1个百分点；平均重度及以上污染天数比例为0.5%，同比下降0.1个百分点。
          </p>
        </div>
      </div>
    </div>
    <!-- 跳转到研发团队 -->
    <div class="btn-border">
      <div class="jump-btn">
        <i class="icon1 iconfont icon-a-yanfa2"></i>
        跳转到研发团队
        <i class="icon2 iconfont icon-tiaozhuan"></i>
      </div>
    </div>
    <!-- 缩放按钮 -->
    <div class="btn-box">
      <div class="btn-icon" @click="zoomIn">
        <i class="iconfont icon-fangdasuoxiao_X"></i>
      </div>
      <div class="btn-icon" @click="zoomOut">
        <i class="iconfont icon-fangdasuoxiao_Y"></i>
      </div>
      <div class="btn-icon">
        <i class="iconfont icon-shuaxin"></i>
      </div>
    </div>
  </div>
</template>

<script>
import "ol/ol.css";

import { Tile as TileLayer, Vector as VectorLayer } from "ol/layer";
import XYZ from "ol/source/XYZ";
import { defaults as defaultControls } from "ol/control";
import Map from "ol/Map.js";
import View from "ol/View.js";

import { Vector as VectorSource } from "ol/source";
import { Fill, Stroke, Style } from "ol/style.js";
import GeoJSON from "ol/format/GeoJSON";
import { transform } from "ol/proj";
export default {
  name: "HomeMap",
  data() {
    return {
      mapobj: null,
    };
  },

  mounted() {
    this.initMap();
  },
  methods: {
    updated() {
      this.mapobj.updateSize();
    },

    // 天地图
    getMapToken() {
      return (
        process.env.VUE_APP_TDT_TOKEN ||
        process.env.VUE_APP_TIANDITU_TOKEN ||
        ""
      );
    },

    initMap() {
      const mapToken = this.getMapToken();
      const tileLayers = mapToken
        ? [
            new TileLayer({
              className: "blueLayer", //增加className属性
              source: new XYZ({
                wrapX: false,
                url: `https://t0.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=${mapToken}`,
                crossOrigin: "anonymous",
                tileLoadFunction: function (imageTile, src) {
                  // 使用滤镜 将白色修改为深色
                  const img = new Image();
                  // img.crossOrigin = ''
                  // 设置图片不从缓存取，从缓存取可能会出现跨域，导致加载失败
                  img.setAttribute("crossOrigin", "anonymous");
                  img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const w = img.width;
                    const h = img.height;
                    canvas.width = w;
                    canvas.height = h;
                    const context = canvas.getContext("2d");
                    context.filter =
                      "grayscale(98%) invert(100%) sepia(20%) hue-rotate(180deg) saturate(1600%) brightness(80%) contrast(90%)";
                    context.drawImage(img, 0, 0, w, h, 0, 0, w, h);
                    imageTile.getImage().src = canvas.toDataURL("image/png");
                  };
                  img.src = src;
                },
              }),
            }),
            new TileLayer({
              name: "注记",
              source: new XYZ({
                crossOrigin: "anonymous",
                url: `https://t0.tianditu.gov.cn/DataServer?T=cia_w&x={x}&y={y}&l={z}&tk=${mapToken}`,
              }),
            }),
          ]
        : [];
      this.mapobj = new Map({
        target: "olMap",
        layers: tileLayers,
        view: new View({
          center: transform([108.522097, 37.272848], "EPSG:4326", "EPSG:3857"), //中心点经纬度
          zoomFactor: 1.6, //The zoom factor used to determine the resolution constraint. Default is 2.
          minZoom: 6, //缩放最小级别
          maxZoom: 24, //缩放最大级
          zoom: 8,
          projection: "EPSG:3857",
        }),
        controls: defaultControls({
          zoom: false,
          attribution: false,
          rotate: false,
        }),
      });
      // this.mapobj.addControl(new ZoomSlider())
      // this.mapobj.addControl(new ScaleLine({
      //     /**
      //      * units支持的单位包括：
      //      *    1.metric：千米
      //      *    2.us：美国单位
      //      *    3.nautical：航海单位
      //      *    4.imperial：英制单位
      //      *    5.degrees：度分秒
      //      */
      //     units: "metric",
      //     bar: true, // 是否显示标尺条
      //     // text: true, // 是否显示标尺文字
      //     minWidth: 100, // 设置标尺的最小宽度
      //     // maxWidth: 200, // 设置标尺的最大宽度
      // }));
      //全国图层
      // var quguosCityLayer = new VectorLayer({
      //     zIndex: 800,
      //     title: "全国",
      //     visible: true,
      //     source: new VectorSource({
      //         url: "/mapData/china.geojson",
      //         format: new GeoJSON()
      //     }),
      //     style: new Style({
      //         fill: new Fill({
      //             color: 'red',
      //         }),
      //         stroke: new Stroke({
      //             color: "rgb(218, 218, 218)",
      //             width: 1
      //         })
      //     })

      // });
      // this.mapobj.addLayer(quguosCityLayer);

      var quguosCityLayer = new VectorLayer({
        zIndex: 800,
        title: "全国",
        visible: true,
        source: new VectorSource({
          url: "/mapData/china.json",
          format: new GeoJSON(),
        }),
        style: new Style({
          fill: new Fill({
            color: "rgba(16, 59, 144, 0.3)",
          }),
          stroke: new Stroke({
            color: "rgb(218, 218, 218)",
            width: 1,
          }),
        }),
      });
      this.mapobj.addLayer(quguosCityLayer);
    },
    // 地图缩小
    zoomOut() {
      // 使用map对象获取view视图，然后设置View视图的放大，缩小参数即可
      const view = this.mapobj.getView();
      const zoom = view.getZoom();
      view.setZoom(zoom - 1);
    },
    // 地图放大
    zoomIn() {
      const view = this.mapobj.getView();
      const zoom = view.getZoom();
      view.setZoom(zoom + 1);
    },
  },
};
</script>

<style lang="scss" scoped>
.blueLayer {
  filter: grayscale(100%) sepia(88%) invert(100%) saturate(350%);
}

#olMap {
  width: 100%;
  height: 100%;
  position: relative;
  // 新闻要点数据
  .news-box {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 66;
    width: 399px;
    height: 374px;
    border-radius: 4px;
    opacity: 0.8;
    background: #122336;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(4px);
    box-shadow: 0px 4px 10px 0px rgba(38, 102, 127, 0.3);
    padding: 8px;
    .news-title {
      margin-bottom: 10px;
      i {
        color: #ffffff;
        font-size: 18px;
        margin-right: 10px;
      }
      span {
        font-size: 18px;
        font-weight: bold;
        line-height: 26px;
        font-variation-settings: "opsz" auto;
        background: linear-gradient(180deg, #ffffff 46%, #0095ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-fill-color: transparent;
      }
    }
    .news-content {
      height: calc(100% - 36px);
      overflow-y: auto;
      .news-item {
        padding: 8px;
        box-sizing: border-box;
        background: rgba(94, 116, 153, 0.28);
        box-sizing: border-box;
        border: 1px solid rgba(211, 225, 255, 0.22);
        border-radius: 4px;
        font-size: 16px;
        font-weight: 500;
        line-height: 16px;
        margin-bottom: 8px;
        .news-time {
          font-size: 16px;
          font-weight: 500;
          line-height: 16px;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 8px;
        }
        .news-msg {
          line-height: 26px;
          text-indent: 2em;
          font-weight: 500;
          color: #ffffff;
        }
      }
    }
  }
  // 跳转到研发团队
  .btn-border {
    position: absolute;
    left: 20px;
    bottom: 20px;
    z-index: 66;
    width: 217px;
    height: 46px;
    border-radius: 40px;
    opacity: 1;
    background: url("~@/assets/imgs/jump.png") no-repeat center;
    background-size: 100%;
    box-sizing: border-box;
    // border: 1px solid;
    // border-image: linear-gradient(to right, rgba(18, 255, 155, 0.5), rgba(18, 255, 155, 0), rgba(18, 255, 155, 0), rgba(18, 255, 155, 0.5)) 1;
    overflow: hidden;
    cursor: pointer;
    text-align: center;
    line-height: 46px;
    .icon1 {
      margin-right: 8px;
    }
    .icon2 {
      margin-left: 8px;
    }
  }
  // 操作按钮
  .btn-box {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 66;
    .btn-icon {
      width: 36px;
      height: 36px;
      opacity: 0.8;
      background: rgba(0, 149, 255, 0.5);
      box-sizing: border-box;
      border-radius: 50%;
      border: 0.6px solid rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(2px);
      box-shadow: 0px 2px 4px 0px rgba(0, 0, 0, 0.73);
      margin-bottom: 10px;
      font-size: 16px;
      color: #ffffff;
      text-align: center;
      line-height: 34px;
      font-weight: 600;
      cursor: pointer;
    }
  }
}
</style>
<style>
#olMap .ol-control {
  background-color: rgba(217, 217, 217, 87%) !important;
}
</style>

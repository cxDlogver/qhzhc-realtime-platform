<!-- 数据资源 -->
<template>
  <div class="resource-container">
    <!-- 左侧界面 -->
    <div class="aside">
      <!-- 数据中心标题 -->
      <div class="title">
        <div class="title-msg">数据中心</div>
      </div>
      <!-- 数据导览 -->
      <div class="navigation">
        <!-- 筛选框 -->
        <div class="nav-filter">
          <div class="filter-title">
            <span>类型：</span>
            <el-select
              :popper-append-to-body="false"
              v-model="dataTitleValue"
              placeholder="请选择"
              clearable
              @change="selectType"
            >
              <el-option
                v-for="item in dataTitle"
                :key="item.data[1]"
                :label="item.data[0]"
                :value="item.data[1]"
              >
              </el-option>
            </el-select>
          </div>
        </div>
        <!-- 数据导览标题 -->
        <div class="nav-title">
          <div class="icon-container">
            <i class="iconfont icon-yewumokuailiebiao"></i>
          </div>
          <div class="nav-msg">数据导览</div>
        </div>
        <!-- 数据预览菜单 -->
        <div class="nav-menu">
          <el-menu
            :default-openeds="defaultOpenedsArray"
            default-active="1-0-0"
            @open="handleOpen"
            @close="handleClose"
            class="el-menu-vertical-demo"
          >
            <el-submenu
              :index="i + 1 + ''"
              v-for="(item, i) in dataMenu"
              :key="i"
            >
              <template slot="title">
                <i class="el-icon-menu"></i>
                <span>{{ item.parentTitle }}</span>
              </template>
              <el-submenu
                class="second"
                :index="i + 1 + '-' + index"
                v-for="(key, index) in item.child"
                :key="key.value"
              >
                <template slot="title">
                  <i
                    :class="
                      isOpen(i + 1 + '-' + index)
                        ? 'el-icon-minus'
                        : 'el-icon-plus'
                    "
                  ></i>
                  <span>{{ key.name }}</span>
                </template>
                <div
                  class="submenu-body"
                  v-for="(item1, id) in key.data"
                  :key="item1.uniqueid"
                >
                  <div class="menu-branch">
                    <div class="branch-one branch"></div>
                    <div
                      class="branch-two branch"
                      v-if="!(id == key.data.length - 1)"
                    ></div>
                  </div>
                  <el-menu-item
                    :index="i + 1 + '-' + index + '-' + id"
                    @click="dataClick(item, key, item1)"
                  >
                    <span>{{ item1.datasetname }}</span>
                    <!-- <button class="download full">下载</button> -->
                  </el-menu-item>
                </div>
              </el-submenu>
            </el-submenu>
          </el-menu>
          <DataNavigation
            :dataTitleValue="dataTitleValue"
            :dataIndustryValue="dataIndustryValue"
            :dataTitleTotal="dataTitle"
            :dataIndustryTotal="dataIndustry"
          ></DataNavigation>
        </div>
      </div>
    </div>
    <!-- 中间界面 -->
    <div class="main">
      <!-- 头部窗口 -->
      <div class="data-header">
        <!-- 数据集介绍 -->
        <div class="data-read">
          查看页面前请仔细阅读
          <div
            class="protocol-url"
            @click="(protocolVisible = true), (type = 'use')"
          >
            《数据集介绍》
          </div>
        </div>
        <!-- 数据上传按钮 -->
        <div class="data-upload" @click="dataUpload">
          <button>
            <i class="iconfont icon-shangchuan"></i>
            <span>数据上传</span>
          </button>
        </div>
      </div>
      <!-- 数据预览窗口 -->
      <div class="data-widget">
        <div class="widget-title">
          <i class="iconfont icon-weizhi02-F"></i>
          <span>{{ titleName }}</span>
          <!-- 选择文件名 -->
          <span v-if="fileShow">{{ fileName }}</span>
          <el-button
            v-show="fileShow"
            type="primary"
            size="small"
            style="float: right"
            @click="fileShow = false"
            >返回上一级</el-button
          >
        </div>
        <div class="preview-widget">
          <div class="data-information">
            <DataInformation></DataInformation>
          </div>
          <div class="data-filter">
            <DataFilter></DataFilter>
          </div>
          <div class="data-preview">
            <DataPreview></DataPreview>
          </div>
          <!-- 数据集详情预览 -->
          <div
            class="data-detail"
            v-loading="loading"
            element-loading-text="加载中"
            element-loading-spinner="el-icon-loading"
            element-loading-background="rgba(0, 0, 0, 0.8)"
          >
            <!-- 数据集详情 -->
            <Details
              :detailInfo="detailInfo"
              @getFileDetail="getFileDetail"
              v-show="!fileShow"
            ></Details>
            <!-- 文件详情 -->
            <FileDetails
              :fileDetailInfo="fileDetailInfo"
              v-show="fileShow"
            ></FileDetails>
          </div>
        </div>
      </div>
    </div>
    <!-- 右侧界面 -->
    <div class="aside">
      <!-- 可视化图表标题 -->
      <div class="title">
        <div class="title-msg">可视化图表</div>
      </div>
      <!-- 可视化图表展示 -->
      <div class="navigation">
        <!-- 图表框 -->
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img1.png')"
              alt="可视化图表"
            />
          </div>
        </div>
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img2.png')"
              alt="可视化图表"
            />
          </div>
        </div>
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img3.png')"
              alt="可视化图表"
            />
          </div>
        </div>
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img4.png')"
              alt="可视化图表"
            />
          </div>
        </div>
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img5.png')"
              alt="可视化图表"
            />
          </div>
        </div>
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img6.png')"
              alt="可视化图表"
            />
          </div>
        </div>
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img7.png')"
              alt="可视化图表"
            />
          </div>
        </div>
        <div class="chart-widget">
          <div class="img-box">
            <img
              :src="require('@/assets/imgs/data/img8.png')"
              alt="可视化图表"
            />
          </div>
        </div>
      </div>
    </div>
    <DataUpload
      v-if="dialogVisible"
      :dialogVisible="dialogVisible"
      :dialogChanged="dialogChanged"
    ></DataUpload>
    <!-- 数据协议阅读弹窗 -->
    <DataProtocol
      v-if="protocolVisible"
      @closeDialog="closeDialog"
      :methodType="type"
    ></DataProtocol>
  </div>
</template>

<script>
import DataNavigation from "./components/dataNavigation";
import DataPreview from "./components/dataPreview";
import DataInformation from "./components/dataInformation";
import DataFilter from "./components/dataFilter";
import DataUpload from "./components/dataUpload";
import Details from "./components/details"; // 数据详情
import DataProtocol from "./components/dataProtocol.vue"; //数据协议
import FileDetails from "./components/fileDetails.vue";
import {
  dataTop,
  approvelist,
  fileview, //文件详情查询
  approvefile,
} from "../../api/home";
export default {
  components: {
    DataNavigation,
    DataPreview,
    DataInformation,
    DataFilter,
    DataUpload,
    DataProtocol, //数据协议
    Details, //数据集详情
    FileDetails, //单个文件详情
  },
  data() {
    return {
      dialogVisible: false, //数据上传弹框是否显示
      dialogCreated: false, //数据上传弹框组件是否存在
      dataTitle: [], //数据主题
      dataTitleValue: "", //选中的主题
      dataIndustry: [], //数据行业
      dataIndustryValue: "", //选中的行业
      user: null, //当前登录的用户信息
      protocolVisible: false, //数据协议弹窗
      dataMenu: [], //查询的裁断结构
      // 选中的菜单分类
      form: {
        parentTitle: "",
        name: "",
        value: "",
      },
      defaultOpeneds: [],
      detailInfo: {}, // 详情数据
      defaultOpenedsArray: ["1", "1-0"], //选中展开菜单
      // 原始菜单结构
      menuList: [],
      fileShow: false, //文件详情
      titleName: "数据导览 > 再分析数据 > A",
      fileName: "", //文件名
      fileDetailInfo: {}, //文件详情
      loading: false,
      uniqueid: "", //选中的数据集id
      type: "use", //协议类型
    };
  },
  created() {
    this.user = localStorage.getItem("user")
      ? JSON.parse(localStorage.getItem("user"))
      : null;
    if (!this.user) {
      return;
    }
    // 数据主题和行业接口
    this.$nextTick(() => {
      this.getDataTop();
    });
  },
  methods: {
    //展开收起
    isOpen(index) {
      const id = this.defaultOpenedsArray.indexOf(index);
      if (id !== -1) {
        return true;
      } else {
        return false;
      }
    },
    /** 菜单栏展开收起操作 */
    handleOpen(index) {
      this.defaultOpenedsArray.push(index);
    },
    handleClose(index) {
      const id = this.defaultOpenedsArray.indexOf(index);
      if (id !== -1) {
        this.defaultOpenedsArray.splice(id, 1);
      }
    },
    // 数据主题和行业接口
    getDataTop(token) {
      dataTop(token).then((res) => {
        this.getData(res.data.data_center);
        this.getDataList();
      });
    },
    // 数据处理
    getData(data) {
      const keys = Object.keys(data);
      this.titleName = keys[0];
      keys.forEach((key) => {
        var menuArr = [];
        data[key].map((item) => {
          this.dataTitle.push({ parentTitle: key, data: item });
          menuArr.push({ name: item[0], value: item[1], data: [] });
        });
        //数据集导览数据
        this.menuList.push({ parentTitle: key, child: menuArr });
      });
    },
    //类型选择
    selectType(val) {
      let obj = this.dataTitle.find((item) => item.data[1] === val);
      if (obj) {
        this.form.parentTitle = obj.parentTitle;
        this.form.value = obj.data[1];
        this.form.name = obj.data[0];
      } else {
        this.form = {
          parentTitle: "",
          name: "",
          value: "",
        };
      }
      // console.log(val, this.form, '选择类型')
      this.getDataList();
    },
    // 获取数据已审核列表
    getDataList() {
      var formData = new FormData();
      if (this.dataTitleValue) {
        formData.append("datatype", this.dataTitleValue); //【数据类型】
        formData.append("uploadtime", ""); //【上传时间】
        formData.append("username", ""); //【上传作者】
      } else {
        formData.append("datatype", ""); //【数据类型】
      }
      // else {
      //   formData = undefined
      // }
      approvelist(formData).then((res) => {
        var data = res.data.fileslist.record;
        //单个分类查询
        if (this.dataTitleValue) {
          this.dataMenu = [
            {
              parentTitle: this.form.parentTitle,
              child: [
                {
                  name: this.form.name,
                  value: this.form.value,
                  data: res.data.fileslist.record,
                },
              ],
            },
          ];
        } else {
          this.dataMenu = this.menuList;
          this.dataMenu.forEach((item) => {
            item.child.forEach((value) => {
              const list = data.filter((key) => key.datatype == value.name);
              value.data = list;
            });
          });
        }
        // console.log(this.dataMenu)
        this.dataClick(
          this.dataMenu[0],
          this.dataMenu[0].child[0],
          this.dataMenu[0].child[0].data[0],
        );
      });
    },
    //左侧数据集点击事件
    dataClick(val1, val2, value) {
      // console.log(value, "选中数据")
      // this.detailInfo = value;
      this.uniqueid = value.uniqueid;
      var formData = new FormData();
      formData.append("uniqueid", value.uniqueid);
      formData.append("data_size", 1);
      formData.append("page_number", 1);
      this.fileShow = false;
      approvefile(formData).then((res) => {
        this.titleName =
          val1.parentTitle + " > " + val2.name + " > " + value.datasetname;
        this.detailInfo = res.data.fileslist.record[0];
      });
    },
    // 数据上传按钮触发
    dataUpload() {
      // console.log("数据上传按钮触发",);
      this.methodType = "upload";
      var userform = JSON.parse(localStorage.getItem("userform"));
      const uploadFlag = userform.is_upload;
      this.type = "upload";
      if (uploadFlag) {
        this.dialogCreated = true;
        this.dialogVisible = true;
      } else {
        this.protocolVisible = true;
        this.dialogCreated = true;
        this.dialogVisible = true;
      }
    },
    dialogChanged(visible, created) {
      this.dialogVisible = visible;
      this.dialogCreated = created;
    },
    //关闭数据协议弹窗
    closeDialog() {
      this.protocolVisible = false;
    },
    //查询文件详情
    getFileDetail(item) {
      // console.log(item, "查询详情")
      this.loading = true;
      var formData = new FormData();
      formData.append("uniqueid", this.uniqueid); //【数据集id】
      formData.append("filename", item.fileName); //【文件名称】
      fileview(formData).then((res) => {
        this.fileName = " > " + item.fileName;
        this.loading = false;
        this.fileShow = true;
        this.fileDetailInfo = res.data;
      });
    },
  },
};
</script>
<style lang="scss" scoped>
.resource-container {
  width: 100%;
  height: 100%;
  display: flex;
  padding: 8px;
  box-sizing: border-box;
  .aside {
    width: 350px;
    height: 100%;
    padding: 0 5px 5px 5px;
    box-sizing: border-box;
    // 标题样式
    .title {
      height: 39px;
      width: 100%;
      background: url("~@/assets/imgs/title-bg.png") no-repeat;
      background-size: 100% 100%;
      font-family: "ARIAL", "Microsoft YaHei";
      position: relative;
      .title-msg {
        position: absolute;
        left: 30px;
        line-height: 39px;
        font-weight: bold;
        font-size: 18px;
        background: linear-gradient(180deg, #ffffff 0%, #519eff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-fill-color: transparent;
      }
    }
    // 数据导览
    .navigation {
      margin-top: 5px;
      width: 100%;
      height: calc(100% - 44px);
      opacity: 1;
      background: linear-gradient(180deg, #26385a 0%, #000000 100%);
      box-sizing: border-box;
      border: 1px solid;
      border-image: linear-gradient(
        22deg,
        rgba(255, 255, 255, 0) 3%,
        rgba(0, 149, 255, 0.4) 100%
      );
      overflow-y: auto;
      // 导览区筛选框
      .nav-filter {
        height: 100px;
        border: 1px dashed rgba(211, 225, 255, 0.3);
        background: rgba(211, 225, 255, 0.06);
        border-radius: 6px;
        margin: 15px;
        box-sizing: border-box;
        padding: 0 15px;
        color: rgba(211, 225, 255, 0.7);
        font-size: 14px;
        font-weight: 500;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        :deep(.el-select) {
          width: 80%;
          .el-input {
            background-color: transparent;
            .el-input__inner {
              background: transparent;
              box-sizing: border-box;
              border: 1px solid rgba(255, 255, 255, 0.5);
              font: 400 14px "Microsoft YaHei";
              color: #ffffff;
            }
          }
          .el-select-dropdown {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            .el-scrollbar {
              background: linear-gradient(
                180deg,
                rgba(38, 56, 90, 1) 0%,
                rgba(0, 0, 0, 1) 100%
              ) !important;
              box-sizing: border-box;
              .el-select-dropdown__item {
                color: #fff;
              }
              .el-select-dropdown__item.hover {
                background: linear-gradient(
                  90deg,
                  rgba(0, 149, 255, 0.4) 0%,
                  rgba(94, 116, 153, 0) 100%
                );
              }
              .el-select-dropdown__item.selected {
                background: linear-gradient(
                  90deg,
                  rgba(0, 149, 255, 0.4) 0%,
                  rgba(94, 116, 153, 0) 100%
                );
                box-sizing: border-box;
                border-left: 3px solid #0095ff;
                box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
              }
            }
          }
        }
      }
      // 数据预览标题
      .nav-title {
        height: 52px;
        padding: 5px 15px;
        box-sizing: border-box;
        border-bottom: 1px solid rgba(94, 116, 153, 0.5);
        display: flex;
        align-items: center;
        .icon-container {
          width: 26px;
          height: 26px;
          background: #0095ff;
          box-sizing: border-box;
          border: 0.6px solid rgba(255, 255, 255, 0.36);
          box-shadow: 0px 1px 4px 0px rgba(0, 149, 255, 0.25),
            0px 3px 12px 2px rgba(0, 149, 255, 0.35);
          position: relative;
          .icon-yewumokuailiebiao {
            width: 16px;
            height: 16px;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            margin: auto;
          }
        }
        .nav-msg {
          font: 700 16px "Microsoft YaHei";
          margin-left: 12px;
        }
      }
      // 数据预览菜单
      .nav-menu {
        height: calc(100% - 52px - 130px);
        padding: 0 15px;
        overflow: auto;
        :deep(.el-menu) {
          background-color: transparent;
          border: 0px;
          .el-submenu {
            .el-submenu__title {
              height: 35px;
              line-height: 35px;
              margin-top: 15px;
              background: rgba(94, 116, 153, 0.5);
              color: #ffffff;
              i {
                color: #ffffff;
              }
              span {
                font-weight: 500;
                font-size: 14px;
              }
            }
            .second .el-submenu__title {
              height: 38px;
              line-height: 38px;
              margin-top: 10px;
              background: transparent;
              padding-left: 10px !important;
            }
            .submenu-body {
              margin: 0;
              padding: 0;
              display: flex;
              width: 100%;
              .menu-branch {
                width: 10%;
                .branch {
                  margin-left: 40%;
                  height: 50%;
                  width: 50%;
                  box-sizing: border-box;
                  border-left: 2px solid rgba(94, 116, 153, 0.5);
                }
                .branch-one {
                  border-bottom: 1px solid rgba(94, 116, 153, 0.5);
                }
                .branch-two {
                  border-top: 1px solid rgba(94, 116, 153, 0.5);
                }
              }
            }
            .el-menu-item {
              width: 90%;
              height: 38px;
              line-height: 38px;
              box-sizing: border-box;
              border: 1px solid rgba(255, 255, 255, 0.1);
              margin: 6px 0;
              color: #ffffff;
              font-size: 14px;
              font-weight: 400;
              position: relative;
              span {
                margin-left: -45px;
              }
              .icon-a-shujugengxin1 {
                color: rgb(21, 196, 21);
                font-size: 14px;
                margin-left: 10px;
              }
              button {
                position: absolute;
                top: 6px;
                opacity: 1;
                /* 自动布局 */
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
                padding: 7px 10px;
                gap: 4px;
                background: rgba(211, 225, 255, 0.1);
                box-sizing: border-box;
                border: 0.8px solid rgba(211, 225, 255, 0.7);
                box-shadow: inset 0px 0px 4px 0px rgba(211, 225, 255, 0.3);
                color: #d3e1ff;
                cursor: pointer;
              }
              .meta {
                right: 10px;
                width: 32px;
                height: 24px;
              }
              .download {
                right: 50px;
                width: 44px;
                height: 24px;
                font-weight: 500;
                font-size: 12px;
              }
              .download.full {
                background: linear-gradient(119deg, #0095ff 42%, #bfd7ff 100%);
              }
            }
            .el-menu-item:hover {
              background: linear-gradient(
                90deg,
                rgba(0, 149, 255, 0.4) 0%,
                rgba(94, 116, 153, 0) 100%
              );
            }
            .el-menu-item.is-active {
              background: linear-gradient(
                90deg,
                rgba(0, 149, 255, 0.4) 0%,
                rgba(94, 116, 153, 0) 100%
              );
              box-sizing: border-box;
              border-left: 3px solid #0095ff;
              box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
            }
          }
        }
      }
      // 图表框
      .chart-widget {
        border-radius: 6px;
        opacity: 1;
        background: rgba(211, 225, 255, 0.06);
        box-sizing: border-box;
        border: 1px dashed rgba(211, 225, 255, 0.3);
        height: 180px;
        margin: 10px;
        position: relative;
        .img-box {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          margin: auto;
          width: calc(100% - 14px);
          height: calc(100% - 14px);
          border-radius: 6px;
          background: #ffffff;
          text-align: center;
        }
        img {
          // position: absolute;
          // top: 0;
          // left: 0;
          // bottom: 0;
          // right: 0;
          margin: auto;
          // width: calc(100% - 14px);

          height: 100%;
          // border-radius: 6px;
          // background: #ffffff;
        }
      }
    }
  }
  .main {
    width: calc(100% - 350px * 2);
    height: calc(100% - 10px);
    margin: 0 10px 10px 10px;
    position: relative;
    // 头部窗口
    .data-header {
      height: 60px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      .data-read {
        font-weight: 700;
        font-size: 18px;
        .protocol-url {
          display: inline-block;
          font: inherit;
          cursor: pointer;
          color: #0095ff;
        }
      }
      // 数据上传按钮
      .data-upload {
        width: 132px;
        height: 46px;
        background: url("../../assets/imgs/jump.png") no-repeat;
        background-size: 100% 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        button {
          background: transparent;
          border: 0px;
          font-weight: 700;
          font-size: 14px;
          color: #ffffff;
          cursor: pointer;
          i {
            padding-right: 5px;
            font-size: 20px;
            vertical-align: bottom;
          }
        }
      }
    }
    .data-widget {
      background: rgba(94, 116, 153, 0.19);
      width: 100%;
      height: calc(100% - 60px);
      border-top: 1px solid transparent;
      .widget-title {
        height: 27px;
        line-height: 27px;
        margin: 13px 0;
        border-left: 3px solid #0095ff;
        padding: 0 15px;
        .icon-weizhi02-F {
          margin-right: 10px;
        }
        span {
          font-weight: 700;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.4);
        }
      }
      .preview-widget {
        margin: 10px;
        width: calc(100% - 20px);
        height: calc(100% - 20px - 40px);
        position: relative;
        .data-information {
          height: 30%;
          width: 100%;
        }
        .data-filter {
          height: 12%;
          width: 100%;
          margin: 1% 0;
        }
        .data-preview {
          height: 48%;
          width: 100%;
          margin: 1% 0;
        }
        .data-detail {
          height: 100%;
          width: 100%;
        }
      }
    }
  }
}
</style>

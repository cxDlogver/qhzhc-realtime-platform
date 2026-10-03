<template>
  <div class="nav-container">
    <el-menu default-active="1" @open="handleOpen" @close="handleClose">
      <el-submenu index="1">
        <template slot="title">
          <i class="el-icon-menu"></i>
          <span>数据主题</span>
        </template>
        <el-submenu class="second" v-for="(value, key, tag) in dataTitle" :key="key" :index="'1-' + tag">
          <template slot="title">
            <i :class="isOpen('1-' + tag) ? 'el-icon-minus' : 'el-icon-plus'"></i>
            <span>{{ key }}</span>
          </template>
          <div class="submenu-body" v-for="(item, id) in value" :key="item">
            <div class="menu-branch">
              <div class="branch-one branch"></div>
              <div class="branch-two branch" v-if="!(id == value.length - 1)"></div>
            </div>
            <el-menu-item :index="'1-' + tag + '-' + id">
              <span>{{ item }}</span>
              <i class="iconfont icon-a-shujugengxin1"></i>
              <button class="download full">下载</button>
              <button class="meta">
                <i class="iconfont icon-medium"></i>
              </button>
            </el-menu-item>
          </div>
        </el-submenu>
      </el-submenu>
      <el-submenu index="2">
        <template slot="title">
          <i class="el-icon-menu"></i>
          <span>行业分类</span>
        </template>
        <el-submenu class="second" v-for="(value, key, tag) in dataIndustry" :key="key" :index="'2-' + tag">
          <template slot="title">
            <i :class="isOpen('2-' + tag) ? 'el-icon-minus' : 'el-icon-plus'"></i>
            <span>{{ key }}</span>
          </template>
          <div class="submenu-body" v-for="(item, id) in value" :key="item">
            <div class="menu-branch">
              <div class="branch-one branch"></div>
              <div class="branch-two branch" v-if="!(id == value.length - 1)"></div>
            </div>
            <el-menu-item :index="'2-' + tag + '-' + id">
              <span>{{ item }}</span>
              <i class="iconfont icon-a-shujugengxin1"></i>
              <button class="download full">下载</button>
              <button class="meta">
                <i class="iconfont icon-medium"></i>
              </button>
            </el-menu-item>
          </div>
        </el-submenu>
      </el-submenu>
      <el-submenu index="3">
        <template slot="title">
          <i class="el-icon-menu"></i>
          <span>政策数据</span>
        </template>
        <el-submenu class="second" v-for="(value, key, tag) in dataPolicy" :key="key" :index="'3-' + tag">
          <template slot="title">
            <i :class="isOpen('3-' + tag) ? 'el-icon-minus' : 'el-icon-plus'"></i>
            <span>{{ key }}</span>
          </template>
          <div class="submenu-body" v-for="(item, id) in value" :key="item">
            <div class="menu-branch">
              <div class="branch-one branch"></div>
              <div class="branch-two branch" v-if="!(id == value.length - 1)"></div>
            </div>
            <el-menu-item :index="'3-' + tag + '-' + id">
              <span>{{ item }}</span>
              <i class="iconfont icon-a-shujugengxin1"></i>
              <button class="download full">下载</button>
              <button class="meta">
                <i class="iconfont icon-medium"></i>
              </button>
            </el-menu-item>
          </div>
        </el-submenu>
      </el-submenu>
    </el-menu>
  </div>
</template>

<style lang="scss" scoped>
.nav-container {
  width: 100%;
  height: 100%;
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
        font-size: 14px;
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
          margin-left: -20px;
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
        background: linear-gradient(90deg,
            rgba(0, 149, 255, 0.4) 0%,
            rgba(94, 116, 153, 0) 100%);
      }
      .el-menu-item.is-active {
        background: linear-gradient(90deg,
            rgba(0, 149, 255, 0.4) 0%,
            rgba(94, 116, 153, 0) 100%);
        box-sizing: border-box;
        border-left: 3px solid #0095ff;
        box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
      }
    }
  }
}
</style>

<script>
import { requiredList } from "../../../api/home";
export default {
  data() {
    return {
      defaultOpeneds: [],
      user: localStorage.getItem("user")
        ? JSON.parse(localStorage.getItem("user"))
        : null,
      // 数据主题数据
      dataTitle: {},
      // 行业分类数据
      dataIndustry: {},
      // 政策数据
      dataPolicy: {},
    };
  },
  props: {
    dataTitleValue: {
      type: String,
      default: "",
    },
    dataIndustryValue: {
      type: String,
      default: "",
    },
    dataTitleTotal: {
      type: Array,
      default: () => [],
    },
    dataIndustryTotal: {
      type: Array,
      default: () => [],
    },
  },
  created() {
    this.$nextTick(() => {
      this.requireData();
    });
  },
  mounted() {
    if (this.$parent.dataTitle.length > 0) {
      this.requireData();
    }
  },
  // 数据监听
  watch: {
    dataTitleValue() {
      this.$nextTick(() => {
        this.requireData();
      });
    },
    dataIndustryValue() {
      this.$nextTick(() => {
        this.requireData();
      });
    },
  },
  methods: {
    /** 菜单栏展开收起操作 */
    handleOpen(index) {
      this.defaultOpeneds.push(index);
    },
    handleClose(index) {
      const id = this.defaultOpeneds.indexOf(index);
      if (id !== -1) {
        this.defaultOpeneds.splice(id, 1);
      }
    },
    isOpen(index) {
      const id = this.defaultOpeneds.indexOf(index);
      if (id !== -1) {
        return true;
      } else {
        return false;
      }
    },

    /** 数据总览 */
    requireData() {
      // 数据接口获取数据
      if (!this.user) {
        return null;
      }
      var obj = {};
      if (this.dataTitleValue == "" && this.dataIndustryValue == "") {
        obj = { data_subject: undefined, industry_classification: undefined };
      } else {
        obj = {
          data_subject: this.dataTitleValue,
          industry_classification: this.dataIndustryValue,
        };
      }
      // console.log(this.dataTitleValue, this.dataIndustryValue, "请求数据");
      requiredList(obj).then((res) => {
        // console.log(res.data);
        this.getData(res.data.datatype);
      });
    },
    getData(data) {
      const keys = Object.keys(data);
      this.dataTitle = {};
      this.dataIndustry = {};
      this.dataPolicy = {};
      keys.forEach((key) => {
        if (this.dataTitleTotal.includes(key)) {
          // this.dataTitle[key] = data[key].slice();
          this.$set(this.dataTitle, key, data[key].slice());
        } else if (this.dataIndustryTotal.includes(key)) {
          // this.dataIndustry[key] = data[key].slice();
          this.$set(this.dataIndustry, key, data[key].slice());
        } else {
          this.$set(this.dataPolicy, key, data[key].slice());
        }
      });
      // console.log("dataTitle : ", this.dataTitle);
      // console.log("dataIndustry : ", this.dataIndustry);
      // console.log("dataPolicy : ", this.dataPolicy);
    },
  },
};
</script>

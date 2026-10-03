<!-- 相关成果 -->
<template>
  <div class="result-container">
    <div class="result-left">
      <div :class="['box', { active: active == 'paper' }]" @click="titleChange('paper')">
        <div class="icon">
          <i class="iconfont icon-wendang"></i>
        </div>
        <span class="title">论文</span>
      </div>
      <div :class="['box', { active: active == 'model_algorithm' }]" @click="titleChange('model_algorithm')">
        <div class="icon">
          <i class="iconfont icon-measure"></i>
        </div>
        <span class="title">模型算法</span>
      </div>
      <div :class="['box', { active: active == 'Patent_Software_Works' }]"
        @click="titleChange('Patent_Software_Works')">
        <div class="icon">
          <i class="iconfont icon-zhuanlizizhu-"></i>
        </div>
        <span class="title">专利软著</span>
      </div>
      <div :class="['box', { active: active == 'project' }]" @click="titleChange('project')">
        <div class="icon">
          <i class="iconfont icon-xiangmuhuizong"></i>
        </div>
        <span class="title">项目</span>
      </div>
      <div :class="['box', { active: active == 'Policies_regulations' }]" @click="titleChange('Policies_regulations')">
        <div class="icon">
          <i class="iconfont icon-zhengcefagui2"></i>
        </div>
        <span class="title">政策法规</span>
      </div>
    </div>
    <div class="result-right">
      <!-- 搜索框，仅在论文板块显示 -->
      <div class="paper-search-bar">
        <input v-model="searchTitle" @keyup.enter="handleSearch" class="search-input" placeholder="请输入要查询的标题" />
        <button class="search-btn" @click="handleSearch">搜索</button>
      </div>
      <!-- 主页栏 -->
      <div class="result-main">
        <div class="result-item" v-for="item in showList" :key="item.id">
          <div class="result-title">{{ item.titlename }}</div>
          <div class="result-subtitle">
            <span class="result-time">
              <i class="el-icon-date"> {{ item.filetime }} </i>
            </span>
            <span class="result-author">
              <i class="el-icon-user">{{ item.author }}</i>
            </span>
          </div>
          <div class="result-brief">{{ item.describtion }}</div>
          <div class="result-link" @click="handelPreview(item)" v-if="!item.is_exterlinks">
            <i class="el-icon-view"></i>
            <span>查看</span>
          </div>
          <div class="result-link" v-if="item.is_exterlinks" @click="handelPreview(item)">
            <span>跳转</span>
            <i class="iconfont icon-tiaozhuan"></i>
          </div>
        </div>
      </div>
      <!-- 分页栏 -->
      <div class="result-pagination">
        <el-pagination @size-change="handleSizeChange" @current-change="handleCurrentChange" :current-page="currentPage"
          :page-sizes="pageSizes" :page-size="pageSize" layout="total,  prev, pager, next" :total="total">
        </el-pagination>
      </div>
      <!-- 文档详情弹窗 -->
      <div class="resultDetail" v-if="showFlag">
        <div class="d-title">{{ dialogTitle }}</div>
        <div class="d-conent">
          <iframe style="width: 100%; height: 100%; color: #fff" :src="url"></iframe>
        </div>
        <div class="close-btn" @click="cancel">×</div>
      </div>
    </div>

    <!-- <el-dialog
      :title="dialogTitle"
      :visible.sync="showFlag"
      width="805px"
      @close="cancel"
    >
      <div class="range-form">
        <iframe style="width: 100%; height: 100%" :src="url"></iframe>
      </div>
      <template slot="footer">
        <div class="footer-widget">
          <el-button
            class="footer-button"
            type="primary"
            @click="cancel"
            size="small"
          >
            <i class="iconfont icon-queding"></i>
            <span>确 定</span>
          </el-button>
          <el-button class="footer-button" @click="cancel" size="small">
            <i class="iconfont icon-guanbi1"></i>
            <span>取 消</span>
          </el-button>
        </div>
      </template>
</el-dialog> -->
  </div>
</template>

<script>
import { searchResult } from "../../api/home"
export default {
  name: "ResultIndex",
  data() {
    return {
      resultList: [],
      active: "paper",
      // 分页栏属性
      pageSizes: [5, 10, 15, 20],
      pageSize: 5,
      currentPage: 1,
      showList: [],
      dialogTitle: "", //文档标题
      showFlag: false, //弹窗
      url: "",
      total: 0,
      searchTitle: "",
      allPaperList: [], // 论文原始数据
    };
  },
  created() {
    this.handleShowList();
  },
  methods: {
    // 菜单栏切换
    titleChange(value) {
      this.active = value;
      this.currentPage = 1;
      this.handleShowList();
      this.showFlag = false; //关闭详情弹窗
      this.searchTitle = "";
    },

    /** 分页栏方法 */
    // 切换当前页
    handleCurrentChange(currentPage) {
      this.currentPage = currentPage;
      this.handleShowList();
    },
    // 切换页的大小
    handleSizeChange(pageSize) {
      this.pageSize = pageSize;
      this.handleShowList();
    },
    // 设置当前显示的列表
    handleShowList() {
      searchResult({
        search_content: this.searchTitle,
        news_character: this.active,
        page_number: this.currentPage,
        data_size: this.pageSize,
      }).then((res) => {
        this.showList = res.data.record;
        this.total = res.data.data_total;
        if (this.active === 'paper') {
          this.allPaperList = res.data.record;
        }
      });
    },
    // 搜索论文标题
    handleSearch() {
      // if (this.active !== 'paper') return;
      // const keyword = this.searchTitle.trim();
      // if (!keyword) {
      //   this.showList = this.allPaperList;
      //   this.total = this.allPaperList.length;
      //   return;
      // }
      // const filtered = this.allPaperList.filter(item => item.titlename && item.titlename.includes(keyword));
      // this.showList = filtered;
      // this.total = filtered.length;
      this.currentPage = 1;
      this.handleShowList();
    },
    // 查看详情
    handelPreview(value) {
      if (value.is_exterlinks) {
        window.open(value.fileurl, "_blank");
      } else {
        this.showFlag = true;
        this.dialogTitle = value.titlename;
        this.url = value.htmlpath;
      }
    },
    cancel() {
      this.showFlag = false;
    },

    // // 获奖详情
    // hrefNews(val) {
    //   this.$router.push({ path: "/newDetail", query: { id: val } });
    // },
  },
};
</script>

<style lang="scss" scoped>
@media screen and (max-width:750px) {
  .result-left {
    width: 40px;
    height: 100%;
    margin-right: 6px;
    .box {
      width: 100%;
      // height: 50px;
      text-align: center;
      cursor: pointer;
      margin-bottom: 10px;
      .icon {

        margin-left: auto;
        margin-right: auto;
        width: 36px;
        height: 36px;
        background: linear-gradient(137deg, rgba(0, 0, 0, 0) 5%, #0095ff 103%);
        box-sizing: border-box;
        border: 1px solid rgba(0, 149, 255, 0.84);
        display: flex;
        align-items: center;
        justify-content: center;
        i {
          font-size: 20px;
        }
      }
      .title {
        font-weight: 500;
        font-size: 14px;
        line-height: 25px;
        letter-spacing: 0em;
        color: #d3e1ff;
      }
    }
  }
  .result-right {
    width: calc(100% - 46px);
    height: 100%;
    position: relative;
    // 新闻栏
    .result-main {
      width: 100%;
      height: calc(100% - 95px);
      // background-color: rgba($color: #ffffff, $alpha: 0.05);
      border: 1px transparent solid;
      display: flex;
      flex-direction: column;
      justify-content: start;
      overflow: auto;
      .result-item {
        position: relative;
        display: flex;
        flex-direction: column;
        margin: 10px 10px 0 10px;
        border-radius: 4px;
        padding: 10px;
        background: rgba(189, 212, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.18);
        width: calc(100% - 20px);
        box-sizing: border-box;
        overflow: auto;
        flex-shrink: 0;
        cursor: pointer;

        .result-title {
          font-size: 16px;
          font-weight: 700;
        }
        .result-subtitle {
          font-weight: 500;
          font-size: 12px;
          color: rgba($color: #ffffff, $alpha: 0.6);
          line-height: 26px;
          letter-spacing: 0px;
          font-variation-settings: "opsz" auto;
          .result-author i {
            width: calc(100% - 60px);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
          }


          span {
            margin-right: 10px;
            vertical-align: top;
            i {
              height: 20px;
              line-height: 20px;
              vertical-align: top;
            }
          }
        }
        .result-brief {
          margin-top: 10px;
          color: #e0efff;
          font: 400 14px;
          line-height: 26px;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
          line-clamp: 3;
          overflow: hidden;
        }
        .result-link {
          // position: absolute;
          // right: 0px;
          // top: 0px;
          width: 75px;
          height: 40px;
          opacity: 1;
          background: #0095ff;
          border-radius: 4px;
          margin: auto;
          //  text-align: right;
          font-weight: 700;
          font-size: 14px;
          display: flex;
          justify-content: space-evenly;
          align-items: center;
        }
      }
      .result-item:hover {
        background: rgba(0, 149, 255, 0.16);
        box-sizing: border-box;
        border: 1px solid #0095ff;
        box-shadow: -1px 6px 10px 0px rgba(0, 149, 255, 0.08),
          inset 0px 0px 10px 0px rgba(0, 149, 255, 0.26);
        .result-link {
          border: 1px solid #ffffff;
          box-shadow: 0px 2px 10px 0px #0095ff;
          background: linear-gradient(64deg, #0095ff 40%, #00ffdd 103%);
        }
      }
    }
    // 分页栏
    .result-pagination {
      // height: 80px;
      width: 100%;
      display: flex;
      align-items: center;
      :deep(.el-pagination) {
        position: relative;
        // background-color: rgba(94, 116, 153, 0.19);
        padding: 15px;
        width: 100%;
        display: flex;
        justify-content: flex-end;
        .el-pagination__total {
          margin-right: auto;
          color: #d3e1ff;
        }
        .el-input__inner {
          background: rgba(211, 225, 255, 0.22);
        }
        .btn-prev,
        .el-pager,
        .btn-next,
        .number {
          background: transparent;
          color: rgb(192, 196, 204);
        }
        .number.active {
          color: rgb(64, 158, 255);
        }
      }
    }
    // 详情
    .resultDetail {
      position: absolute;
      width: 100%;
      height: calc(100% - 64px);
      top: 0;
      right: 0;
      z-index: 33;
      background: #141a23;
      // background: #242f3e;
      box-sizing: border-box;
      border: 1px solid rgba(211, 225, 255, 0.33);
      padding: 8px;
      box-sizing: border-box;
      font-weight: 400;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      .d-title {
        font-size: 16px;
        font-weight: bold;
        line-height: 30px;
        width: 90%;
        margin: auto;
      }
      .d-conent {
        width: 90%;
        // height: calc(100% - 60px);
        margin: auto;
        flex: 1;
        :deep(iframe) {
          html {
            font-size: 14px;
          }
        }
      }
      .close-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        cursor: pointer;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 1px solid rgba(211, 225, 255, 0.33);
        font-size: 22px;
        background: #1f2935;
        text-align: center;
        line-height: 30px;
      }
    }
  }
}
@media screen and (min-width:750px) {
  .result-left {
    width: 90px;
    height: 100%;
    margin-right: 10px;
    background: linear-gradient(180deg, #001e36 0%, rgba(0, 0, 0, 0) 100%);
    box-sizing: border-box;
    border: 1px solid;
    border-image: linear-gradient(0deg, #0095ff 0%, rgba(7, 220, 249, 0) 100%);
    box-shadow: inset 0px 6px 10px 0px rgba(0, 149, 255, 0.32);
    .box {
      width: 100%;
      height: 80px;
      text-align: center;
      cursor: pointer;
      .icon {
        margin-top: 30px;
        margin-left: auto;
        margin-right: auto;
        width: 50px;
        height: 50px;
        background: linear-gradient(137deg, rgba(0, 0, 0, 0) 5%, #0095ff 103%);
        box-sizing: border-box;
        border: 1px solid rgba(0, 149, 255, 0.84);
        display: flex;
        align-items: center;
        justify-content: center;
        i {
          font-size: 30px;
        }
      }
      .title {
        font-weight: 500;
        font-size: 16px;
        line-height: 25px;
        letter-spacing: 0em;
        color: #d3e1ff;
      }
    }
  }
  .result-right {
    width: calc(100% - 100px);
    height: 100%;
    position: relative;
    // 新闻栏
    .result-main {
      width: 100%;
      height: calc(100% - 110px); // 进一步压缩，确保新闻区完全显示
      background-color: rgba($color: #ffffff, $alpha: 0.05);
      border: 1px transparent solid;
      display: flex;
      flex-direction: column;
      justify-content: start;
      overflow: auto;
      .result-item {
        position: relative;
        display: flex;
        flex-direction: column;
        margin: 10px 10px 0 10px;
        border-radius: 4px;
        padding: 10px;
        background: rgba(189, 212, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.18);
        width: calc(100% - 20px);
        box-sizing: border-box;
        height: 166px;
        overflow: auto;
        flex-shrink: 0;
        cursor: pointer;

        .result-title {
          font-size: 20px;
          font-weight: 700;
          .result-author i {
            width: calc(100% - 250px);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
          }
        }
        .result-subtitle {
          font-weight: 500;
          font-size: 12px;
          color: rgba($color: #ffffff, $alpha: 0.6);
          line-height: 26px;
          letter-spacing: 0px;
          font-variation-settings: "opsz" auto;
          span {
            margin-right: 20px;
            vertical-align: top;
            i {
              height: 20px;
              line-height: 20px;
              vertical-align: top;
            }
          }
        }
        .result-brief {
          margin-top: 20px;
          color: #e0efff;
          font: 400 14px;
          line-height: 26px;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
          line-clamp: 3;
          overflow: hidden;
        }
        .result-link {
          position: absolute;
          right: 0px;
          top: 0px;
          width: 75px;
          height: 40px;
          opacity: 1;
          background: #0095ff;
          border-radius: 4px;
          margin: 20px;
          font-weight: 700;
          font-size: 14px;
          display: flex;
          justify-content: space-evenly;
          align-items: center;
        }
      }
      .result-item:hover {
        background: rgba(0, 149, 255, 0.16);
        box-sizing: border-box;
        border: 1px solid #0095ff;
        box-shadow: -1px 6px 10px 0px rgba(0, 149, 255, 0.08),
          inset 0px 0px 10px 0px rgba(0, 149, 255, 0.26);
        .result-link {
          border: 1px solid #ffffff;
          box-shadow: 0px 2px 10px 0px #0095ff;
          background: linear-gradient(64deg, #0095ff 40%, #00ffdd 103%);
        }
      }
    }
    // 分页栏
    .result-pagination {
      height: 49px;
      width: 100%;
      display: flex;
      align-items: center;
      margin-top: 8px;
      overflow: hidden;
      :deep(.el-pagination) {
        position: relative;
        background-color: rgba(94, 116, 153, 0.19);
        padding: 15px;
        width: 100%;
        display: flex;
        justify-content: flex-end;
        .el-pagination__total {
          margin-right: auto;
          color: #d3e1ff;
        }
        .el-input__inner {
          background: rgba(211, 225, 255, 0.22);
        }
        .btn-prev,
        .el-pager,
        .btn-next,
        .number {
          background: transparent;
          color: rgb(192, 196, 204);
        }
        .number.active {
          color: rgb(64, 158, 255);
        }
      }
    }
    // 详情
    .resultDetail {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      right: 0;
      z-index: 33;
      background: #141a23;
      // background: #242f3e;
      box-sizing: border-box;
      border: 1px solid rgba(211, 225, 255, 0.33);
      padding: 8px;
      box-sizing: border-box;
      font-weight: 400;
      font-size: 14px;
      .d-title {
        font-size: 20px;
        font-weight: bold;
        line-height: 30px;
        width: 90%;
        margin: auto;
      }
      .d-conent {
        width: 90%;
        height: calc(100% - 60px);
        margin: auto;
        :deep(iframe) {
          html {
            background: transparent;
          }
        }
      }
      .close-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        cursor: pointer;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 1px solid rgba(211, 225, 255, 0.33);
        font-size: 22px;
        background: #1f2935;
        text-align: center;
        line-height: 30px;
      }
    }
  }
}
.result-container {
  width: 100%;
  height: 100%;
  display: flex;
  padding: 8px;
  box-sizing: border-box;
  .result-left {
    .box.active {
      .icon {
        background: linear-gradient(142deg,
            rgba(0, 0, 0, 0) -17%,
            rgba(43, 227, 255, 0.9) 45%,
            #12ff9b 90%);
        box-shadow: 0px 4px 10px 0px rgba(0, 0, 0, 0.22),
          inset 0px 0px 27px 0px rgba(0, 0, 0, 0.34);
      }
      .title {
        color: #ffffff;
      }
    }
  }

}
:deep(.el-dialog) {
  background: #1f2935;
  box-sizing: border-box;
  border: 1px solid rgba(211, 225, 255, 0.33);
  font: 400 14px "Microsoft YaHei";
  width: 40%;
  .el-dialog__header {
    height: 40px;
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 25px;

      .icon-widget {
        i {
          font-size: 30px;
          color: rgba(255, 255, 255, 0.3);
          padding: 0 10px;
          cursor: pointer;
        }
      }
    }
    .el-dialog__title {
      color: #ffffff;
    }
  }
  .el-dialog__body {
    padding: 0 20px;
    color: #ffffff;
    .range-form {
      max-height: 60vh;
      height: 400px;
    }
  }
  .el-dialog__footer {
    height: 60px;
    .footer-button {
      border-radius: 6px;
      font-size: 14px;
      i {
        margin-right: 5px;
        vertical-align: middle;
      }
    }
  }
}
.paper-search-bar {
  display: flex;
  align-items: center;
  margin-bottom: 2px;
  margin-top: 8px;
  background: none;
  border-radius: 0;
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  height: auto;
  .search-input {
    flex: 1;
    height: 40px;
    border: none;
    outline: none;
    background: #122336;
    color: #d3e1ff;
    font-size: 16px;
    padding-left: 32px;
    border-radius: 4px;
    box-sizing: border-box;
    font-family: inherit;
    margin: 0;
  }
  .search-btn {
    height: 40px;
    min-width: 80px;
    background: #0095ff;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.2s;
    margin-left: 12px;
    z-index: 1;
    &:hover {
      background: #0077cc;
    }
  }
}
@media screen and (min-width: 1200px) {
  .paper-search-bar {
    width: 800px;
    margin-left: 0;
    margin-right: auto;
    .search-input {
      width: 420px;
      min-width: 0;
      flex: none;
    }
  }
}
</style>

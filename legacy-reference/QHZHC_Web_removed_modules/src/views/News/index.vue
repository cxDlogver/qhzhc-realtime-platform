<!-- 新闻动态 -->
<template>
  <div class="news-center-wrapper">
    <div class="news-side-nav">
      <div v-for="item in navList" :key="item.type" :class="['nav-item', { active: activeType === item.type }]"
        @click="switchType(item.type)">
        <div class="icon">
          <i :class="['iconfont', item.icon]"></i>
        </div>
        <span class="title">{{ item.title }}</span>
      </div>
    </div>
    <div class="news-center-content">

      <!-- 新闻动态原有内容 -->
      <div class="news-container" v-if="showList.length > 0">
        <div class="news-main">
          <div class="news-item" v-for="item in showList" :key="item.id" @click="hrefNews(item)">
            <div class="news-image">
              <img :src="item.pngpath" alt="" />
            </div>
            <div class="news-context">
              <div class="news-title">{{ item.titlename }}</div>
              <div class="news-subtitle">
                <span class="news-time">
                  <i class="el-icon-date"> {{ item.filetime }} </i>
                </span>
                <span class="news-author">
                  <i class="el-icon-user">{{ item.author }}</i>
                </span>
              </div>
              <div class="news-brief">{{ item.describtion }}</div>
            </div>
          </div>
        </div>
        <div class="news-pagination">
          <el-pagination @size-change="handleSizeChange" @current-change="handleCurrentChange"
            :current-page="currentPage" :page-sizes="pageSizes" :page-size="pageSize"
            layout="total, sizes, prev, pager, next" :total="total">
          </el-pagination>
        </div>
      </div>

      <div v-else class="coming-soon">
        <div class="coming-icon">
          <i :class="['iconfont', navList.find(n => n.type === activeType).icon]"></i>
        </div>
        <div class="coming-text">敬请期待</div>
      </div>
    </div>
  </div>
</template>

<script>
import { ressourceshow } from "../../api/news";
export default {
  name: "NewsIndex",
  data() {
    return {
      navList: [
        { type: "News_Dynamics", title: "新闻动态", icon: "icon-xinwen1" },
        { type: "Expert_opinion", title: "专家观点", icon: "icon-measure" },
        { type: "Scientific_research", title: "科研进展", icon: "icon-zhuanlizizhu-" },
        { type: "Notice_announcement", title: "通知公告", icon: "icon-wendang" },
        { type: "Talent_Acquisition", title: "人才招聘", icon: "icon-rencaizhaopin" },
      ],
      activeType: "News_Dynamics",
      // 分页栏属性
      pageSizes: [5, 10, 15, 20],
      pageSize: 5,
      currentPage: 1,
      showList: [],
      total: 0,
    };
  },
  created() {
    // Centerrecour().then(res => { })
    this.handleShowList();
  },
  methods: {
    switchType(type) {
      this.activeType = type;
      this.currentPage = 1;
      this.handleShowList();

    },
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
      ressourceshow({
        news_character: this.activeType,
        page_number: this.currentPage,
        data_size: this.pageSize,
      }).then((res) => {
        console.log(res.data.record)
        this.showList = res.data.record;
        this.total = res.data.data_total;
      });
    },
    // 新闻详情
    hrefNews(item) {
      // if (item.is_exterlinks) {
      window.open(item.fileurl, "_blank");
      // } else {
      //   this.$router.push({
      //     path: "/newDetail",
      //     query: { url: item.htmlpath },
      //   });
      // }
    },
  },
};
</script>

<style lang="scss" scoped>
.news-center-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 600px;
}

.news-side-nav {
  width: 90px;
  height: 100%;
  margin-right: 10px;
  background: linear-gradient(180deg, #001e36 0%, rgba(0, 0, 0, 0) 100%);
  box-sizing: border-box;
  border: 1px solid;
  border-image: linear-gradient(0deg, #0095ff 0%, rgba(7, 220, 249, 0) 100%);
  box-shadow: inset 0px 6px 10px 0px rgba(0, 149, 255, 0.32);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0;

  .nav-item {
    width: 100%;
    // height: 80px;
    text-align: center;
    cursor: pointer;
    overflow: hidden;
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

  .nav-item.active {
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

.news-center-content {
  flex: 1;
  padding: 0 0 0 0;
  background: transparent;
}

.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;

  .coming-icon {
    margin-top: 120px;
    font-size: 60px;
    color: #e0efff;
  }

  .coming-text {
    margin-top: 30px;
    font-size: 22px;
    color: #b1b1b1;
    letter-spacing: 2px;
  }
}

// 保留原有新闻内容样式
@media screen and (min-width: 1200px) {
  .news-center-content {
    height: 100%;
    overflow-y: auto;
  }

  .news-item {
    display: flex;
    margin: 10px 10px 0 10px;
    border-radius: 4px;
    padding: 10px;
    background: rgba(189, 212, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    width: calc(100% - 20px);
    box-sizing: border-box;
    height: 164px;
    overflow: auto;
    flex-shrink: 0;
    cursor: pointer;

    .news-image {
      height: 142px;
      width: 243px;
      img {
        height: inherit;
        border-radius: 4px 4px;
      }
    }

    .news-context {
      margin-left: 10px;

      .news-title {
        font: 700 20px "Microsoft YaHei";
        font-variation-settings: "opsz" auto;
      }

      .news-subtitle {
        font: 500 12px "Microsoft YaHei";
        color: rgba($color: #ffffff, $alpha: 0.6);
        line-height: 20px;
        letter-spacing: 0px;
        font-variation-settings: "opsz" auto;

        span {
          margin-right: 20px;
        }
      }

      .news-brief {
        height: 80px;
        margin-top: 10px;
        color: #e0efff;
        font: 400 14px "Microsoft YaHei";
        line-height: 26px;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        overflow: hidden;
      }
    }
  }

  .news-item:hover {
    background: rgba(0, 149, 255, 0.16);
    box-sizing: border-box;
    border: 1px solid #0095ff;
    box-shadow: -1px 6px 10px 0px rgba(0, 149, 255, 0.08),
      inset 0px 0px 10px 0px rgba(0, 149, 255, 0.26);
  }
}

@media screen and (max-width: 1200px) and (min-width: 750px) {
  .news-item {
    display: flex;
    margin: 10px 10px 0 10px;
    border-radius: 4px;
    padding: 10px;
    background: rgba(189, 212, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    width: calc(100% - 20px);
    box-sizing: border-box;
    height: 164px;
    overflow: auto;
    flex-shrink: 0;
    cursor: pointer;

    .news-image {
      height: 100%;

      img {
        height: inherit;
        border-radius: 4px 4px;
      }
    }

    .news-context {
      margin-left: 10px;

      .news-title {
        font: 700 20px "Microsoft YaHei";
        font-variation-settings: "opsz" auto;
      }

      .news-subtitle {
        font: 500 12px "Microsoft YaHei";
        color: rgba($color: #ffffff, $alpha: 0.6);
        line-height: 20px;
        letter-spacing: 0px;
        font-variation-settings: "opsz" auto;

        span {
          margin-right: 20px;
        }
      }

      .news-brief {
        height: 80px;
        margin-top: 10px;
        color: #e0efff;
        font: 400 14px "Microsoft YaHei";
        line-height: 26px;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        overflow: hidden;
      }
    }
  }

  .news-item:hover {
    background: rgba(0, 149, 255, 0.16);
    box-sizing: border-box;
    border: 1px solid #0095ff;
    box-shadow: -1px 6px 10px 0px rgba(0, 149, 255, 0.08),
      inset 0px 0px 10px 0px rgba(0, 149, 255, 0.26);
  }
}

@media screen and (max-width:750px) {

  .news-side-nav {
    width: 40px;
    height: 100%;
    margin-right: 6px;
    background: transparent;
    border: none;
    box-shadow: none;
    .nav-item {
      width: 100%;
      // height: 50px;
      text-align: center;
      cursor: pointer;
      .icon {
        margin-top: 10px;
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
  .news-item {
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

    .news-image {
      width: 100%;
      text-align: center;
      // height: 142px;
      img {
        width: 90%;
        border-radius: 4px 4px;
      }
    }

    .news-context {
      margin-left: 10px;

      .news-title {
        font: 700 20px "Microsoft YaHei";
        font-variation-settings: "opsz" auto;
      }

      .news-subtitle {
        font: 500 12px "Microsoft YaHei";
        color: rgba($color: #ffffff, $alpha: 0.6);
        line-height: 20px;
        letter-spacing: 0px;
        font-variation-settings: "opsz" auto;

        span {
          margin-right: 20px;
        }
      }

      .news-brief {
        height: 80px;
        margin-top: 10px;
        color: #e0efff;
        font: 400 14px "Microsoft YaHei";
        line-height: 26px;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        overflow: hidden;
      }
    }
  }

  .news-item:hover {
    background: rgba(0, 149, 255, 0.16);
    box-sizing: border-box;
    border: 1px solid #0095ff;
    box-shadow: -1px 6px 10px 0px rgba(0, 149, 255, 0.08),
      inset 0px 0px 10px 0px rgba(0, 149, 255, 0.26);
  }
}

.news-container {
  width: 100%;
  height: 100%;

  .news-main {
    width: 100%;
    height: calc(100% - 80px);
    background-color: rgba($color: #ffffff, $alpha: 0.05);
    border: 1px transparent solid;
    display: flex;
    flex-direction: column;
    justify-content: start;
    overflow-y: auto;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .news-pagination {
    height: 80px;
    width: 100%;
    display: flex;
    align-items: center;

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
}
</style>

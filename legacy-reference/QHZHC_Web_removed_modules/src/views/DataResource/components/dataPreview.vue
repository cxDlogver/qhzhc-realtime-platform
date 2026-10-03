<template>
  <el-container class="preview-container">
    <!-- 表头 -->
    <el-header>表头</el-header>
    <el-container class="preview-widget">
      <!-- 左侧导航栏 -->
      <!-- <el-aside>
        <div class="title">
          <i class="el-icon-menu"></i>
          <span>目录</span>
        </div>
        <el-menu
          default-active="1"
          :default-openeds="['1']">
          <el-submenu index="1">
            <template slot="title">
              <span>Wind Speed</span>
            </template>
<el-menu-item index="1-1">
  <span>数据内容1</span>
</el-menu-item>
<el-menu-item index="1-2">
  <span>数据内容2</span>
</el-menu-item>
<el-menu-item index="1-3">
  <span>数据内容3</span>
</el-menu-item>
<el-menu-item index="1-4">
  <span>数据内容4</span>
</el-menu-item>
<el-menu-item index="1-5">
  <span>数据内容5</span>
</el-menu-item>
<el-menu-item index="1-6">
  <span>数据内容6</span>
</el-menu-item>
<el-menu-item index="1-7">
  <span>数据内容7</span>
</el-menu-item>
</el-submenu>
</el-menu>
</el-aside> -->
      <!-- 右侧表格 -->
      <el-main>
        <el-table height="100%" :data="tableData" :row-class-name="tableRowClassName">
          <el-table-column min-width="10" prop="index" label="序号"></el-table-column>
          <el-table-column min-width="10" prop="source" label="数据来源"></el-table-column>
          <el-table-column min-width="10" prop="author" label="数据作者"></el-table-column>
          <el-table-column min-width="25" prop="name" label="文件名称"></el-table-column>
          <el-table-column min-width="25" prop="id" label="数据ID"></el-table-column>
          <el-table-column min-width="20" prop="uploadTime" label="上传时间"></el-table-column>
          <el-table-column min-width="20" prop="recentlyTime" label="最近更新时间"></el-table-column>
        </el-table>
      </el-main>
    </el-container>
  </el-container>
</template>

<style lang="scss" scoped>
.preview-container {
  width: 100%;
  height: 100%;
  .el-header {
    height: 40px !important;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(191, 215, 255, 0.38);
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    font-variation-settings: "opsz" auto;
    text-align: center;
    line-height: 40px;
    background: rgba(255, 255, 255, 0.04);
    margin-bottom: 10px;
  }
  .preview-widget {
    width: 100%;
    height: calc(100% - 50px);
    .el-aside {
      width: 18% !important;
      height: 100%;
      background: rgba(94, 116, 153, 0.14);
      box-sizing: border-box;
      border: 1px dashed rgba(255, 255, 255, 0.09);
      padding: 10px;
      .title {
        color: #ffffff;
        background: rgba(94, 116, 153, 0.5);
        width: calc(100% - 20px);
        height: 32px;
        line-height: 32px;
        i {
          padding: 10px;
        }
      }
      :deep(.el-menu) {
        width: calc(100% - 20px);
        background: transparent;
        border: 0;
        .el-submenu {
          background: transparent;
          width: 100%;
          font-size: 14px;
          font-weight: 400;
          .el-submenu__title {
            background: transparent;
            padding-left: 0px;
            height: 40px;
            line-height: 40px;
            span {
              font-weight: 500;
              color: #ffffff;
              margin-left: 20px;
            }
            .el-submenu__icon-arrow {
              font-size: 18px;
              color: #ffffff;
              right: 90%;
            }
          }
          .el-menu {
            background: transparent;
            width: 100%;
            .el-menu-item {
              color: #d3e1ff;
              height: 30px;
              line-height: 30px;
              width: 100% !important;
              min-width: 0;
            }
            .el-menu-item:hover {
              background: linear-gradient(90deg,
                  rgba(191, 215, 255, 0.2) 0%,
                  rgba(94, 116, 153, 0) 100%);
            }
            .el-menu-item.is-active {
              background: linear-gradient(90deg,
                  rgba(191, 215, 255, 0.2) 0%,
                  rgba(94, 116, 153, 0) 100%);
              box-sizing: border-box;
              border-left: 3px solid rgba(191, 215, 255, 0.7);
              box-shadow: 1px 0px 4px 0px rgba(191, 215, 255, 0.7) inset;

              span {
                font-weight: 700;
                color: #ffffff;
              }
            }
          }
        }
      }
    }
    .el-main {
      height: 100%;
      width: 82%;
      padding: 0 20px;
      position: relative;
      :deep(.el-table) {
        width: 100%;
        height: 100%;
        background: transparent;
        .el-table__header-wrapper {
          height: 27px;
          .el-table__header {
            background: transparent;
            tr {
              background: transparent;
              th {
                background: transparent;
                border: 0px;
                color: #ffffff;
                text-align: center;
                padding: 5px 0;
                .cell {
                  font-weight: 700;
                  font-size: 12px;
                }
              }
            }
          }
        }
        .el-table__body-wrapper {
          height: calc(100% - 27px) !important;
          .el-table__body {
            background: transparent;
            tr {
              background: transparent;
              td {
                background: transparent;
                border: 0px;
                color: #ffffff;
                text-align: center;
                padding: 5px 0;
                .cell {
                  font-weight: 500;
                  font-size: 12px;
                }
              }
            }
            .row-even {
              background: rgba(94, 116, 153, 0.16) !important;
            }
          }
        }
      }
      :deep(.el-table)::before {
        display: none;
      }
    }
  }
}
</style>

<script>
export default {
  data() {
    return {
      // tableIndex: {
      //   index:"序号",
      //   source:"数据来源",
      //   author:"数据作者",
      //   name:"文件名称",
      //   id:"数据ID",
      //   uploadTime:"上传时间",
      //   recentlyTime:"序号",
      // },

      tableData: [
        {
          index: "01",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "02",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "03",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "04",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "05",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "06",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "07",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "08",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "09",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "10",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "11",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "12",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "13",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "14",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
        {
          index: "15",
          source: "xxxxxx",
          author: "xxx",
          name: "xxxxxx-01xxx-2022-11-xxxx",
          id: "A-xxxx-00100 DOL",
          uploadTime: "1998年12月29日",
          recentlyTime: "2024年02月11日",
        },
      ],
    };
  },
  methods: {
    tableRowClassName({ rowIndex }) {
      // Alternating row colors based on index
      return rowIndex % 2 === 0 ? "row-even" : "row-odd";
    },
  },
};
</script>

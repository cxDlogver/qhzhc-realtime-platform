<template>
  <div class="resource-container">
    <!-- 搜索区 -->
    <div class="search-widget resource-widget">
      <!-- 数据类型选择 -->
      <div class="datatype-select search-input">
        <span>数据类型：</span>
        <el-select v-model="data.datatype" clearable placeholder="请选择数据类型" :popper-append-to-body="false">
          <el-option v-for="item in datatypeList" :key="item.value" :label="item.label" :value="item.value">
          </el-option>
        </el-select>
      </div>
      <!-- 用户输入框 -->
      <div class="user-input search-input">
        <span>上传用户：</span>
        <el-input v-model="data.username" clearable placeholder="请输入上传用户"></el-input>
      </div>
      <!-- 上传时间选择 -->
      <div class="upload-input search-input">
        <span>上传时间：</span>
        <el-input @change="checkTime" v-model="data.uploadtime" clearable placeholder="yy-mm-dd hh:mm:ss"></el-input>
      </div>
      <!-- 审核状态选择 -->
      <div class="examine-radio search-input">
        <span>审核状态：</span>
        <!-- <el-radio v-model="data.is_examine" label="True">已审核</el-radio>
        <el-radio v-model="data.is_examine" label="False">未审核</el-radio> -->
        <el-select v-model="data.is_examine" clearable placeholder="请选择数据类型" :popper-append-to-body="false">
          <el-option label="已审核" value="True"></el-option>
          <el-option label="未审核" value="False"></el-option>
        </el-select>
      </div>
      <!-- 按钮组 -->
      <div class="button-group">
        <el-button type="primary" @click="searchResourceList"><i class="el-icon-search"></i>查询</el-button>
        <el-button @click="resetResourceList"><i class="el-icon-refresh"></i>重置</el-button>
      </div>
    </div>
    <!-- 表格区 -->
    <div class="table-widget resource-widget">
      <div class="action-bar">
        <el-button type="primary" @click="examineBatchResource"><i class="el-icon-circle-plus"></i>批量审核</el-button>
        <!-- <el-button type="danger" @click="deleteBatchResource"><i class="el-icon-remove"></i>批量删除</el-button> -->
      </div>
      <div class="table-bar" v-if="tableData">
        <el-table @selection-change="selectionChange" :data="tableData" :default-sort="{ prop: 'uploadtime' }"
          highlight-current-row :row-class-name="tableRowClassName">
          <!-- 自定义全选款表头 -->
          <el-table-column type="selection" min-width="5">
          </el-table-column>
          <el-table-column prop="uniqueid" label="资源ID"></el-table-column>
          <el-table-column prop="username" label="上传用户"></el-table-column>
          <el-table-column prop="datasource" label="数据来源"></el-table-column>
          <el-table-column prop="datatype" label="数据类型"></el-table-column>
          <el-table-column prop="uploadtime" label="上传时间"></el-table-column>
          <el-table-column prop="is_examine" label="审核状态">
            <template slot-scope="scope">
              <el-tag effect="plain" :type="scope.row.is_examine ? 'success' : 'danger'">{{
                isExamine(scope.row.is_examine) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作">
            <template slot-scope="scope">
              <el-button :disabled="scope.row.is_examine" size="small" type="primary"
                @click="toExamine(scope)">审核</el-button>
              <el-button size="small" type="success" @click="getDetail(scope.row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-if="tableData" @size-change="handleSizeChange" @current-change="handleCurrentChange"
          :page-sizes="[1, 5, 10]" :page-size="10" layout="total, sizes, prev, pager, next,jumper" :total="totalLength"
          background></el-pagination>
      </div>
    </div>
    <DataDetail v-if="dialogVisible" :dialogVisible="dialogVisible" :meunData="meunData" :dialogChanged="dialogChanged">
    </DataDetail>
  </div>
</template>

<script>
import DataDetail from './components/dataDetail.vue';
import {
  dataTop, fileApproved, reviewList,
  datasetview//文件详情
} from '../../api/home';

export default {
  components: { DataDetail },
  data() {
    return {
      datatypeList: [],
      tableData: [], // 表格数据-当页的条数
      totalLength: 0, // 总条数
      // token: sessionStorage.getItem('token') == null ? "" : localStorage.getItem("token"),
      // 调用接口使用的参数类型
      data: {
        datatype: '', // 数据类型
        username: '', // 上传用户
        is_examine: '', // 是否审核
        uploadtime: '', // 上传时间
        data_size: 10, // 当前页显示条数
        page_number: 1, // 当前页码
      },
      dialogVisible: false,
      meunData: [],
    }
  },
  created() {
    this.getDatatypeList();
    this.getTableDataList();
  },
  methods: {
    // 获取数据类型列表
    getDatatypeList() {
      dataTop().then(res => {
        const data_center = res.data.data_center;
        const keys = Object.keys(data_center);
        keys.forEach(key => {
          data_center[key].forEach(item => {
            this.datatypeList.push({ label: item[0], value: item[1] })
          })
        })
      })
    },
    // 获取数据列表
    getTableDataList() {
      let params = {}
      const keys = Object.keys(this.data);
      keys.forEach(key => {
        if (this.data[key] != '') {
          params[key] = this.data[key];
        }
      })
      //console.log(params);
      reviewList(params).then(res => {
        this.tableData = res.data.record;
        // console.log(res.data);
        this.totalLength = res.data.data_total;
      })
    },
    /** 筛选框 **/
    // 时间格式检查
    checkTime(value) {
      // console.log(value);
      const second = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/;
      const minute = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/;
      const hour = /^\d{4}-\d{2}-\d{2}\s\d{2}$/;
      const day = /^\d{4}-\d{2}-\d{2}$/;
      const month = /^\d{4}-\d{2}$/;
      const year = /^\d{4}$/;
      let uploadtime = "";
      for (const char of value) {
        uploadtime += char;
        if (uploadtime.match(second)) {
          this.data.uploadtime = uploadtime;
        } else if (uploadtime.match(minute)) {
          this.data.uploadtime = uploadtime;
        } else if (uploadtime.match(hour)) {
          this.data.uploadtime = uploadtime;
        } else if (uploadtime.match(day)) {
          this.data.uploadtime = uploadtime;
        } else if (uploadtime.match(month)) {
          this.data.uploadtime = uploadtime;
        } else if (uploadtime.match(year)) {
          this.data.uploadtime = uploadtime;
        }
      }
      // console.log(this.data.uploadtime);
    },
    // 搜索按钮
    searchResourceList() {
      this.getTableDataList();
    },
    // 重置按钮
    resetResourceList() {
      this.data = {
        datatype: '', // 数据类型
        username: '', // 上传用户
        is_examine: 'True', // 是否审核
        uploadtime: '', // 上传时间
        data_size: 10, // 当前页显示条数
        page_number: 1, // 当前页码
        selected: [], // 选中的行数据
      }
      this.getTableDataList();
    },
    // 审核按钮
    toExamine(scope) {
      // console.log(scope.row);
      fileApproved({ "uniqueid": scope.row.uniqueid }, this.token).then(res => {
        this.$message.success(res.data.message);
        this.getTableDataList();
      })
    },
    //详情
    getDetail(row) {
      datasetview({ uniqueid: row.uniqueid }).then(res => {
        this.meunData = res.data.result;
        this.dialogVisible = true;
      })
    },
    dialogChanged(visible) {
      this.dialogVisible = visible;

    },
    /** 表格窗口方法 **/
    // 表格选中
    selectionChange(val) {
      this.selected = val;
    },
    // 审核状态
    isExamine(value) {
      if (value == true) {
        return '已审核';
      } else {
        return '未审核';
      }
    },
    // 批量审核
    examineBatchResource() {
      let uniqueidList = "";
      this.selected.map(resource => resource.uniqueid).forEach(item => {
        uniqueidList += item + ',';
      })
      this.$confirm('此操作将匹配选中审核的用户, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        // 批量审核
        fileApproved({
          uniqueid: uniqueidList
        }, this.token).then(() => {
          this.$message({
            type: 'success',
            message: '审核成功!'
          });
          this.getTableDataList();
        }).catch(() => {
          this.$message({
            type: 'error',
            message: '审核失败!'
          });
        });
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '已取消审核'
        });
      });
    },
    // 批量删除
    // deleteBatchResource(){
    //   console.log('批量删除');
    // },
    /** 分页条 **/
    //  分页条数改变
    handleSizeChange(val) {
      // console.log(`每页 ${val} 条`);
      this.data.data_size = val;
      this.getTableDataList();
    },
    //  页码改变
    handleCurrentChange(val) {
      // console.log(`当前页: ${val}`);
      this.data.page_number = val;
      this.getTableDataList();
    },
    tableRowClassName({ rowIndex }) {
      // Alternating row colors based on index
      return rowIndex % 2 === 0 ? 'row-even' : 'row-odd';
    },
  }
}
</script>

<style lang="scss" scoped>
.resource-container {
  width: 100%;
  height: 100%;
  .resource-widget {
    border: 1px solid rgba(211, 225, 255, 0.3);
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.15);
    width: 100%;
  }
  // 搜索区
  .search-widget {
    height: 100px;
    width: 100%;
    margin-bottom: 20px;
    box-sizing: border-box;
    padding: 0 20px;
    display: flex;
    align-items: center;
    font-size: 16px;
    font-weight: 400px;
    display: flex;
    // justify-content: space-evenly;
    span {
      margin: 0 10px;
    }
    // 输入框样式
    .search-input {
      :deep(.el-input) {
        width: 200px;
        .el-input__inner {
          background-color: transparent;
          border: 1px solid rgba(211, 225, 255, 0.3);
        }
      }
    }
    // 数据类型选择
    .datatype-select {
      :deep(.el-select) {
        .el-select-dropdown {
          background-color: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          .el-scrollbar {
            background: linear-gradient(180deg, rgba(38, 56, 90, 0.7) 0%, rgba(0, 0, 0, 0.7) 100%) !important;
            box-sizing: border-box;
            .el-select-dropdown__item {
              color: #FFF;
            }
            .el-select-dropdown__item.hover {
              background: linear-gradient(90deg, rgba(0, 149, 255, 0.4) 0%, rgba(94, 116, 153, 0) 100%);
            }
            .el-select-dropdown__item.selected {
              background: linear-gradient(90deg, rgba(0, 149, 255, 0.4) 0%, rgba(94, 116, 153, 0) 100%);
              box-sizing: border-box;
              border-left: 3px solid #0095FF;
              box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
            }
          }
        }
      }
    }
    // 上传时间选择
    .upload-time {
      .date-select {
        :deep(.el-input) {
          width: 40px;
        }
      }
    }

    .button-group {
      margin-left: 50px;
    }
  }
  // 表格区
  .table-widget {
    height: calc(100% - 100px - 20px);
    width: 100%;
    box-sizing: border-box;
    padding: 0 20px;
    .action-bar {
      height: 70px;
      line-height: 70px;
    }
    .table-bar {
      height: calc(100% - 70px);
      :deep(.el-pagination) {
        height: 30px;
        padding: 25px 20px;
        span {
          font-size: 14px;
          color: #FFF;
        }
      }
      :deep(.el-table::before) {
        height: 0;
      }
      :deep(.el-table) {
        height: calc(100% - 80px);
        overflow: auto;
        background-color: transparent;
        // .el-table__body-wrapper {
        //   border-bottom: 1px solid rgba(211, 225, 255, 0.7);
        // }
        tr {
          background: transparent;
          height: 60px;
          th {
            text-align: center;
            background: transparent;
            font-weight: 700;
            font-size: 16px;
            color: #FFFFFF;
            border: 0px;
          }
          td {
            text-align: center;
            background: transparent;
            font-weight: 400;
            font-size: 14px;
            color: #FFFFFF;
            border: 1px solid transparent;
            .el-tag {
              background: transparent;
            }
          }
        }
        .row-even {
          background: rgba(94, 116, 153, 0.16);
        }
        .current-row {
          background: linear-gradient(90deg, rgba(0, 149, 255, 0.2) 0%, rgba(94, 116, 153, 0) 100%);
          box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
        }
        .el-table__row:hover {
          background: linear-gradient(90deg, rgba(0, 149, 255, 0.2) 0%, rgba(94, 116, 153, 0) 100%);
        }
      }
    }
  }
}
</style>
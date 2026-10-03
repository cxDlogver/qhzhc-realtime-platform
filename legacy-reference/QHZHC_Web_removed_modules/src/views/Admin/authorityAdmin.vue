<template>
  <div class="user-container">
    <!-- 搜索区 -->
    <div class="search-widget user-widget">
      <div class="search-info">
        <span>用户名:</span>
        <el-input type="text" v-model="searchInfo" placeholder="输入任意字段查询"></el-input>
      </div>
      <div class="button-group">
        <el-button type="primary" @click="searchUserList"><i class="el-icon-search"></i>查询</el-button>
        <el-button @click="resetUserList"><i class="el-icon-refresh"></i>重置</el-button>
      </div>
    </div>
    <!-- 表格区 -->
    <div class="table-widget user-widget">
      <div class="action-bar">
        <el-button type="primary" @click="changeBatchAuthority(true)"><i
            class="el-icon-circle-plus"></i>批量权限开启</el-button>
        <el-button type="danger" @click="changeBatchAuthority(false)"><i
            class="el-icon-circle-close"></i>批量权限关闭</el-button>
        <el-button type="warning" @click="resetBatchPassword"><i class="el-icon-remove"></i>批量密码重置</el-button>
      </div>
      <div class="table-bar" v-if="tableData">
        <el-table :data="tableData" highlight-current-row :row-class-name="tableRowClassName"
          @selection-change="selectionChange" :default-sort="{ prop: 'username' }">
          <!-- 自定义全选款表头 -->
          <el-table-column type="selection" min-width="5">
          </el-table-column>
          <el-table-column min-width="10" prop="username" label="用户名"></el-table-column>
          <el-table-column min-width="25" prop="can_download_files" label="数据下载权限">
            <template slot-scope="scope">
              <el-button size="small" type="primary" @click="changeAuthority(scope)">切换</el-button>
              <el-tag effect="plain" :type="scope.row.can_download_files ? 'success' : 'danger'">{{
                isOpenAuthority(scope.row.can_download_files) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column min-width="25" prop="can_upload_files" label="数据上传权限">
            <template slot-scope="scope">
              <el-button size="small" type="primary" @click="changeAuthority(scope)">切换</el-button>
              <el-tag effect="plain" :type="scope.row.can_upload_files ? 'success' : 'danger'">{{
                isOpenAuthority(scope.row.can_upload_files) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column min-width="25" prop="can_visit_realtime" label="实时查询权限">
            <template slot-scope="scope">
              <el-button size="small" type="primary" @click="changeAuthority(scope)">切换</el-button>
              <el-tag effect="plain" :type="scope.row.can_visit_realtime ? 'success' : 'danger'">{{
                isOpenAuthority(scope.row.can_visit_realtime) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column min-width="25" prop="can_visit_history" label="历史查询权限">
            <template slot-scope="scope">
              <el-button size="small" type="primary" @click="changeAuthority(scope)">切换</el-button>
              <el-tag effect="plain" :type="scope.row.can_visit_history ? 'success' : 'danger'">{{
                isOpenAuthority(scope.row.can_visit_history) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column min-width="25" prop="is_active" label="状态">
            <template slot-scope="scope">
              <el-button size="small" type="primary" @click="changeAuthority(scope)">切换</el-button>
              <el-tag effect="plain" :type="scope.row.is_active ? 'success' : 'danger'">{{ isActive(scope.row.is_active)
                }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column min-width="25" label="密码操作">
            <template slot-scope="scope">
              <el-button size="small" type="primary" @click="openUserInfoEditDialog(scope)">修改</el-button>
              <el-button size="small" type="danger" @click="resetPassword(scope)">重置</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-if="tableData" @size-change="handleSizeChange" @current-change="handleCurrentChange"
          :page-sizes="[10, 20, 30, totalData.length]" :page-size="10" layout="total, sizes, prev, pager, next, jumper"
          :total="totalData.length" background></el-pagination>
      </div>
    </div>
    <UserInfoEdit :dialogVisible="userEditVisible" :closeUserInfoEditDialog="closeUserInfoEditDialog"
      :userInfo="currentUser" :operation="operation"></UserInfoEdit>
  </div>
</template>

<script>
import { userAuthorityEdit, userList, userPasswordEdit, userSearch } from '../../api/home';
import UserInfoEdit from '../userInfoEdit.vue';
export default {
  components: { UserInfoEdit },
  data() {
    return {
      searchInfo: "", //搜索字段
      totalData: null, //所有用户信息
      tableData: null, //表格用户信息，
      admin: null, //管理员用户
      selected_user: [], //多选框目前选中的用户
      userEditVisible: false, //用户信息编辑弹窗
      currentUser: null, //当前修改的用户
      currentIndex: -1, //当前操作的行
      operation: 0, //1表示用户信息修改，2表示添加新用户
      pageSize: 10, //每页行数
      pageIndex: 0, //当前页数
    }
  },
  created() {
    this.admin = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
    this.getUserList();
  },
  methods: {
    /** 表格操作 */
    isActive(cellValue) {
      return cellValue ? "活跃中" : "禁用中";
    },
    isOpenAuthority(cellValue) {
      return cellValue ? "已开启" : "已关闭";
    },
    tableRowClassName({ rowIndex }) {
      // Alternating row colors based on index
      return rowIndex % 2 === 0 ? 'row-even' : 'row-odd';
    },
    // 全选框
    selectionChange(selection) {
      this.selected_user = selection;
    },
    /** 修改权限 */
    changeAuthority(scope) {
      scope.row[scope.column.property] = !scope.row[scope.column.property];
      userAuthorityEdit(scope.row, this.admin.token)
        .then(() => {
          this.$message.success("权限修改成功");
          this.getUserList();
        }).catch(() => {
          this.$message.error("权限修改失败");
          this.getUserList();
        })
    },
    /** 分页操作 */
    handleSizeChange(size) { //大小变化
      // console.log(size)
      this.pageSize = size;
      this.tableData = this.totalData.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
    },
    handleCurrentChange(page) { //当前页变化
      // console.log(page)
      this.pageIndex = page - 1;
      this.tableData = this.totalData.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
    },
    /** 用户列表获取 */
    getUserList() {
      if (this.admin) {
        userList(this.admin.token).then(res => {
          this.totalData = res.data.reverse();
          this.tableData = this.totalData.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
        })
      }
    },
    /** 重置密码 */
    resetPassword(scope) {
      userPasswordEdit({ username: scope.row.username, new_password: "@abc123456" }, this.admin.token).then(() => {
        this.$message.success("密码重置成功");
      }).catch(() => {
        this.$message.error("密码重置失败");
      })
    },
    /** 用户密码更改 */
    openUserInfoEditDialog(scope) { //弹出密码修改框
      this.currentUser = scope.row;
      this.currentIndex = scope.$index;
      this.operation = 3;
      this.userEditVisible = true;
    },
    closeUserInfoEditDialog(newValue = null) { //关闭密码修改框
      this.userEditVisible = false;
      this.currentUser = null;
      this.currentIndex = -1;
      // 更新用户密码
      if (newValue) {
        // console.log(newValue);
        userPasswordEdit(newValue, this.admin.token).then(() => {
          this.$message.success("用户密码更改成功");
          this.getUserList();
        }).catch((error) => {
          this.$message.error(error.response.data.error);
        })
      }
    },
    /** 用户密码批量重置 */
    resetBatchPassword() {
      this.$confirm('此操作将重置选中的用户密码, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        // 确认重置
        // 收集所有重置请求的 Promise
        const resetPromises = this.selected_user.map(user =>
          userPasswordEdit({ username: user.username, new_password: "@abc123456" }, this.admin.token)
        );
        // 使用 Promise.all 等待所有请求完成
        Promise.all(resetPromises)
          .then(() => {
            this.$message({
              type: 'success',
              message: '重置成功!'
            });
            setTimeout(() => {
              this.$router.go(0);
            }, 500);
          })
          .catch(() => {
            this.$message({
              type: 'error',
              message: '重置失败!'
            });
          });
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '已取消重置'
        });
      });
    },
    /** 用户权限批量修改 */
    changeBatchAuthority(params) {
      this.$confirm(`此操作将${params ? '开启' : '关闭'}选中的用户所有权限, 是否继续?`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        // 确认切换
        // 收集所有请求的 Promise
        const openPromises = this.selected_user.map(user => {
          if (user.username != this.admin.username) {
            user.can_upload_files = params;
            user.can_download_files = params;
            user.can_visit_realtime = params;
            user.can_visit_history = params;
            user.is_active = params;
            userAuthorityEdit(user, this.admin.token)
          }
        }
        );
        // 使用 Promise.all 等待所有请求完成
        Promise.all(openPromises)
          .then(() => {
            this.$message({
              type: 'success',
              message: '修改成功!'
            });
            // setTimeout(()=>{
            //   this.$router.go(0);
            // },500);
          })
          .catch(() => {
            this.$message({
              type: 'error',
              message: '修改失败!'
            });
          });
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '已取消修改'
        });
      });
    },
    /** 搜索用户列表 */
    searchUserList() {
      userSearch({ username: "1", q: this.searchInfo }, this.admin.token).then(res => {
        // console.log(res);
        this.totalData = res.data.reverse();
        this.tableData = this.totalData.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);

      }).catch(() => {
        this.tableData = null;
      })
    },
    /** 重置用户列表 */
    resetUserList() {
      this.searchInfo = "";
      this.getUserList();
    }
  },
}
</script>

<style lang=scss scoped>
.user-container {
  width: 100%;
  height: 100%;
  .user-widget {
    border: 1px solid rgba(211, 225, 255, 0.3);
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.15);
    width: 100%;
  }
  .search-widget {
    height: 100px;
    width: 100%;
    margin-bottom: 20px;
    box-sizing: border-box;
    padding: 0 20px;
    display: flex;
    align-items: center;
    font-weight: 400;
    font-size: 20px;
    .search-info {
      span {
        margin-right: 20px;
        font-size: 16px;
      }
      :deep(.el-input) {
        width: 200px;
        .el-input__inner {
          background-color: transparent;
          border: 1px solid rgba(211, 225, 255, 0.3);
        }
      }
    }
    .button-group {
      margin-left: 50px;
    }
  }
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
              margin-left: 10px;
              font-size: 14px;
            }
            .el-button {
              font-size: 14px;
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

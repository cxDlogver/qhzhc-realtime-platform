<template>
  <div class="user-container">
    <!-- 搜索区 -->
    <div class="search-widget user-widget">
      <div class="search-info">
        <el-select :popper-append-to-body="false" v-model="selectValue" placeholder="字段搜索" @change="changeSelectValue">
          <el-option v-for="item in options" :key="item.value" :label="item.label" :value="item.value">
          </el-option>
        </el-select>
        <span>:</span>
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
        <el-button type="primary" @click="openUserRegisterDialog"><i class="el-icon-circle-plus"></i>新增用户</el-button>
        <el-button type="danger" @click="deleteBatchUser"><i class="el-icon-remove"></i>批量删除</el-button>
      </div>
      <div class="table-bar" v-if="tableData">
        <el-table :data="tableData" highlight-current-row :row-class-name="tableRowClassName"
          @selection-change="selectionChange" :default-sort="{ prop: 'username' }">
          <!-- 自定义全选款表头 -->
          <el-table-column type="selection" min-width="5">
          </el-table-column>
          <el-table-column min-width="10" prop="username" label="用户名"></el-table-column>
          <el-table-column min-width="10" prop="first_name" label="姓名"></el-table-column>
          <el-table-column min-width="20" prop="email" label="邮箱"></el-table-column>
          <el-table-column min-width="25" prop="phone_number" label="手机号"></el-table-column>
          <el-table-column min-width="25" prop="workplace" label="工作单位"></el-table-column>
          <el-table-column min-width="20" prop="uploadTime" label="最近登录时间"></el-table-column>
          <el-table-column min-width="10" prop="is_active" label="状态">
            <template slot-scope="scope">
              <el-tag effect="plain" :type="scope.row.is_active ? 'success' : 'danger'">{{ isActive(scope.row.is_active)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column min-width="20" label="操作">
            <template slot-scope="scope">
              <el-button size="small" type="primary" @click="openUserEditDialog(scope)">修改</el-button>
              <el-button size="small" type="danger" @click="deleteUser(scope)">删除</el-button>
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
import { userDelete, userEdit, userList, userRegister, userSearch } from '../../api/home';
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
      options: [{ value: "username", label: "用户名" }, { value: "email", label: "邮箱" }, { value: "phone_number", label: "手机号" }, { value: "first_name", label: "姓名" }], //选择器选项
      selectValue: "", //选中的value
      params: {}
    }
  },
  created() {
    this.admin = localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null;
    this.getUserList();
  },
  methods: {
    isActive(cellValue) {
      return cellValue ? "活跃" : "禁用";
    },
    tableRowClassName({ rowIndex }) {
      // Alternating row colors based on index
      return rowIndex % 2 === 0 ? 'row-even' : 'row-odd';
    },
    // 全选框
    selectionChange(selection) {
      this.selected_user = selection;
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
    /** 关闭弹窗 */
    closeUserInfoEditDialog(newValue = null) {
      if (this.operation == 2) {
        this.closeUserRegisterDialog(newValue)
      }
      else {
        this.closeUserEditDialog(newValue)
      }
    },
    /** 用户信息修改 */
    openUserEditDialog(scope) { //弹出用户编辑框
      this.currentUser = scope.row;
      this.currentIndex = scope.$index;
      this.operation = 1;
      this.userEditVisible = true;
    },
    closeUserEditDialog(newValue = null) { //关闭用户编辑框
      this.userEditVisible = false;
      this.currentUser = null;
      this.currentIndex = -1;
      // 更新用户信息
      if (newValue) {
        userEdit(newValue, this.admin.token).then(() => {
          this.$message.success("用户信息修改成功");
          this.getUserList();
        }).catch(() => {
          this.$message.error("用户信息修改失败");
        })
      }
    },
    /** 添加新用户 */
    openUserRegisterDialog() { //弹出用户注册框
      this.operation = 2;
      this.userEditVisible = true;
      this.currentUser = null;
      this.currentIndex = -1;
    },
    closeUserRegisterDialog(newValue = null) { //关闭用户注册框
      this.userEditVisible = false;
      this.operation = -1;
      // 更新用户信息
      if (newValue) {
        userRegister(newValue).then(() => {
          this.$message.success("用户注册成功");
          this.getUserList();
        }).catch(() => {
          this.$message.error("用户注册失败");
        })
      }
    },
    /** 用户删除 */
    deleteUser(scope) {
      this.$confirm('此操作将永久删除该用户, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        // 确认删除
        userDelete({ username: scope.row.username }, this.admin.token)
          .then(() => {
            this.getUserList();
            this.$message({
              type: 'success',
              message: '删除成功!'
            });
          })
          .catch(() => {
            this.$message({
              type: 'danger',
              message: '删除失败!'
            });
          })
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '已取消删除'
        });
      });
    },
    /** 用户批量删除 */
    deleteBatchUser() {
      this.$confirm('此操作将永久删除选中的用户, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        // 确认删除
        // 收集所有删除请求的 Promise
        const deletePromises = this.selected_user.map(user =>
          userDelete({ username: user.username }, this.admin.token)
        );
        // 使用 Promise.all 等待所有删除请求完成
        Promise.all(deletePromises)
          .then(() => {
            // 所有删除请求完成后刷新数据
            this.$message({
              type: 'success',
              message: '删除成功!'
            });
            setTimeout(() => {
              this.$router.go(0);
            }, 500);
          })
          .catch(error => {
            console.error('删除失败:', error);
            this.$message({
              type: 'error',
              message: '删除失败!'
            });
          });
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '已取消删除'
        });
      });
    },
    /** 搜索用户列表 */
    searchUserList() {
      this.params.q = this.searchInfo;
      // console.log(this.params)
      userSearch(this.params, this.admin.token).then(res => {
        // console.log(res);
        this.totalData = res.data.reverse();
        this.tableData = this.totalData.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);

      }).catch((e) => {
        console.log(e.response)
        this.tableData = null;
      })
    },
    changeSelectValue(selectValue) {
      this.params = {};
      const fields = ["username", "email", "phone_number", "first_name"];
      if (fields.includes(selectValue)) {
        this.$set(this.params, selectValue, "1");
      }
    },
    /** 重置用户列表 */
    resetUserList() {
      this.searchInfo = "";
      this.selectValue = "";
      this.params = {};
      this.getUserList();
    }
  },
}
</script>

<style lang="scss" scoped>
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
      :deep(.el-select) {
        .el-input {
          width: 120px;
        }
        .el-select-dropdown {
          background: transparent;
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
      span {
        margin: 0 10px;
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

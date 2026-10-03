<template>
  <el-dialog :visible.sync="dialogTableVisible" :fullscreen="fullScreen" top="100px">
    <!-- 标题的具名插槽 -->
    <template slot="title">
      <div class="header">
        <span v-if="operation == 1">用户信息</span>
        <span v-if="operation == 2">用户注册</span>
        <span v-if="operation == 3 || operation == 4">密码更改</span>
        <div class="icon-widget">
          <i v-if="!fullScreen" class="iconfont icon-quanping" @click="toFullScreen"></i>
          <i v-if="fullScreen" class="el-icon-arrow-down" @click="toFullScreen"></i>
          <i class="iconfont icon-bg-close" @click="toCloseScreen"></i>
        </div>
      </div>
    </template>
    <!-- dialog主体 -->
    <UserInfoForm ref="userInfoForm" :userInfo="user" :operation="operation"></UserInfoForm>
    <!-- 底部具名插槽 -->
    <template slot="footer">
      <div class="footer-widget">
        <el-button class="footer-button" type="primary" @click="toUpdateUser">
          <i class="iconfont icon-queding"></i>
          <span>确 定</span>
        </el-button>
        <el-button class="footer-button" @click="toCloseScreen">
          <i class="iconfont icon-guanbi1"></i>
          <span>取 消</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
:deep(.el-dialog) {
  background: #1f2935;
  box-sizing: border-box;
  border: 1px solid rgba(211, 225, 255, 0.33);
  font-weight: 400;
  font-size: 14px;
  width: 40%;
  .el-dialog__header {
    height: 40px;
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 25px;
      color: #ffffff;
      .icon-widget {
        i {
          font-size: 30px;
          color: rgba(255, 255, 255, 0.3);
          padding: 0 10px;
          cursor: pointer;
        }
      }
    }
    .el-dialog__headerbtn {
      display: none;
    }
  }
  .el-dialog__body {
    padding: 0 20px;
    .user-info-form {
      .el-form-item__label {
        color: #ffffff;
      }
      .el-input__inner {
        background: transparent;
      }
    }
  }
  .el-dialog__footer {
    height: 60px;
    .footer-button {
      border-radius: 6px;
      width: 107px;
      height: 40px;
      font-size: 14px;
      i {
        margin-right: 5px;
        vertical-align: middle;
      }
    }
  }
}
:deep(.el-dialog.is-fullscreen) {
  height: 100% !important;
  width: 100% !important;
  margin: 0px;
  padding: 0px;
}
</style>

<script>
import UserInfoForm from "./userInfoForm.vue";

export default {
  components: { UserInfoForm },
  props: {
    dialogVisible: {
      type: Boolean,
      default: false,
    },
    closeUserInfoEditDialog: {
      type: Function,
      default: null,
    },
    // 修改的用户信息
    userInfo: {
      type: Object,
      default: () => { },
    },
    // 进行的用户操作
    operation: {
      type: Number,
      default: -1,
    },
  },
  data() {
    return {
      fullScreen: false,
      user: { ...this.userInfo }, //user用于临时修改
    };
  },
  computed: {
    dialogTableVisible: {
      get() {
        return this.dialogVisible;
      },
      set() {
        this.closeUserInfoEditDialog();
      },
    },
  },
  watch: {
    userInfo(newValue) {
      this.user = { ...newValue };
    },
  },
  methods: {
    // 全屏弹窗
    toFullScreen() {
      this.fullScreen = !this.fullScreen;
    },
    // 关闭弹窗但不修改数据
    toCloseScreen() {
      this.user = { ...this.userInfo }; //表格恢复原数据
      this.closeUserInfoEditDialog();
    },
    // 关闭弹窗并返回最新数据
    async toUpdateUser() {
      if (this.operation != 1) {
        const valid = await this.$refs.userInfoForm.verification();
        if (valid) {
          this.closeUserInfoEditDialog(this.user);
          this.user = { ...this.userInfo }; //表格恢复原数据
        }
      } else {
        this.closeUserInfoEditDialog(this.user);
        this.user = { ...this.userInfo }; //表格恢复原数据
      }
    },
  },
};
</script>

<template>
  <el-container class="admin-container">
    <!-- 左侧导航栏 -->
    <el-aside width="300px">
      <el-menu
        class="admin-navigation"
        text-color="#FFFFFF"
        active-text-color="#FFFFFF"
        :default-active="activeMenu"
        router
      >
        <div class="header">
          <div class="subtitle">
            <img :src="require('@/assets/imgs/logo.png')" alt="" class="icon" />
            <span class="text"> 温室气体监测和计量平台</span>
          </div>
          <!-- <el-menu-item index="/admin" class="title">后台管理系统</el-menu-item> -->
        </div>
        <div class="menu">
          <el-menu-item index="/admin/user" class="item"
            ><i class="el-icon-user-solid"></i>用户信息管理</el-menu-item
          >
          <el-menu-item index="/admin/authority" class="item"
            ><i class="el-icon-lock"></i>用户权限管理</el-menu-item
          >
          <el-menu-item index="/admin/resource" class="item"
            ><i class="el-icon-s-order"></i>数据资源管理</el-menu-item
          >
          <el-menu-item index="/admin/news" class="item"
            ><i class="iconfont icon-zixun" style="margin-right: 8px"></i
            >资讯管理中心</el-menu-item
          >
          <el-menu-item index="/admin/imgs" class="item"
            ><i class="iconfont icon-zixun" style="margin-right: 8px"></i
            >图片管理</el-menu-item
          >
        </div>
      </el-menu>
    </el-aside>
    <!-- 右侧内容窗口 -->
    <el-container class="admin-main">
      <el-header class="admin-route">
        <el-breadcrumb separator-class="el-icon-arrow-right">
          <!-- <el-breadcrumb-item :to="routeJump('/admin')"
            >首页</el-breadcrumb-item
          >
          <el-breadcrumb-item v-if="activeMenu == '/admin/user'"
            >用户信息管理</el-breadcrumb-item
          > -->
          <el-breadcrumb-item v-if="activeMenu == '/admin/user'"
            >用户信息管理</el-breadcrumb-item
          >
          <el-breadcrumb-item v-if="activeMenu == '/admin/authority'">
            用户权限管理
          </el-breadcrumb-item>
          <el-breadcrumb-item v-if="activeMenu == '/admin/resource'"
            >数据资源管理</el-breadcrumb-item
          >
          <el-breadcrumb-item v-if="activeMenu == '/admin/news'"
            >资讯管理中心</el-breadcrumb-item
          >
          <el-breadcrumb-item v-if="activeMenu == '/admin/imgs'"
            >图片管理</el-breadcrumb-item
          >
        </el-breadcrumb>
        <el-button type="primary" class="back-btn" @click="comeBack"
          >返回</el-button
        >
      </el-header>
      <el-main class="admin-content">
        <router-view></router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script>
export default {
  computed: {
    activeMenu() {
      return this.$route.path;
    },
  },
  methods: {
    routeJump(path) {
      console.log(this.activeMenu, path, "跳转路由");
      if (this.activeMenu != path) {
        return path;
      }
    },
    //返回主系统
    comeBack() {
      this.$router.push({ path: "/" });
    },
  },
};
</script>

<style lang="scss" scoped>
.admin-container {
  width: 100vw;
  height: 100vh;
  padding: 0;
  margin: 0;
  background: #080e19;
  color: #fff;
  .admin-navigation {
    height: 100%;
    opacity: 1;
    background: linear-gradient(
      180deg,
      rgb(38, 56, 90, 0.7) 0%,
      rgba(0, 0, 0, 0.5) 100%
    );
    box-sizing: border-box;
    border-right: 1px solid rgb(211, 255, 255, 0.3);
    color: #ffffff;
    .header {
      height: 70px;
      width: 100%;
      font: 700 16px "Microsoft YaHei";
      font-variation-settings: "opsz" auto;
      text-align: center;
      margin-top: 20px;
      .subtitle {
        text-align: center;
        margin-bottom: 10px;
        .icon {
          width: 35px;
          vertical-align: bottom;
          margin-right: 5px;
        }
        .text {
          font-size: 20px;
        }
      }
      .title {
        font-size: 40px;
        background: transparent;
      }
    }
    .menu {
      height: calc(100% - 150px);
      .item {
        font-weight: 400;
        font-size: 18px;
        height: 80px;
        line-height: 80px;
        background: transparent;
      }
      .item.is-active {
        background: linear-gradient(
          90deg,
          rgba(0, 149, 255, 0.4) 0%,
          rgba(94, 116, 153, 0) 100%
        );
        box-shadow: 1px 0px 4px 0px rgba(0, 149, 255, 0.8) inset;
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
      box-sizing: border-box;
      border-left: 3px solid #0095ff;
    }
  }
  .admin-main {
    background: rgba(94, 116, 153, 0.14);
    .admin-route {
      opacity: 1;
      background: linear-gradient(
        90deg,
        rgb(38, 56, 90, 0.7) 0%,
        rgba(0, 0, 0, 0.5) 100%
      );
      box-sizing: border-box;
      border-bottom: 1px solid rgb(211, 255, 255, 0.3);
      position: relative;
      .el-breadcrumb {
        height: 60px;
        font-weight: 700;
        font-size: 20px;
        line-height: 60px;
        :deep(.el-breadcrumb__item .el-breadcrumb__inner) {
          color: #ffffff !important;
        }
      }
      .back-btn {
        position: absolute;
        right: 10px;
        top: 10px;
      }
    }
  }
}
</style>

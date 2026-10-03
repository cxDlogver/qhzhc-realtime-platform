<template>
  <div class="wrapper">
    <el-container style="height: 100vh">
      <el-header style="height: 65px">
        <div class="header-bg">
          <!-- pc端系统标题 -->
          <div class="header—left">
            <div class="yuming">CarbonScope</div>
            <div class="system-title">
              <p class="system-name">温室气体监测和计量平台</p>
              <p class="system-name1">GHG Monitoring & Metrology Platform</p>
            </div>
          </div>
          <div class="system-icon">
            <img :src="require('@/assets/imgs/logosystem.png')" alt="" />
          </div>
          <!-- 菜单路由 -->
          <div class="header—middle">
            <router-link
              v-for="(menu, key) in menuList"
              :key="key"
              class="menu-item"
              :to="menu.path"
            >
              <div v-if="!menu.hideMenu">
                <!-- <i :class="'iconfont ' + menu.icon" style="font-weight: 500"></i> -->
                <span slot="title"> {{ menu.title }}</span>
              </div>
            </router-link>
          </div>
          <!-- 小屏幕菜单图标 -->
          <div class="menu-icon">
            <el-dropdown trigger="click">
              <span class="el-dropdown-link">
                <i
                  class="iconfont icon-gengduobianji"
                  style="color: #ffffff"
                ></i
              ></span>
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item v-for="(menu, key) in menuList" :key="key">
                  <router-link class="menu-item" :to="menu.path">
                    <div class="menu-li">
                      <div v-if="!menu.hideMenu">
                        <span slot="title"> {{ menu.title }}</span>
                      </div>
                    </div>
                  </router-link>
                </el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
          </div>
          <!-- 右侧登录注册、用户头像 -->
          <div class="header-right">
            <!-- 时间 -->
            <!-- <div class="time-box">{{ date }}{{ time }}</div> -->
            <div class="href-box" v-if="!user.username">
              <div class="login" @click="login">登录/</div>
              <div class="login" @click="register">注册</div>
            </div>
            <div class="user-box" v-if="user.username">
              <span class="user-name">{{ user.username }}</span>
              <button
                v-if="role"
                class="simulator-admin-link"
                type="button"
                @click="goConfig"
              >
                模拟后台
              </button>
              <button class="logout-link" type="button" @click="logoutUser">
                退出登录
              </button>
            </div>
          </div>
        </div>
      </el-header>
      <!-- 页面左侧二级菜单栏，和主体内容区域部分 -->
      <el-main>
        <router-view></router-view>
      </el-main>
    </el-container>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import { userLogout } from "../api/auth";
import type { SessionProfile } from "../services/authSession";

function readProfile(key: string): SessionProfile | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as SessionProfile) : null;
  } catch (_error) {
    return null;
  }
}

export default Vue.extend({
  name: "WholePage",
  data() {
    const profile = readProfile("user");
    return {
      user: profile || ({ username: "", is_superuser: false } as SessionProfile),
      role: Boolean(profile?.is_superuser),
      menuList: [
        { path: "/index", title: "首页" },
        { path: "/dataVisualization", title: "数据可视化" },
      ],
    };
  },
  methods: {
    login(): void {
      void this.$router.push("/login");
    },
    register(): void {
      void this.$router.push("/register");
    },
    async logoutUser(): Promise<void> {
      try {
        await userLogout();
      } finally {
        localStorage.removeItem("user");
        await this.$router.push("/login");
        this.$message.success("退出成功");
      }
    },
    goConfig(): void {
      void this.$router.push("/admin/simulator");
    },
  },
});
</script>

<style lang="scss" scoped>
.simulator-admin-link,
.logout-link {
  margin-left: 12px;
  padding: 6px 10px;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 3px;
  background: rgba(18, 35, 54, 0.72);
  cursor: pointer;
}
.simulator-admin-link:hover,
.logout-link:hover {
  color: #ffad31;
  border-color: #ffad31;
}
/** 用户信息下拉框设置 */
.el-dropdown-menu {
  background: #122336;
  border-radius: 4px;
  opacity: 0.8;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0px 4px 10px 0px rgba(38, 102, 127, 0.3);
  padding: 8px;
  box-sizing: border-box;
  .el-dropdown-menu__item {
    font-size: 16px;
    color: #ffffff;
    background: rgba(94, 116, 153, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 4px;
    margin: 10px 0;
    // padding: 10px;
  }
  .el-dropdown-menu__item:hover {
    color: #ffad31;
  }
}
@media screen and (min-width: 1200px) {
  .header-bg {
    background: url("~@/assets/imgs/header.png") no-repeat;
    background-size: cover;
  }
  .header—left {
    color: #ffffff;
    position: absolute;
    left: 10px;
    top: 8px;
    height: 50px;
    bottom: 50%;
    float: left;
    .yuming {
      width: 150px;
      height: 50px;
      font-size: 22px;
      font-weight: bold;
      float: left;
      color: #ffad31;
      line-height: 50px;
    }
    .system-title {
      float: left;
    }
    .system-name {
      font-family: "Microsoft YaHei";
      font-size: 20px;
      font-weight: bold;
      line-height: 36px;
      span {
        -webkit-background-clip: text;
        background-clip: text;
        font-weight: bold;
      }
    }
    .system-name1 {
      font-family: "ARIAL";
      color: rgba(255, 255, 255, 0.702);
      font-size: 10px;
    }
  }
  .header—middle {
    position: absolute;
    left: 420px;
    top: 24px;
    right: 0;
    font-family: "Microsoft YaHei";
    display: flex;
    width: 320px;
    flex-direction: row;
    justify-content: space-between; //   align-items: center;
    .menu-item {
      // margin-right: 10px;
      font-size: 18px;
      padding-bottom: 12px;
      i {
        font-size: 20px;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        //   background: linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0) 100%);
      }
    }
  }
  .menu-icon {
    display: none;
  }
  .system-icon {
    display: none;
  }
}
@media screen and (max-width: 1200px) and (min-width: 750px) {
  .header-right .user-name {
    display: none;
  }
  .header-bg {
    background: url("~@/assets/imgs/header.png") no-repeat;
    background-size: cover;
  }

  .header—left {
    color: #ffffff;
    position: absolute;
    left: 20px;
    top: 8px;
    height: 50px;
    bottom: 50%;
    float: left;
    .yuming {
      width: 108px;
      height: 50px;
      font-size: 16px;
      font-weight: bold;
      float: left;
      color: #ffad31;
      line-height: 50px;
    }
    .system-title {
      float: left;
    }
    .system-name {
      font-family: "Microsoft YaHei";
      font-size: 16px;
      font-weight: bold;
      line-height: 36px;
      span {
        -webkit-background-clip: text;
        background-clip: text;
        color: #ffad31;
        font-weight: bold;
      }
    }
    .system-name1 {
      font-family: "ARIAL";
      font-size: 10px;
    }
  }
  .header—middle {
    position: absolute;
    left: 320px;
    top: 24px;
    right: 0;
    font-family: "Microsoft YaHei";
    display: flex;
    width: 210px;
    flex-direction: row;
    justify-content: space-between; //   align-items: center;
    .menu-item {
      // margin-right: 10px;
      font-size: 16px;
      padding-bottom: 12px;
      i {
        font-size: 20px;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        //   background: linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0) 100%);
      }
    }
  }
  .menu-icon {
    display: none;
  }
  .system-icon {
    display: none;
  }
}
@media screen and (max-width: 750px) {
  .header-right .user-name {
    display: none;
  }
  .simulator-admin-link,
  .logout-link {
    margin-left: 6px;
    padding: 4px 6px;
    font-size: 12px;
  }
  .header-bg {
    background: #003167;
    background-size: cover;
  }
  .header—left {
    display: none;
  }
  .header—middle {
    display: none;
  }
  .menu-icon {
    position: absolute;
    left: 100px;
    .menu-li {
      border: 1px solid #080e19;
      background: #4ecdff;
    }
  }
  .system-icon {
    position: absolute;
    left: 20px;
    top: 8px;
    width: 50px;
    height: 50px;
    img {
      width: 100%;
    }
  }
}
.wrapper {
  width: 100%;
  height: 100%;
  background: #080e19;
  overflow: hidden;

  .el-header {
    width: 100%;
    height: 65px;
    padding: 0;
  }
  .header-bg {
    width: 100%;
    height: 65px;

    /* 右上角 */
    //border-bottom-right-radius: 16px;
    /* 左下角 */
    //border-bottom-left-radius: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    /* overflow-y: scroll; */
    -moz-user-select: none;
    /* Firefox私有属性 */
    -webkit-user-select: none;
    /* WebKit内核私有属性 */
    -ms-user-select: none;
    /* IE私有属性(IE10及以后) */
    -khtml-user-select: none;
    /* KHTML内核私有属性 */
    -o-user-select: none;
    /* Opera私有属性 */
    user-select: none;
    /* CSS3属性 */

    .header-right {
      position: absolute;
      display: flex;
      align-items: center;
      right: 30px;
      height: 31px;
      width: auto;
      min-width: 130px;

      .time-box {
        font-size: 16px;
        // position: absolute;
        left: 0px;
        color: #e0efff;
        padding-right: 10px;
        font-family: "Microsoft YaHei";
        border-right: 1px solid rgba(255, 255, 255, 0.6);
      }
      .href-box {
        position: absolute;
        right: 0;
        color: #ffffff;
        font-family: "Microsoft YaHei";
        .login {
          cursor: pointer;
          display: inline-block;
        }
      }
      .user-box {
        position: static;
        // left: 168px;
        display: flex;
        align-items: center;
        justify-items: flex-start;
        white-space: nowrap;

        .user-avator {
          // position: absolute;
          // left: 10px;
          display: flex;
          justify-items: flex-start;
          img {
            display: block;
            width: 40px;
            height: 40px;
            border-radius: 50%;
          }
        }
        .user-name {
          color: #ffffff;
          margin-left: 0;
          line-height: 40px;
          font-family: "Microsoft YaHei";
        }
      }

      .config {
        position: absolute;
        right: 0;
        color: #ffffff;
        font-size: 18px;
        cursor: pointer;
      }
    }
    // .header—middle {
    //   position: absolute;
    //   left: 330px;
    //   top: 24px;
    //   right: 0;
    //   font-family: "Microsoft YaHei";
    //   display: flex;
    //   width: 600px;
    //   flex-direction: row;
    //   justify-content: space-around; //   align-items: center;
    //   .menu-item {
    //     // margin-right: 10px;
    //     font-size: 18px;
    //     padding-bottom: 12px;
    //     i {
    //       font-size: 20px;
    //       background-image: -webkit-linear-gradient(bottom, rgba(255, 255, 255, 0), #ffffff, #ffffff);
    //       -webkit-background-clip: text;
    //       -webkit-text-fill-color: transparent;
    //       //   background: linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0) 100%);
    //     }
    //   }
    // }
    // 天气样式
    .weather-box {
      position: absolute;
      right: 8px;
      top: 40px;
      color: #e0efff;
      .wb {
        height: 30px;
        float: left;
        margin-right: 10px;
        line-height: 20px;
        i {
          margin-right: 8px;
          font-size: 20px;
        }
        .wb-msg {
          font-size: 16px;
          display: inline-block;
        }
      }
    }

    // 用户登录样式
    .user-info {
      font: 20px "Microsoft YaHei";
      position: absolute;
      right: 8%;
      top: 40px;
      height: 31px;
      color: #ffffff;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      .login {
        font-family: "Microsoft YaHei";
        font-size: 14px;
      }
      .user-name {
        margin: 0;
        display: inline-block;
        font-size: 14px;
        width: 60px;
        text-overflow: -o-ellipsis-lastline;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .user-logined {
        .user-icon {
          position: absolute;
          top: -10px;
          left: -50px;
          width: 40px;
        }
      }
      .el-dropdown {
        font: inherit;
        color: #ffffff;
      }
    }
    // .user-info:hover {
    //     border-bottom: 2px solid #FFAD31 !important;
    // }
  }
  .el-main {
    height: 100%;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
    background: #080e19;
    color: #ffffff;
  }
}

:deep(.el-main-box) {
  width: 100%;
  height: 100%;
  overflow-y: auto;

  box-sizing: border-box;
}

@media screen and (max-width: 1000px) {
  .el-aside {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 1000;

    &.hide-aside {
      left: -250px;
    }
  }
}

/* --------------- 用户头像区域的样式 ---------------- */

.header-user-con {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 70px;
}

.el-dropdown-link {
  cursor: pointer;
}

.el-dropdown-menu__item {
  text-align: center;
}

/* --------------- 水平一级菜单栏的样式--------------------- */
.el-menu.el-menu--horizontal {
  border-bottom: none !important;
  float: left;
  margin-left: 50px;
  background: transparent;
}

.el-menu--horizontal > .el-menu-item.is-active {
  /* border-bottom: 2px solid #3989fa;
      color: #3989fa; */
  font-weight: bold;
}

.el-menu--horizontal > .el-menu-item {
  font-size: 16px;
  margin: 0 15px;
}

/* 页面主体部分 */
.content {
  height: 100%;
}

// 路由选中效果
.router-link-active {
  color: #ffad31;
  border-bottom: 2px solid #ffad31 !important;
  i {
    -webkit-text-fill-color: #ffad31 !important;
    color: #ffad31 !important;
  }
}
</style>

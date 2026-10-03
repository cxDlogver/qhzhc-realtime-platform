<template>
  <main class="auth-page login-page">
    <section class="auth-card">
      <button class="back-link" type="button" @click="backHome">返回首页</button>
      <p>欢迎使用</p>
      <h1>温室气体监测和计量平台</h1>
      <el-form ref="userForm" :model="user" :rules="rules" label-position="top">
        <el-form-item label="用户名" prop="username">
          <el-input v-model.trim="user.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="user.password"
            type="password"
            autocomplete="current-password"
            show-password
            @keyup.enter.native="login"
          />
        </el-form-item>
      </el-form>
      <div class="auth-actions">
        <router-link to="/register">注册新账号</router-link>
        <el-button type="primary" :loading="submitting" @click="login">登录</el-button>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import Vue from "vue";
import type { ElForm } from "element-ui/types/form";
import { userLogin, type LoginPayload } from "@/api/auth";

export default Vue.extend({
  name: "UserLogin",
  data() {
    return {
      user: { username: "", password: "" } as LoginPayload,
      submitting: false,
      rules: {
        username: [{ required: true, message: "请输入用户名", trigger: "blur" }],
        password: [{ required: true, message: "请输入密码", trigger: "blur" }],
      },
    };
  },
  methods: {
    async login(): Promise<void> {
      const form = this.$refs.userForm as ElForm;
      const valid = await form.validate().catch(() => false);
      if (!valid) return;
      this.submitting = true;
      try {
        const profile = await userLogin(this.user);
        localStorage.setItem("user", JSON.stringify(profile));
        this.$message.success("登录成功");
        const redirect = typeof this.$route.query.redirect === "string"
          ? this.$route.query.redirect
          : "/index";
        await this.$router.push(redirect);
      } finally {
        this.submitting = false;
      }
    },
    backHome(): void {
      void this.$router.push("/index");
    },
  },
});
</script>

<style scoped lang="scss">
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: #e9eef2 url("~@/assets/imgs/loginBG1.jpg") center / cover no-repeat;
  box-sizing: border-box;
}
.auth-card {
  position: relative;
  width: min(460px, 100%);
  padding: 48px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(0, 0, 0, .16);
  box-sizing: border-box;
}
.auth-card > p { margin: 0 0 10px; color: #667d8c; }
.auth-card h1 { margin: 0 0 34px; color: #122336; font-size: 25px; line-height: 1.45; }
.back-link { position: absolute; top: 18px; right: 22px; border: 0; background: none; cursor: pointer; }
.auth-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 26px; }
.auth-actions a { color: #346a8c; }
@media (max-width: 520px) { .auth-card { padding: 44px 24px 30px; } }
</style>

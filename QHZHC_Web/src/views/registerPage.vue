<template>
  <main class="auth-page register-page">
    <section class="auth-card">
      <button class="back-link" type="button" @click="backHome">返回首页</button>
      <p>创建平台账号</p>
      <h1>温室气体监测和计量平台</h1>
      <el-form ref="registerForm" :model="form" :rules="rules" label-position="top">
        <el-form-item label="用户名" prop="username">
          <el-input v-model.trim="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="姓名" prop="displayName">
          <el-input v-model.trim="form.displayName" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmation">
          <el-input v-model="form.confirmation" type="password" show-password />
        </el-form-item>
      </el-form>
      <div class="auth-actions">
        <router-link to="/login">返回登录</router-link>
        <el-button type="primary" :loading="submitting" @click="register">注册</el-button>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import Vue from "vue";
import type { ElForm } from "element-ui/types/form";
import { userRegister } from "@/api/auth";

interface RegisterForm {
  username: string;
  displayName: string;
  password: string;
  confirmation: string;
}

export default Vue.extend({
  name: "UserRegister",
  data() {
    const validateConfirmation = (
      _rule: unknown,
      value: string,
      callback: (error?: Error) => void,
    ): void => {
      callback(value === this.form.password ? undefined : new Error("两次输入的密码不一致"));
    };
    return {
      form: { username: "", displayName: "", password: "", confirmation: "" } as RegisterForm,
      submitting: false,
      rules: {
        username: [
          { required: true, message: "请输入用户名", trigger: "blur" },
          { pattern: /^[a-zA-Z0-9_]{3,24}$/, message: "使用 3-24 位字母、数字或下划线", trigger: "blur" },
        ],
        displayName: [{ required: true, message: "请输入姓名", trigger: "blur" }],
        password: [
          { required: true, message: "请输入密码", trigger: "blur" },
          { min: 8, message: "密码至少 8 位", trigger: "blur" },
        ],
        confirmation: [
          { required: true, message: "请再次输入密码", trigger: "blur" },
          { validator: validateConfirmation, trigger: "blur" },
        ],
      },
    };
  },
  methods: {
    async register(): Promise<void> {
      const form = this.$refs.registerForm as ElForm;
      const valid = await form.validate().catch(() => false);
      if (!valid) return;
      this.submitting = true;
      try {
        const profile = await userRegister({
          username: this.form.username,
          displayName: this.form.displayName,
          password: this.form.password,
        });
        localStorage.setItem("user", JSON.stringify(profile));
        this.$message.success("注册成功");
        await this.$router.push("/dataVisualization");
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
  background: #e9eef2 url("~@/assets/imgs/registerBG1.jpg") center / cover no-repeat;
  box-sizing: border-box;
}
.auth-card {
  position: relative;
  width: min(560px, 100%);
  padding: 42px 50px 34px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(0, 0, 0, .16);
  box-sizing: border-box;
}
.auth-card > p { margin: 0 0 8px; color: #667d8c; }
.auth-card h1 { margin: 0 0 24px; color: #122336; font-size: 24px; }
.back-link { position: absolute; top: 18px; right: 22px; border: 0; background: none; cursor: pointer; }
.auth-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; }
.auth-actions a { color: #346a8c; }
@media (max-width: 600px) { .auth-card { padding: 44px 24px 28px; } }
</style>

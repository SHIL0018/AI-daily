<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowRight, BarChart3, LockKeyhole } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
const mode = ref<"login" | "register">("login");
const email = ref("");
const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

async function submit() {
  loading.value = true;
  error.value = "";
  try {
    if (mode.value === "login") await auth.login(email.value, password.value);
    else await auth.register(email.value, username.value || email.value.split("@")[0], password.value);
    router.push("/home");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "操作失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-context">
      <div class="login-brand"><span><BarChart3 :size="22" /></span><strong>Activity Daily</strong></div>
      <div class="login-message">
        <p class="section-kicker">个人时间复盘</p>
        <h1>看见一天，<br />而不只是记住一天。</h1>
        <p>活动记录、时间分布和每日分析会在登录后汇集到同一个工作台。</p>
      </div>
      <div class="login-rhythm" aria-hidden="true">
        <i style="left: 8%; width: 10%; background: #26735b"></i><i style="left: 19%; width: 17%; background: #3157c8"></i><i style="left: 39%; width: 8%; background: #d68a2f"></i><i style="left: 51%; width: 23%; background: #26735b"></i><i style="left: 78%; width: 13%; background: #d8664f"></i>
      </div>
    </section>

    <section class="login-form-wrap">
      <form class="login-card" @submit.prevent="submit">
        <div class="login-card-head">
          <span class="lock-mark"><LockKeyhole :size="20" /></span>
          <div><h2>{{ mode === 'login' ? '欢迎回来' : '创建个人账号' }}</h2><p>{{ mode === 'login' ? '继续查看你的活动日报' : '开始建立你的第一份日报' }}</p></div>
        </div>

        <div class="segmented" aria-label="账号操作">
          <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'; error = ''">登录</button>
          <button type="button" :class="{ active: mode === 'register' }" @click="mode = 'register'; error = ''">注册</button>
        </div>

        <label>邮箱<input v-model="email" type="email" required autocomplete="email" placeholder="name@example.com" /></label>
        <label v-if="mode === 'register'">用户名<input v-model="username" type="text" autocomplete="username" placeholder="你的称呼" /></label>
        <label>密码<input v-model="password" type="password" required :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="输入密码" /></label>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <button class="primary-button login-submit" :disabled="loading">{{ loading ? '处理中...' : mode === 'login' ? '登录' : '创建账号' }}<ArrowRight :size="18" /></button>
      </form>
    </section>
  </main>
</template>

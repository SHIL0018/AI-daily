<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
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
    <section class="login-panel">
      <div class="login-copy">
        <p class="eyebrow">Activity Daily</p>
        <h1>把一天的电脑活动整理成可复盘的日报</h1>
        <p>本地客户端负责采集与轻量识图，服务端负责同步、统计和 DeepSeek 分析。</p>
      </div>
      <form class="login-card" @submit.prevent="submit">
        <div class="segmented">
          <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
          <button type="button" :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
        </div>
        <label>
          邮箱
          <input v-model="email" type="email" required autocomplete="email" />
        </label>
        <label v-if="mode === 'register'">
          用户名
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          密码
          <input v-model="password" type="password" required autocomplete="current-password" />
        </label>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="primary-button" :disabled="loading">{{ loading ? '处理中...' : mode === 'login' ? '登录' : '创建账号' }}</button>
      </form>
    </section>
  </main>
</template>
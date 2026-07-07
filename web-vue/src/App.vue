<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const isLogin = computed(() => route.path === "/login");
const title = computed(() => route.path === "/records" ? "记录管理" : route.path === "/api-keys" ? "API 管理" : "首页");
const subtitle = computed(() => route.path === "/records" ? "活动明细" : route.path === "/api-keys" ? "模型分析凭据" : "今日概览");
const initials = computed(() => (auth.email || "U").slice(0, 1).toUpperCase());

function logout() {
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <RouterView v-if="isLogin" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">AD</div>
        <div>
          <strong>Activity Daily</strong>
          <span>Personal analytics</span>
        </div>
      </div>
      <nav class="nav-list" aria-label="主导航">
        <RouterLink to="/home"><span class="nav-icon">⌂</span><span>首页</span></RouterLink>
        <RouterLink to="/records"><span class="nav-icon">≡</span><span>记录管理</span></RouterLink>
        <RouterLink to="/api-keys"><span class="nav-icon">◇</span><span>API 管理</span></RouterLink>
      </nav>
    </aside>
    <main class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ subtitle }}</p>
          <h1>{{ title }}</h1>
        </div>
        <div class="user-menu">
          <div class="avatar">{{ initials }}</div>
          <div class="user-meta">
            <strong>{{ auth.email }}</strong>
            <span>已登录</span>
          </div>
          <button class="ghost-button" @click="logout">退出</button>
        </div>
      </header>
      <RouterView />
    </main>
  </div>
</template>
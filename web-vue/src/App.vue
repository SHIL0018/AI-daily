<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { BarChart3, ChevronDown, House, KeyRound, ListChecks, LogOut } from "lucide-vue-next";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const isLogin = computed(() => route.path === "/login");
const pageMeta = computed(() => {
  if (route.path === "/records") return { title: "记录管理", subtitle: "查看和整理活动明细" };
  if (route.path === "/api-keys") return { title: "API 管理", subtitle: "管理 AI 分析凭据" };
  return { title: "每日概览", subtitle: "回看时间如何流动" };
});
const initials = computed(() => (auth.email || "U").slice(0, 1).toUpperCase());
const navItems = [
  { to: "/home", label: "首页", icon: House },
  { to: "/records", label: "记录管理", icon: ListChecks },
  { to: "/api-keys", label: "API 管理", icon: KeyRound }
];

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
        <div class="brand-mark" aria-hidden="true"><BarChart3 :size="21" :stroke-width="2.2" /></div>
        <div>
          <strong>Activity Daily</strong>
          <span>个人时间复盘</span>
        </div>
      </div>

      <nav class="nav-list" aria-label="主导航">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">
          <component :is="item.icon" :size="19" :stroke-width="2" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <span class="online-dot" aria-hidden="true"></span>
        <span>同步服务已连接</span>
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="page-heading">
          <h1>{{ pageMeta.title }}</h1>
          <p>{{ pageMeta.subtitle }}</p>
        </div>

        <details class="user-menu">
          <summary>
            <span class="avatar">{{ initials }}</span>
            <span class="user-meta">
              <strong>{{ auth.email }}</strong>
              <small>个人账号</small>
            </span>
            <ChevronDown :size="16" aria-hidden="true" />
          </summary>
          <div class="user-popover">
            <button type="button" @click="logout"><LogOut :size="17" />退出登录</button>
          </div>
        </details>
      </header>

      <RouterView />
    </main>
  </div>
</template>

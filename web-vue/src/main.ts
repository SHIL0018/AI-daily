import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { useAuthStore } from "./stores/auth";
import "./styles.css";

const routes = [
  { path: "/", redirect: "/home" },
  { path: "/login", component: () => import("./views/LoginView.vue"), meta: { public: true } },
  { path: "/home", component: () => import("./views/HomeView.vue") },
  { path: "/records", component: () => import("./views/RecordsView.vue") },
  { path: "/api-keys", component: () => import("./views/ApiKeysView.vue") }
];

const router = createRouter({ history: createWebHistory(), routes });
const pinia = createPinia();

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.accessToken) return "/login";
  if (to.path === "/login" && auth.accessToken) return "/home";
});

createApp(App).use(pinia).use(router).mount("#app");

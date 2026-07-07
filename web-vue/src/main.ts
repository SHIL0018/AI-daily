import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import HomeView from "./views/HomeView.vue";
import RecordsView from "./views/RecordsView.vue";
import ApiKeysView from "./views/ApiKeysView.vue";
import LoginView from "./views/LoginView.vue";
import { useAuthStore } from "./stores/auth";
import "./styles.css";

const routes = [
  { path: "/", redirect: "/home" },
  { path: "/login", component: LoginView, meta: { public: true } },
  { path: "/home", component: HomeView },
  { path: "/records", component: RecordsView },
  { path: "/api-keys", component: ApiKeysView }
];

const router = createRouter({ history: createWebHistory(), routes });
const pinia = createPinia();

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.accessToken) return "/login";
  if (to.path === "/login" && auth.accessToken) return "/home";
});

createApp(App).use(pinia).use(router).mount("#app");
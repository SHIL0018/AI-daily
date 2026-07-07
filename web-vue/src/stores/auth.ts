import { defineStore } from "pinia";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export const useAuthStore = defineStore("auth", {
  state: () => ({
    accessToken: localStorage.getItem("access_token") || "",
    refreshToken: localStorage.getItem("refresh_token") || "",
    email: localStorage.getItem("user_email") || ""
  }),
  actions: {
    async login(email: string, password: string) {
      const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.detail?.message || "邮箱或密码不正确");
      this.accessToken = body.data.access_token;
      this.refreshToken = body.data.refresh_token;
      this.email = email;
      localStorage.setItem("access_token", this.accessToken);
      localStorage.setItem("refresh_token", this.refreshToken);
      localStorage.setItem("user_email", email);
    },
    async register(email: string, username: string, password: string) {
      const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.detail?.message || "注册失败");
      await this.login(email, password);
    },
    async refresh() {
      if (!this.refreshToken) return false;
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken })
      });
      if (!response.ok) {
        this.logout();
        return false;
      }
      const body = await response.json();
      this.accessToken = body.data.access_token;
      localStorage.setItem("access_token", this.accessToken);
      return true;
    },
    logout() {
      this.accessToken = "";
      this.refreshToken = "";
      this.email = "";
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user_email");
    }
  }
});
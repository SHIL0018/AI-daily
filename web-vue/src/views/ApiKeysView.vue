<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiRequest } from "../api";

type KeyStatus = { configured: boolean; key_hint: string; updated_at?: string };
const status = ref<KeyStatus>({ configured: false, key_hint: "" });
const apiKey = ref("");
const message = ref("");

async function load() {
  status.value = await apiRequest<KeyStatus>("/api/v1/api-keys/deepseek");
}

async function save() {
  message.value = "";
  try {
    status.value = await apiRequest<KeyStatus>("/api/v1/api-keys/deepseek", { method: "PUT", body: JSON.stringify({ api_key: apiKey.value }) });
    apiKey.value = "";
    message.value = "API Key 已保存";
  } catch (err) {
    message.value = err instanceof Error ? err.message : "保存失败";
  }
}

async function remove() {
  status.value = await apiRequest<KeyStatus>("/api/v1/api-keys/deepseek", { method: "DELETE" });
  message.value = "API Key 已删除";
}

onMounted(load);
</script>

<template>
  <section class="api-layout">
    <section class="surface api-hero-card">
      <div class="key-mark">DK</div>
      <div>
        <p class="eyebrow">DeepSeek</p>
        <h2>API Key</h2>
      </div>
      <span :class="['status-pill', status.configured ? 'ok' : 'warn']">{{ status.configured ? '已配置' : '未配置' }}</span>
    </section>

    <section class="surface api-panel">
      <div class="status-grid">
        <div><span>状态</span><strong>{{ status.configured ? '已配置' : '未配置' }}</strong></div>
        <div><span>已保存的 Key</span><strong>{{ status.key_hint || '未保存' }}</strong></div>
      </div>
      <label>
        API Key
        <input v-model="apiKey" type="password" placeholder="sk-..." />
      </label>
      <div class="button-row">
        <button class="primary-button" @click="save">保存</button>
        <button class="ghost-button" :disabled="!status.configured" @click="remove">删除</button>
      </div>
      <p v-if="message" class="notice">{{ message }}</p>
    </section>
  </section>
</template>
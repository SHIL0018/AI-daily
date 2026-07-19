<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { CheckCircle2, Eye, EyeOff, KeyRound, Save, ShieldCheck, Trash2 } from "lucide-vue-next";
import { apiRequest } from "../api";

type KeyStatus = { configured: boolean; key_hint: string; updated_at?: string };
const status = ref<KeyStatus>({ configured: false, key_hint: "" });
const apiKey = ref("");
const message = ref("");
const loading = ref(false);
const revealKey = ref(false);
const canSave = computed(() => apiKey.value.trim().length >= 8 && !loading.value);

async function load() {
  try {
    status.value = await apiRequest<KeyStatus>("/api/v1/api-keys/deepseek");
  } catch (err) {
    message.value = err instanceof Error ? err.message : "状态加载失败";
  }
}

async function save() {
  if (!canSave.value) return;
  message.value = "";
  loading.value = true;
  try {
    status.value = await apiRequest<KeyStatus>("/api/v1/api-keys/deepseek", { method: "PUT", body: JSON.stringify({ api_key: apiKey.value.trim() }) });
    apiKey.value = "";
    message.value = "API Key 已保存";
  } catch (err) {
    message.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    loading.value = false;
  }
}

async function remove() {
  if (!confirm("确认删除已保存的 API Key？")) return;
  loading.value = true;
  try {
    status.value = await apiRequest<KeyStatus>("/api/v1/api-keys/deepseek", { method: "DELETE" });
    message.value = "API Key 已删除";
  } catch (err) {
    message.value = err instanceof Error ? err.message : "删除失败";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="api-page">
    <section class="api-intro">
      <div class="api-icon"><KeyRound :size="24" /></div>
      <div><p class="section-kicker">DeepSeek</p><h2>AI 分析凭据</h2><p>该凭据只用于生成你的日报分析。</p></div>
      <span class="connection-status" :class="{ connected: status.configured }"><CheckCircle2 v-if="status.configured" :size="16" /><span v-else class="status-dot"></span>{{ status.configured ? '已配置' : '等待配置' }}</span>
    </section>

    <section class="surface api-panel">
      <div class="key-status-row">
        <ShieldCheck :size="22" />
        <div><span>当前凭据</span><strong>{{ status.key_hint || '尚未保存 API Key' }}</strong><small v-if="status.updated_at">最后更新于 {{ status.updated_at }}</small></div>
      </div>

      <form class="key-form" @submit.prevent="save">
        <label for="deepseek-key">新的 API Key</label>
        <div class="secret-field">
          <input id="deepseek-key" v-model="apiKey" :type="revealKey ? 'text' : 'password'" placeholder="sk-..." autocomplete="off" />
          <button type="button" :title="revealKey ? '隐藏 Key' : '显示 Key'" @click="revealKey = !revealKey"><EyeOff v-if="revealKey" :size="18" /><Eye v-else :size="18" /></button>
        </div>
        <p>保存新 Key 会覆盖当前凭据。页面不会再次显示完整内容。</p>
        <div class="button-row">
          <button class="primary-button" type="submit" :disabled="!canSave"><Save :size="17" />{{ loading ? '保存中...' : '保存 API Key' }}</button>
          <button class="danger-button" type="button" :disabled="!status.configured || loading" @click="remove"><Trash2 :size="17" />删除已保存 Key</button>
        </div>
      </form>

      <p v-if="message" class="notice" role="status">{{ message }}</p>
    </section>
  </section>
</template>

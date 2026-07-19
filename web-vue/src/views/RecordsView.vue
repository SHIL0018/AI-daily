<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RefreshCw, Search, Trash2 } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { apiRequest, formatDuration } from "../api";
import { useDateStore } from "../stores/date";

type RecordItem = { id: string; start_time: string; end_time: string; duration_seconds: number; summary: string; category: string; app_name?: string };
const dateStore = useDateStore();
const { selectedDate: date } = storeToRefs(dateStore);
const records = ref<RecordItem[]>([]);
const message = ref("");
const loading = ref(false);
const query = ref("");
const category = ref("");
const totalDuration = computed(() => records.value.reduce((sum, item) => sum + item.duration_seconds, 0));
const categories = computed(() => [...new Set(records.value.map((item) => item.category))].sort());
const filteredRecords = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return records.value.filter((item) => {
    const matchesCategory = !category.value || item.category === category.value;
    const matchesKeyword = !keyword || `${item.summary} ${item.app_name || ""}`.toLowerCase().includes(keyword);
    return matchesCategory && matchesKeyword;
  });
});
let dateTimer: number | undefined;

function formatClock(value: string): string {
  const match = value.match(/(?:T|^)(\d{2}:\d{2})/);
  return match?.[1] || value.slice(0, 5);
}

async function load() {
  message.value = "";
  loading.value = true;
  try {
    const data = await apiRequest<{ records: RecordItem[] }>(`/api/v1/activity-records?date=${date.value}&page_size=200`);
    records.value = data.records;
  } catch (err) {
    message.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function removeRecord(id: string) {
  if (!confirm("确认删除这条记录？")) return;
  try {
    await apiRequest(`/api/v1/activity-records/${id}`, { method: "DELETE" });
    await load();
  } catch (err) {
    message.value = err instanceof Error ? err.message : "删除失败";
  }
}

onMounted(load);
watch(date, () => {
  window.clearTimeout(dateTimer);
  dateTimer = window.setTimeout(() => load(), 250);
});
onUnmounted(() => window.clearTimeout(dateTimer));
</script>

<template>
  <section class="page-stack records-page">
    <section class="records-overview">
      <div><p class="section-kicker">{{ date }}</p><strong>{{ records.length }}</strong><span>条活动记录</span></div>
      <div><p class="section-kicker">累计时长</p><strong>{{ formatDuration(totalDuration) }}</strong><span>当天已记录</span></div>
      <div class="records-actions">
        <input v-model="date" type="date" aria-label="记录日期" />
        <button class="icon-button" type="button" title="刷新记录" :disabled="loading" @click="load"><RefreshCw :size="18" :class="{ spinning: loading }" /></button>
      </div>
    </section>

    <p v-if="message" class="notice" role="status">{{ message }}</p>

    <section class="surface records-panel">
      <div class="records-toolbar">
        <div class="search-field"><Search :size="18" /><input v-model="query" type="search" placeholder="搜索摘要或应用" aria-label="搜索记录" /></div>
        <select v-model="category" aria-label="按分类筛选">
          <option value="">全部分类</option>
          <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
        </select>
        <span>{{ filteredRecords.length }} 条结果</span>
      </div>

      <div class="table-scroll">
        <table>
          <thead><tr><th>时间</th><th>分类</th><th>活动摘要</th><th>应用</th><th>时长</th><th><span class="sr-only">操作</span></th></tr></thead>
          <tbody>
            <tr v-for="item in filteredRecords" :key="item.id">
              <td class="time-cell"><strong>{{ formatClock(item.start_time) }}</strong><span>至 {{ formatClock(item.end_time) }}</span></td>
              <td><span class="category-label">{{ item.category }}</span></td>
              <td class="summary-cell">{{ item.summary }}</td>
              <td class="app-cell">{{ item.app_name || '—' }}</td>
              <td class="duration-cell">{{ formatDuration(item.duration_seconds) }}</td>
              <td><button class="danger-icon-button" type="button" title="删除记录" @click="removeRecord(item.id)"><Trash2 :size="17" /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!filteredRecords.length && !loading" class="empty-text">没有符合条件的记录</p>
      <p v-if="loading" class="empty-text">正在加载记录...</p>
    </section>
  </section>
</template>

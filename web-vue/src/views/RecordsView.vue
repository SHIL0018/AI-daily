<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
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
const page = ref(1);
const pageSize = 50;
const totalItems = ref(0);
const totalPages = ref(1);
const totalDuration = ref(0);
const categories = ["编程开发", "文档写作", "论文阅读", "数据分析", "模型训练", "会议沟通", "信息检索", "娱乐休息", "系统操作", "空闲", "隐私", "其他"];
let loadTimer: number | undefined;
let loadController: AbortController | undefined;

function formatClock(value: string): string {
  const match = value.match(/(?:T|^)(\d{2}:\d{2})/);
  return match?.[1] || value.slice(0, 5);
}

async function load() {
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  message.value = "";
  loading.value = true;
  try {
    const params = new URLSearchParams({ date: date.value, page: String(page.value), page_size: String(pageSize), sort: "start_time", direction: "desc" });
    if (query.value.trim()) params.set("q", query.value.trim());
    if (category.value) params.set("category", category.value);
    const data = await apiRequest<{ items: RecordItem[]; total_items: number; total_pages: number; total_duration_seconds: number }>(`/api/v2/activities?${params}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    records.value = data.items;
    totalItems.value = data.total_items;
    totalPages.value = data.total_pages;
    totalDuration.value = data.total_duration_seconds;
  } catch (err) {
    if (controller.signal.aborted) return;
    message.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    if (loadController === controller) {
      loadController = undefined;
      loading.value = false;
    }
  }
}

function scheduleLoad(resetPage = false) {
  if (resetPage && page.value !== 1) {
    page.value = 1;
    return;
  }
  window.clearTimeout(loadTimer);
  loadTimer = window.setTimeout(() => void load(), 300);
}

async function removeRecord(id: string) {
  if (!confirm("确认删除这条记录？")) return;
  try {
    await apiRequest(`/api/v1/activity-records/${id}`, { method: "DELETE" });
    if (records.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (err) {
    message.value = err instanceof Error ? err.message : "删除失败";
  }
}

onMounted(load);
watch(date, () => scheduleLoad(true));
watch([query, category], () => scheduleLoad(true));
watch(page, () => scheduleLoad(false));
onUnmounted(() => {
  window.clearTimeout(loadTimer);
  loadController?.abort();
});
</script>

<template>
  <section class="page-stack records-page">
    <section class="records-overview">
      <div><p class="section-kicker">{{ date }}</p><strong>{{ totalItems }}</strong><span>条活动记录</span></div>
      <div><p class="section-kicker">累计时长</p><strong>{{ formatDuration(totalDuration) }}</strong><span>当天已记录</span></div>
      <div class="records-actions">
        <input v-model="date" type="date" aria-label="记录日期" />
        <button class="icon-button" type="button" title="刷新记录" :disabled="loading" @click="load()"><RefreshCw :size="18" :class="{ spinning: loading }" /></button>
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
        <span>{{ totalItems }} 条结果</span>
      </div>

      <div class="table-scroll">
        <table>
          <thead><tr><th>时间</th><th>分类</th><th>活动摘要</th><th>应用</th><th>时长</th><th><span class="sr-only">操作</span></th></tr></thead>
          <tbody>
            <tr v-for="item in records" :key="item.id">
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
      <p v-if="!records.length && !loading" class="empty-text">没有符合条件的记录</p>
      <p v-if="loading" class="empty-text">正在加载记录...</p>
      <nav v-if="totalPages > 1" class="table-pagination" aria-label="活动记录分页">
        <button class="secondary-button" type="button" :disabled="loading || page <= 1" @click="page -= 1">上一页</button>
        <span>第 {{ page }} / {{ totalPages }} 页</span>
        <button class="secondary-button" type="button" :disabled="loading || page >= totalPages" @click="page += 1">下一页</button>
      </nav>
    </section>
  </section>
</template>

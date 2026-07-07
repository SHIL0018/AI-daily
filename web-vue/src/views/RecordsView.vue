<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { apiRequest, formatDuration } from "../api";
import { useDateStore } from "../stores/date";

type RecordItem = { id: string; start_time: string; end_time: string; duration_seconds: number; summary: string; category: string; app_name?: string };
const dateStore = useDateStore();
const { selectedDate: date } = storeToRefs(dateStore);
const records = ref<RecordItem[]>([]);
const message = ref("");
const totalDuration = computed(() => records.value.reduce((sum, item) => sum + item.duration_seconds, 0));
let dateTimer: number | undefined;

async function load() {
  message.value = "";
  try {
    const data = await apiRequest<{ records: RecordItem[] }>(`/api/v1/activity-records?date=${date.value}&page_size=200`);
    records.value = data.records;
  } catch (err) {
    message.value = err instanceof Error ? err.message : "加载失败";
  }
}

async function removeRecord(id: string) {
  if (!confirm("确认删除这条记录？")) return;
  await apiRequest(`/api/v1/activity-records/${id}`, { method: "DELETE" });
  await load();
}

onMounted(load);
watch(date, () => {
  window.clearTimeout(dateTimer);
  dateTimer = window.setTimeout(() => load(), 250);
});
onUnmounted(() => window.clearTimeout(dateTimer));
</script>

<template>
  <section class="page-stack">
    <div class="surface action-strip records-strip">
      <div>
        <p class="eyebrow">{{ records.length }} 条记录</p>
        <strong>{{ formatDuration(totalDuration) }}</strong>
      </div>
      <div class="toolbar-line">
        <input v-model="date" type="date" />
        <button class="primary-button" @click="load">刷新</button>
      </div>
    </div>

    <p v-if="message" class="notice">{{ message }}</p>

    <section class="surface table-panel">
      <table>
        <thead>
          <tr><th>时间</th><th>分类</th><th>摘要</th><th>应用</th><th>时长</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="item in records" :key="item.id">
            <td class="time-cell">{{ item.start_time.slice(11,16) }}<span>{{ item.end_time.slice(11,16) }}</span></td>
            <td><span class="tag">{{ item.category }}</span></td>
            <td class="summary-cell">{{ item.summary }}</td>
            <td>{{ item.app_name || '-' }}</td>
            <td><strong>{{ formatDuration(item.duration_seconds) }}</strong></td>
            <td><button class="text-button" @click="removeRecord(item.id)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!records.length" class="empty-text">当天暂无记录</p>
    </section>
  </section>
</template>
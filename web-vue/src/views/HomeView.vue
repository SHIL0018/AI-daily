<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import * as echarts from "echarts";
import { apiRequest, formatDuration } from "../api";
import { useDateStore } from "../stores/date";

type Report = {
  date: string;
  title: string;
  overview: string;
  total_tracked_seconds: number;
  active_seconds: number;
  idle_seconds: number;
  private_seconds: number;
  category_stats: Array<{ category: string; duration_seconds: number; percentage: number }>;
  app_stats: Array<{ app_name: string; duration_seconds: number; percentage: number }>;
  timeline: Array<{ start_time: string; end_time: string; category: string; summary: string; duration_seconds: number; app_name?: string }>;
  ai_analysis?: { status: string; one_sentence_summary?: string; suggestions?: string[] };
};

type AiJob = { job_id: string; status: string };

const dateStore = useDateStore();
const { selectedDate: date } = storeToRefs(dateStore);
const report = ref<Report | null>(null);
const loading = ref(false);
const aiRunning = ref(false);
const message = ref("");
const chartEl = ref<HTMLDivElement | null>(null);
const apiKeyConfigured = ref(false);
let chart: echarts.ECharts | null = null;
let dateTimer: number | undefined;
let aiPollTimer: number | undefined;

const topApps = computed(() => report.value?.app_stats?.slice(0, 6) || []);
const topCategories = computed(() => report.value?.category_stats?.slice(0, 6) || []);
const recentTimeline = computed(() => report.value?.timeline?.slice(-7).reverse() || []);
const activeRate = computed(() => {
  const total = report.value?.total_tracked_seconds || 0;
  if (!total) return 0;
  return Math.round((report.value!.active_seconds / total) * 100);
});
const aiText = computed(() => report.value?.ai_analysis?.one_sentence_summary || report.value?.overview || "暂无日报内容");
const aiStatusText = computed(() => {
  const status = report.value?.ai_analysis?.status;
  if (!status || status === "none") return "未分析";
  if (status === "pending" || status === "running") return "分析中";
  if (status === "fallback") return "规则结果";
  if (status === "succeeded") return "已分析";
  return status;
});

async function load(options: { quiet?: boolean } = {}) {
  loading.value = !options.quiet;
  if (!options.quiet) message.value = "";
  try {
    report.value = await apiRequest<Report>(`/api/v1/daily-reports/${date.value}?include_ai_analysis=true`);
    const key = await apiRequest<{ configured: boolean }>("/api/v1/api-keys/deepseek");
    apiKeyConfigured.value = key.configured;
    await nextTick();
    renderChart();
  } catch (err) {
    message.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function runAi() {
  if (aiRunning.value) return;
  if (!apiKeyConfigured.value) {
    message.value = "请先在 API 管理中配置 DeepSeek API Key";
    return;
  }
  aiRunning.value = true;
  message.value = "AI 分析已提交";
  try {
    const job = await apiRequest<AiJob>(`/api/v1/daily-reports/${date.value}/ai-analysis`, {
      method: "POST",
      body: JSON.stringify({ analysis_type: "daily", mode: "standard", force_regenerate: true })
    });
    await pollAiJob(job.job_id);
  } catch (err) {
    message.value = err instanceof Error ? err.message : "AI 分析失败";
    aiRunning.value = false;
  }
}

async function pollAiJob(jobId: string) {
  window.clearTimeout(aiPollTimer);
  try {
    const job = await apiRequest<AiJob & { error_message?: string }>(`/api/v1/ai-analysis-jobs/${jobId}`);
    if (["succeeded", "fallback", "failed"].includes(job.status)) {
      message.value = job.status === "failed" ? (job.error_message || "AI 分析失败") : "AI 分析已完成";
      aiRunning.value = false;
      await load({ quiet: true });
      return;
    }
    message.value = "AI 分析中...";
    aiPollTimer = window.setTimeout(() => pollAiJob(jobId), 1600);
  } catch (err) {
    message.value = err instanceof Error ? err.message : "AI 分析状态查询失败";
    aiRunning.value = false;
  }
}

function renderChart() {
  if (!chartEl.value || !report.value) return;
  chart?.dispose();
  chart = echarts.init(chartEl.value);
  chart.setOption({
    tooltip: { trigger: "item", borderWidth: 0, backgroundColor: "#111827", textStyle: { color: "#fff" } },
    color: ["#2563eb", "#059669", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#64748b"],
    series: [{
      type: "pie",
      radius: ["58%", "82%"],
      center: ["50%", "50%"],
      minAngle: 4,
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#fff", borderWidth: 3 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: report.value.category_stats.map((item) => ({ name: item.category, value: item.duration_seconds }))
    }]
  });
}

function resizeChart() {
  chart?.resize();
}

watch(date, () => {
  window.clearTimeout(dateTimer);
  dateTimer = window.setTimeout(() => load(), 250);
});

onMounted(() => {
  load();
  window.addEventListener("resize", resizeChart);
});
onUnmounted(() => {
  window.clearTimeout(dateTimer);
  window.clearTimeout(aiPollTimer);
  window.removeEventListener("resize", resizeChart);
  chart?.dispose();
});
</script>

<template>
  <section class="page-stack home-page">
    <div class="surface action-strip home-action-strip">
      <div>
        <p class="eyebrow">日报日期</p>
        <strong>{{ date }}</strong>
      </div>
      <div class="toolbar-line">
        <input v-model="date" type="date" />
        <button class="ghost-button" :disabled="loading" @click="load()">刷新</button>
        <button class="primary-button" :disabled="aiRunning || loading" @click="runAi">{{ aiRunning ? '分析中...' : 'AI 分析' }}</button>
      </div>
    </div>

    <p v-if="message" class="notice">{{ message }}</p>

    <div class="home-overview" v-if="report">
      <section class="surface chart-card main-chart-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">分类占比</p>
            <h2>活动结构</h2>
          </div>
          <span class="status-pill">{{ activeRate }}% 活跃</span>
        </div>
        <div class="chart-layout refined-chart-layout">
          <div class="chart-wrap">
            <div ref="chartEl" class="pie-chart"></div>
            <div class="chart-center">
              <strong>{{ formatDuration(report.total_tracked_seconds) }}</strong>
              <span>总记录</span>
            </div>
          </div>
          <div class="category-list compact-category-list">
            <div v-for="item in topCategories" :key="item.category" class="category-row">
              <span>{{ item.category }}</span>
              <strong>{{ item.percentage }}%</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="home-side-panel">
        <section class="surface insight-card refined-insight-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">日报摘要</p>
              <h2>{{ report.title }}</h2>
            </div>
            <span class="status-pill" :class="{ ok: aiStatusText === '已分析', warn: aiStatusText === '未分析' }">{{ aiStatusText }}</span>
          </div>
          <p>{{ aiText }}</p>
        </section>

        <div class="metric-grid">
          <div class="surface metric-card primary-metric">
            <span>有效活动</span>
            <strong>{{ formatDuration(report.active_seconds) }}</strong>
            <small>{{ activeRate }}% / 总记录</small>
          </div>
          <div class="surface metric-card">
            <span>空闲</span>
            <strong>{{ formatDuration(report.idle_seconds) }}</strong>
            <small>隐私 {{ formatDuration(report.private_seconds) }}</small>
          </div>
        </div>
      </section>
    </div>

    <div class="content-grid" v-if="report">
      <section class="surface app-stat-card">
        <div class="section-head"><h2>应用统计</h2></div>
        <div v-for="app in topApps" :key="app.app_name" class="progress-row">
          <div class="progress-label">
            <span>{{ app.app_name }}</span>
            <strong>{{ formatDuration(app.duration_seconds) }}</strong>
          </div>
          <div class="progress-track"><i :style="{ width: `${Math.max(app.percentage, 3)}%` }"></i></div>
        </div>
        <p v-if="!topApps.length" class="empty-text">暂无应用统计</p>
      </section>

      <section class="surface timeline-card">
        <div class="section-head"><h2>最近记录</h2></div>
        <article v-for="item in recentTimeline" :key="item.start_time + item.summary" class="timeline-item">
          <div class="timeline-dot"></div>
          <div>
            <time>{{ item.start_time }}-{{ item.end_time }} · {{ item.category }}</time>
            <p>{{ item.summary }}</p>
            <small>{{ item.app_name || '未知应用' }}</small>
          </div>
        </article>
        <p v-if="!recentTimeline.length" class="empty-text">当天暂无记录</p>
      </section>
    </div>

    <p v-if="loading" class="notice">加载中...</p>
  </section>
</template>
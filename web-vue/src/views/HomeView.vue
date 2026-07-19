<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { init, use, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { CalendarDays, RefreshCw, Sparkles } from "lucide-vue-next";
import { apiRequest, formatDuration } from "../api";
import { useDateStore } from "../stores/date";

type TimelineItem = { start_time: string; end_time: string; category: string; summary: string; duration_seconds: number; app_name?: string };
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
  timeline: TimelineItem[];
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
use([PieChart, TooltipComponent, CanvasRenderer]);

let chart: EChartsType | null = null;
let dateTimer: number | undefined;
let aiPollTimer: number | undefined;

const palette = ["#26735b", "#3157c8", "#d68a2f", "#d8664f", "#7563b5", "#168294", "#7b857f"];
const topApps = computed(() => report.value?.app_stats?.slice(0, 6) || []);
const topCategories = computed(() => report.value?.category_stats?.slice(0, 6) || []);
const recentTimeline = computed(() => report.value?.timeline?.slice(-6).reverse() || []);
const activeRate = computed(() => {
  const total = report.value?.total_tracked_seconds || 0;
  return total ? Math.round((report.value!.active_seconds / total) * 100) : 0;
});
const formattedDate = computed(() => {
  const [year, month, day] = date.value.split("-").map(Number);
  if (!year || !month || !day) return date.value;
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date(year, month - 1, day));
});
const aiText = computed(() => report.value?.ai_analysis?.one_sentence_summary || report.value?.overview || "这一天还没有足够的活动数据。");
const aiSuggestions = computed(() => report.value?.ai_analysis?.suggestions?.slice(0, 3) || []);
const aiStatusText = computed(() => {
  const status = report.value?.ai_analysis?.status;
  if (!status || status === "none") return "未分析";
  if (status === "pending" || status === "running") return "分析中";
  if (status === "fallback") return "规则结果";
  if (status === "succeeded") return "已分析";
  return "分析异常";
});
const timelineSegments = computed(() => (report.value?.timeline || []).map((item, index) => {
  const start = timeToMinutes(item.start_time);
  const end = Math.max(start + 1, timeToMinutes(item.end_time));
  return {
    ...item,
    key: `${item.start_time}-${item.end_time}-${index}`,
    style: {
      left: `${Math.min(100, (start / 1440) * 100)}%`,
      width: `${Math.max(.3, ((end - start) / 1440) * 100)}%`,
      backgroundColor: categoryColor(item.category)
    }
  };
}));

function timeToMinutes(value: string): number {
  const match = value.match(/(?:T|^)(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function formatClock(value: string): string {
  const match = value.match(/(?:T|^)(\d{2}:\d{2})/);
  return match?.[1] || value.slice(0, 5);
}

function categoryColor(category: string): string {
  const index = report.value?.category_stats.findIndex((item) => item.category === category) ?? -1;
  return palette[index >= 0 ? index % palette.length : palette.length - 1];
}

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
  chart = init(chartEl.value);
  chart.setOption({
    tooltip: { trigger: "item", borderWidth: 0, backgroundColor: "#17231e", textStyle: { color: "#fff" } },
    color: palette,
    series: [{
      type: "pie",
      radius: ["62%", "84%"],
      center: ["50%", "50%"],
      minAngle: 4,
      itemStyle: { borderColor: "#fff", borderWidth: 4, borderRadius: 3 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 3 },
      data: report.value.category_stats.map((item) => ({ name: item.category, value: item.duration_seconds }))
    }]
  });
}

function resizeChart() { chart?.resize(); }

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
    <section class="day-command">
      <div class="date-context">
        <span class="date-icon"><CalendarDays :size="20" /></span>
        <div><p>当前日报</p><strong>{{ formattedDate }}</strong></div>
      </div>
      <div class="toolbar-line">
        <input v-model="date" type="date" aria-label="日报日期" />
        <button class="icon-button" type="button" title="刷新日报" :disabled="loading" @click="load()"><RefreshCw :size="18" :class="{ spinning: loading }" /></button>
        <button class="primary-button" type="button" :disabled="aiRunning || loading" @click="runAi"><Sparkles :size="17" />{{ aiRunning ? '分析中...' : 'AI 分析' }}</button>
      </div>
    </section>

    <p v-if="message" class="notice" role="status">{{ message }}</p>

    <template v-if="report">
      <section class="daily-summary surface">
        <div class="summary-copy">
          <p class="section-kicker">当天记录</p>
          <h2>{{ report.title || '一天的活动概览' }}</h2>
          <p>{{ report.overview || '活动记录已整理完成。' }}</p>
        </div>
        <dl class="summary-metrics">
          <div><dt>总记录</dt><dd>{{ formatDuration(report.total_tracked_seconds) }}</dd></div>
          <div><dt>有效活动</dt><dd>{{ formatDuration(report.active_seconds) }}</dd><small>{{ activeRate }}%</small></div>
          <div><dt>空闲</dt><dd>{{ formatDuration(report.idle_seconds) }}</dd></div>
        </dl>
      </section>

      <section class="day-rhythm surface">
        <div class="section-head">
          <div><p class="section-kicker">全天轨迹</p><h2>24 小时活动分布</h2></div>
          <span>{{ timelineSegments.length }} 段活动</span>
        </div>
        <div class="rhythm-track" aria-label="全天活动时间轨迹">
          <span v-for="segment in timelineSegments" :key="segment.key" class="rhythm-segment" :style="segment.style" :title="`${formatClock(segment.start_time)}-${formatClock(segment.end_time)} ${segment.category}`"></span>
        </div>
        <div class="rhythm-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      </section>

      <div class="home-overview">
        <section class="surface chart-card">
          <div class="section-head">
            <div><p class="section-kicker">时间构成</p><h2>活动分类</h2></div>
            <span class="status-badge">{{ activeRate }}% 活跃</span>
          </div>
          <div class="chart-layout">
            <div class="chart-wrap">
              <div ref="chartEl" class="pie-chart"></div>
              <div class="chart-center"><strong>{{ formatDuration(report.total_tracked_seconds) }}</strong><span>已记录</span></div>
            </div>
            <div class="category-list">
              <div v-for="(item, index) in topCategories" :key="item.category" class="category-row">
                <span><i :style="{ backgroundColor: palette[index % palette.length] }"></i>{{ item.category }}</span>
                <strong>{{ item.percentage }}%</strong>
              </div>
              <p v-if="!topCategories.length" class="empty-text">暂无分类数据</p>
            </div>
          </div>
        </section>

        <section class="surface ai-brief">
          <div class="section-head">
            <div><p class="section-kicker">AI 复盘</p><h2>今日观察</h2></div>
            <span class="status-badge" :class="{ success: aiStatusText === '已分析', warning: aiStatusText === '未分析' }">{{ aiStatusText }}</span>
          </div>
          <blockquote>{{ aiText }}</blockquote>
          <ul v-if="aiSuggestions.length" class="suggestion-list">
            <li v-for="suggestion in aiSuggestions" :key="suggestion">{{ suggestion }}</li>
          </ul>
          <p v-else class="brief-foot">运行 AI 分析后，这里会给出更具体的复盘建议。</p>
        </section>
      </div>

      <div class="content-grid">
        <section class="surface app-stat-card">
          <div class="section-head"><div><p class="section-kicker">投入去向</p><h2>常用应用</h2></div></div>
          <div v-for="app in topApps" :key="app.app_name" class="progress-row">
            <div class="progress-label"><span>{{ app.app_name }}</span><strong>{{ formatDuration(app.duration_seconds) }}</strong></div>
            <div class="progress-track"><i :style="{ width: `${Math.max(app.percentage, 3)}%` }"></i></div>
          </div>
          <p v-if="!topApps.length" class="empty-text">暂无应用统计</p>
        </section>

        <section class="surface timeline-card">
          <div class="section-head"><div><p class="section-kicker">最近发生</p><h2>活动记录</h2></div><RouterLink class="inline-link" to="/records">查看全部</RouterLink></div>
          <article v-for="item in recentTimeline" :key="item.start_time + item.summary" class="timeline-item">
            <time>{{ formatClock(item.start_time) }}<small>{{ formatClock(item.end_time) }}</small></time>
            <div><span class="category-label">{{ item.category }}</span><p>{{ item.summary }}</p><small>{{ item.app_name || '未知应用' }}</small></div>
          </article>
          <p v-if="!recentTimeline.length" class="empty-text">当天暂无记录</p>
        </section>
      </div>
    </template>

    <section v-if="loading && !report" class="surface loading-state">正在整理日报...</section>
  </section>
</template>

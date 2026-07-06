const $ = (id) => document.getElementById(id);
const DONUT_COLORS = ["#147c72", "#315f9f", "#b7791f", "#8b5cf6", "#d14b3f", "#2f855a", "#0f766e", "#64748b"];

const state = {
  token: localStorage.getItem("access_token") || "",
  deviceId: localStorage.getItem("device_id") || "",
  email: localStorage.getItem("user_email") || "",
  authMode: "login",
  view: initialView(),
  records: [],
};

function initialView() {
  if (window.location.pathname === "/records") return "records";
  if (window.location.pathname === "/api-keys") return "apiKeys";
  if (window.location.hash === "#/records") return "records";
  if (window.location.hash === "#/api-keys") return "apiKeys";
  return "home";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function summaryHtml(value = "") {
  const parts = String(value || "").split(/[；;]+/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";
  return parts.map((part) => `<span class="summary-line">${escapeHtml(part)}</span>`).join("");
}
function shanghaiDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function shanghaiTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(11, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

$("dateInput").value = shanghaiDate();

function friendlyErrorMessage(message, code) {
  if (code === "API_KEY_REQUIRED") return "\u8bf7\u5148\u5728 API \u7ba1\u7406\u4e2d\u914d\u7f6e DeepSeek API Key";
  if (message === "bad credentials" || message === "邮箱或密码不正确" || (code === "UNAUTHORIZED" && message !== "expired token" && message !== "missing bearer token")) return "邮箱或密码不正确";
  if (message === "email exists or invalid params") return "邮箱已存在或输入格式不正确";
  if (message === "missing bearer token" || message === "expired token") return "登录已过期，请重新登录";
  return message || "请求失败，请稍后重试";
}

function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return fetch(path, { ...options, headers }).then(async (res) => {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const code = data?.detail?.code || data?.error?.code;
      const message = data?.detail?.message || data?.error?.message || res.statusText;
      throw new Error(friendlyErrorMessage(message, code));
    }
    return data;
  });
}

function showDashboard(show) {
  $("auth").hidden = show;
  $("dashboard").hidden = !show;
  if (show) updateUserMenu();
}

function userInitial(email) {
  return (email || "U").trim().slice(0, 1).toUpperCase() || "U";
}

function updateUserMenu() {
  const email = state.email || localStorage.getItem("user_email") || "";
  const display = email || "当前用户";
  $("userName").textContent = display;
  $("userEmail").textContent = display;
  document.querySelector(".user-avatar").textContent = userInitial(email);
}

function setView(view, push = false) {
  state.view = view;
  localStorage.setItem("active_view", view);
  const targetPath = view === "records" ? "/records" : view === "apiKeys" ? "/api-keys" : "/home";
  if (push && window.location.pathname !== targetPath) history.pushState({ view }, "", targetPath);
  $("homeView").hidden = view !== "home";
  $("recordsView").hidden = view !== "records";
  $("apiKeysView").hidden = view !== "apiKeys";
  $("homeNav").classList.toggle("active", view === "home");
  $("recordsNav").classList.toggle("active", view === "records");
  $("apiKeysNav").classList.toggle("active", view === "apiKeys");
  $("viewEyebrow").textContent = view === "records" ? "记录管理" : view === "apiKeys" ? "API 管理" : "首页";
  $("viewTitle").textContent = view === "records" ? "活动记录管理" : view === "apiKeys" ? "API 管理" : "活动总览";
  if (view === "records") void loadRecords();
  if (view === "apiKeys") void loadApiKeyStatus();
}
function seconds(value) {
  const total = Number(value || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h) return `${h} 小时 ${m} 分钟`;
  return `${m} 分钟`;
}

function renderBars(id, rows, labelKey) {
  const box = $(id);
  box.innerHTML = "";
  if (!rows.length) {
    box.innerHTML = '<p class="empty">暂无统计</p>';
    return;
  }
  rows.forEach((row) => {
    const el = document.createElement("div");
    el.className = "bar";
    const label = escapeHtml(row[labelKey] || "未命名");
    const duration = escapeHtml(seconds(row.duration_seconds));
    const percentage = Math.min(Number(row.percentage || 0), 100);
    el.innerHTML = `<label><span class="bar-name">${label}</span><span class="bar-value">${duration}</span></label><div class="bar-track"><span style="width:${percentage}%"></span></div>`;
    box.appendChild(el);
  });
}

function renderCategoryDonut(report) {
  const rows = (report.category_stats || []).filter((row) => Number(row.duration_seconds || 0) > 0);
  const total = rows.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0);
  const donut = $("categoryDonut");
  $("donutTotal").textContent = seconds(total);
  if (!rows.length || !total) {
    donut.style.background = "#e6edf5";
    $("categoryLegend").innerHTML = '<p class="empty">暂无分类数据</p>';
    return;
  }

  let cursor = 0;
  const segments = rows.map((row, index) => {
    const color = DONUT_COLORS[index % DONUT_COLORS.length];
    const percentage = Number(row.duration_seconds || 0) / total * 100;
    const start = cursor;
    cursor += percentage;
    return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  if (cursor < 100) segments.push(`#e6edf5 ${cursor.toFixed(2)}% 100%`);
  donut.style.background = `conic-gradient(${segments.join(", ")})`;
  $("categoryLegend").innerHTML = rows.map((row, index) => {
    const color = DONUT_COLORS[index % DONUT_COLORS.length];
    const percentage = total ? Math.round(Number(row.duration_seconds || 0) / total * 100) : 0;
    return `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${color}"></span>
        <span class="legend-name">${escapeHtml(row.category || "未分类")}</span>
        <strong>${seconds(row.duration_seconds || 0)}</strong>
        <em>${percentage}%</em>
      </div>
    `;
  }).join("");
}

function renderReport(report) {
  const timeline = report.timeline || [];
  $("reportTitle").textContent = report.title || "今日活动概览";
  $("overview").textContent = report.overview || "暂无概览，等待客户端同步更多活动记录。";
  $("timelineCount").textContent = `${timeline.length} 段`;
  $("staleBadge").textContent = report.is_stale ? "记录已变化" : "";
  renderCategoryDonut(report);
  $("stats").innerHTML = [
    ["记录总时长", report.total_tracked_seconds],
    ["有效活动", report.active_seconds],
    ["空闲时长", report.idle_seconds],
    ["隐私时长", report.private_seconds],
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${seconds(value || 0)}</strong></div>`).join("");
  $("timeline").innerHTML = timeline.length
    ? timeline.map((item) => `
      <div class="item">
        <time>${escapeHtml(item.start_time)}-${escapeHtml(item.end_time)} · ${escapeHtml(item.category)} · ${seconds(item.duration_seconds || 0)}</time>
        <strong class="summary-text">${summaryHtml(item.summary)}</strong>
        <div>${escapeHtml(item.app_name || "")}</div>
      </div>
    `).join("")
    : '<p class="empty">暂无时间线</p>';
  renderBars("categories", report.category_stats || [], "category");
  renderBars("apps", report.app_stats || [], "app_name");

  const ai = report.ai_analysis || {};
  $("aiStatus").textContent = ai.status ? `${ai.status}${ai.model_name ? ` · ${ai.model_name}` : ""}` : "尚未分析";
  $("aiTitle").textContent = ai.title || "";
  $("aiSummary").textContent = ai.one_sentence_summary || "暂无 AI 分析结果。";
  $("suggestions").innerHTML = (ai.suggestions || []).length
    ? (ai.suggestions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : '<li class="empty">暂无建议</li>';
  $("exportMd").href = `/api/v1/daily-reports/${$("dateInput").value}/export?format=markdown`;
}

async function loadApiKeyStatus() {
  try {
    const res = await api("/api/v1/api-keys/deepseek");
    const data = res.data;
    const configured = Boolean(data.configured);
    const statusText = configured ? "已配置" : "未配置";
    $("apiKeyBadge").textContent = statusText;
    $("apiKeyStatusText").textContent = statusText;
    $("apiKeyHint").textContent = data.key_hint || "暂无";
    $("deepseekApiKey").value = "";
    $("apiKeyMessage").textContent = "";
  } catch (error) {
    $("apiKeyMessage").textContent = error.message || "加载 API Key 状态失败";
  }
}

async function saveApiKey(event) {
  event.preventDefault();
  const value = $("deepseekApiKey").value.trim();
  if (!value) {
    $("apiKeyMessage").textContent = "请先输入 API Key";
    return;
  }
  const res = await api("/api/v1/api-keys/deepseek", {
    method: "PUT",
    body: JSON.stringify({ api_key: value }),
  });
  $("apiKeyMessage").textContent = "API Key 已保存";
  $("apiKeyHint").textContent = res.data.key_hint || "";
  $("apiKeyBadge").textContent = "已配置";
  $("apiKeyStatusText").textContent = "已配置";
  $("deepseekApiKey").value = "";
}

async function deleteApiKey() {
  await api("/api/v1/api-keys/deepseek", { method: "DELETE" });
  $("apiKeyMessage").textContent = "已删除保存的 API Key";
  await loadApiKeyStatus();
}

async function loadRecords() {
  const date = $("dateInput").value;
  const res = await api(`/api/v1/activity-records?date=${date}&page_size=200`);
  state.records = res.data.records || [];
  $("recordCount").textContent = `${state.records.length} 条`;
  $("records").innerHTML = state.records.length
    ? state.records.map((record) => `
      <div class="record" data-id="${escapeHtml(record.id)}">
        <time>${shanghaiTime(record.start_time)}-${shanghaiTime(record.end_time)}</time>
        <span class="category">${escapeHtml(record.category || "其他")}</span>
        <span class="app-name">${escapeHtml(record.app_name || "未命名应用")}</span>
        <strong class="summary-text">${summaryHtml(record.summary)}</strong>
        <button class="danger delete" type="button">删除</button>
      </div>
    `).join("")
    : '<p class="empty" style="padding:18px">当前日期暂无活动记录</p>';
}

async function loadReport() {
  const date = $("dateInput").value;
  const res = await api(`/api/v1/daily-reports/${date}?include_ai_analysis=true`);
  renderReport(res.data);
  await loadRecords();
}

async function ensureApiKeyBeforeAi() {
  const message = "\u8bf7\u5148\u5728 API \u7ba1\u7406\u4e2d\u914d\u7f6e DeepSeek API Key";
  const res = await api("/api/v1/api-keys/deepseek");
  if (res.data?.configured) return true;
  $("aiStatus").textContent = "\u672a\u914d\u7f6e API Key";
  $("aiTitle").textContent = "";
  $("aiSummary").textContent = message;
  $("suggestions").innerHTML = `<li class="empty">${message}</li>`;
  return false;
}
async function startAi() {
  $("aiBtn").disabled = true;
  $("aiBtn").textContent = "正在分析";
  try {
    const canAnalyze = await ensureApiKeyBeforeAi();
    if (!canAnalyze) return;
    const date = $("dateInput").value;
    const res = await api(`/api/v1/daily-reports/${date}/ai-analysis`, {
      method: "POST",
      body: JSON.stringify({ model: $("modelSelect").value, force_regenerate: true }),
    });
    await pollJob(res.data.job_id);
  } finally {
    $("aiBtn").disabled = false;
    $("aiBtn").textContent = "AI 分析";
  }
}

async function pollJob(jobId) {
  for (let i = 0; i < 20; i++) {
    const res = await api(`/api/v1/ai-analysis-jobs/${jobId}`);
    if (!["pending", "running"].includes(res.data.status)) {
      await loadReport();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await loadReport();
}

$("loginTab").onclick = () => {
  state.authMode = "login";
  $("loginTab").classList.add("active");
  $("registerTab").classList.remove("active");
  $("usernameRow").hidden = true;
  $("password").autocomplete = "current-password";
  $("authSubmit").textContent = "登录";
};
$("registerTab").onclick = () => {
  state.authMode = "register";
  $("registerTab").classList.add("active");
  $("loginTab").classList.remove("active");
  $("usernameRow").hidden = false;
  $("password").autocomplete = "new-password";
  $("authSubmit").textContent = "注册并登录";
};

$("authForm").onsubmit = async (event) => {
  event.preventDefault();
  $("authMessage").textContent = "";
  try {
    if (state.authMode === "register") {
      await api("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: $("email").value, username: $("username").value, password: $("password").value }),
      });
    }
    const res = await api("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("email").value, password: $("password").value }),
    });
    state.token = res.data.access_token;
    state.email = $("email").value.trim();
    localStorage.setItem("access_token", state.token);
    localStorage.setItem("user_email", state.email);
    showDashboard(true);
    setView(state.view === "records" ? "records" : state.view === "apiKeys" ? "apiKeys" : "home", true);
    await loadReport();
  } catch (error) {
    $("authMessage").textContent = error.message;
  }
};

$("logoutBtn").onclick = () => {
  localStorage.clear();
  state.token = "";
  state.deviceId = "";
  state.email = "";
  $("userMenu").open = false;
  showDashboard(false);
};

$("homeNav").onclick = (event) => {
  event.preventDefault();
  setView("home", true);
};
$("recordsNav").onclick = (event) => {
  event.preventDefault();
  setView("records", true);
};
$("apiKeysNav").onclick = (event) => {
  event.preventDefault();
  setView("apiKeys", true);
};
window.onpopstate = () => setView(initialView());
$("loadReportBtn").onclick = loadReport;
$("dateInput").onchange = loadReport;
$("aiBtn").onclick = startAi;
$("apiKeyForm").onsubmit = saveApiKey;
$("deleteApiKeyBtn").onclick = deleteApiKey;
$("records").onclick = async (event) => {
  const row = event.target.closest(".record");
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.classList.contains("delete")) {
    await api(`/api/v1/activity-records/${id}`, { method: "DELETE" });
    await loadReport();
  }
};

if (state.token) {
  showDashboard(true);
  setView(state.view === "records" ? "records" : state.view === "apiKeys" ? "apiKeys" : "home");
  loadReport().catch(() => showDashboard(false));
} else {
  showDashboard(false);
}

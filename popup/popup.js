// 팝업 — 켜기/끄기, 현재 탭에 맞는 규칙 확인·추가·수정

let config = null;
let tabUrl = "";
let editing = null; // 현재 탭에 맞은 규칙 (없으면 새 규칙 추가)

const $ = (id) => document.getElementById(id);

function renderEnabled() {
  $("enabled").checked = config.enabled;
  $("enabled-text").textContent = config.enabled ? "켜짐" : "꺼짐";
}

function renderCurrent() {
  $("current-url").textContent = tabUrl || "(알 수 없음)";
  const status = $("current-status");
  status.classList.remove("hit");

  if (!isTargetUrl(tabUrl)) {
    status.textContent = "적용 대상이 아닌 페이지";
    $("rule-form").classList.add("hidden");
    $("unsupported").classList.remove("hidden");
    return;
  }

  editing = findRule(config.rules, tabUrl);
  if (!config.enabled) {
    status.textContent = "꺼져 있음 — 원래 제목 그대로";
  } else if (editing) {
    status.classList.add("hit");
    status.textContent = `규칙 적용 중 → "${editing.title}"`;
  } else {
    status.textContent = `프리픽스 적용 → "${config.prefix}…"`;
  }

  $("form-title").textContent = editing ? "적용 중인 규칙 수정" : "이 페이지 규칙 추가";
  $("save-btn").textContent = editing ? "저장" : "추가";
  $("delete-btn").classList.toggle("hidden", !editing);
  $("match").value = editing ? editing.match : "contains";
  $("pattern").value = editing ? editing.pattern : suggestPattern(tabUrl);
  $("title").value = editing ? editing.title : "";
}

// 쿼리·해시는 바뀌기 쉬우니 기본 제안은 origin + path 까지
function suggestPattern(url) {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.origin : u.origin + u.pathname;
  } catch (e) {
    return url;
  }
}

async function save() {
  const match = $("match").value;
  const pattern = $("pattern").value.trim();
  const title = $("title").value.trim();
  const error = $("form-error");
  error.textContent = "";

  if (!pattern) return (error.textContent = "URL 패턴을 입력하세요");
  if (!title) return (error.textContent = "탭 제목을 입력하세요");
  if (match === "regex" && !compileRegex(pattern)) return (error.textContent = "정규식이 올바르지 않습니다");

  if (editing) {
    Object.assign(editing, { match, pattern, title });
  } else {
    // 새 규칙은 맨 위에 둔다 — 지금 페이지에 바로 적용되도록 (아래 규칙보다 우선)
    config.rules.unshift(makeRule(pattern, title, match));
  }
  await saveConfig(config);
  renderCurrent();
  if (!ruleMatches({ enabled: true, match, pattern }, tabUrl)) {
    error.textContent = "저장했지만 이 패턴은 현재 URL 에 맞지 않습니다";
  }
}

async function remove() {
  if (!editing || !confirm(`'${editing.title}' 규칙을 삭제할까요?`)) return;
  config.rules = config.rules.filter((r) => r.id !== editing.id);
  await saveConfig(config);
  renderCurrent();
}

async function init() {
  config = await loadConfig();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabUrl = (tab && tab.url) || "";

  for (const [value, label] of Object.entries(MATCH_TYPES)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    $("match").appendChild(opt);
  }

  renderEnabled();
  renderCurrent();

  $("enabled").addEventListener("change", async (e) => {
    config.enabled = e.target.checked;
    await saveConfig(config);
    renderEnabled();
    renderCurrent();
  });
  $("save-btn").addEventListener("click", save);
  $("delete-btn").addEventListener("click", remove);
  $("title").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) save();
  });
  $("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
}

init();

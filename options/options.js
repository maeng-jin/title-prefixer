// 관리 페이지 — 프리픽스·URL 규칙·제외 키워드 편집
//
// 바꾸는 즉시 자동 저장한다. 저장되면 background.js 가 열려 있는 탭에도 바로 반영한다.

let config = null;
let lastSavedJson = "";
let saveTimer = null;
let dragId = null;

const $ = (id) => document.getElementById(id);

// ── 저장 ──
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

async function saveNow() {
  clearTimeout(saveTimer);
  const normalized = normalizeConfig(config);
  lastSavedJson = JSON.stringify(normalized);
  await saveConfig(normalized);
  toast("저장됨");
}

let toastTimer = null;
function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("err", isError);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), isError ? 3500 : 1200);
}

// ── 기본 동작 ──
function renderBasics() {
  $("enabled").checked = config.enabled;
  $("enabled-text").textContent = config.enabled ? "켜짐" : "꺼짐 — 모든 탭의 제목을 원래대로 둡니다";
  $("prefix").value = config.prefix;
  $("append-date").checked = config.appendDateTime;
  renderPreview();
}

function renderPreview() {
  const sample = "페이지 제목";
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const day = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  const stamp = config.appendDateTime
    ? ` | ${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())} (${day}) ${p(d.getHours())}:${p(d.getMinutes())}`
    : "";
  $("prefix-preview").textContent = config.prefix + sample + stamp;
}

// ── URL 규칙 ──
function renderRules() {
  const body = $("rule-body");
  body.textContent = "";
  for (const rule of config.rules) body.appendChild(buildRuleRow(rule));
  $("rule-count").textContent = `${config.rules.length}개`;
  $("rule-empty").classList.toggle("hidden", config.rules.length > 0);
  renderTest();
}

function buildRuleRow(rule) {
  const tr = document.createElement("tr");
  tr.className = "rule-row" + (rule.enabled ? "" : " off");
  tr.dataset.id = rule.id;

  // 핸들
  const grip = document.createElement("td");
  grip.className = "grip";
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⠿";
  handle.title = "끌어서 순서 변경";
  handle.addEventListener("mousedown", () => { tr.draggable = true; });
  grip.appendChild(handle);

  // 사용
  const onTd = document.createElement("td");
  onTd.className = "col-on";
  const on = document.createElement("input");
  on.type = "checkbox";
  on.checked = rule.enabled;
  on.addEventListener("change", () => {
    rule.enabled = on.checked;
    tr.classList.toggle("off", !rule.enabled);
    renderTest();
    scheduleSave();
  });
  onTd.appendChild(on);

  // 방식
  const matchTd = document.createElement("td");
  const match = document.createElement("select");
  for (const [value, label] of Object.entries(MATCH_TYPES)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    match.appendChild(opt);
  }
  match.value = rule.match;
  matchTd.appendChild(match);

  // 패턴
  const patternTd = document.createElement("td");
  const pattern = document.createElement("input");
  pattern.type = "text";
  pattern.value = rule.pattern;
  pattern.placeholder = "https://example.com/path";
  patternTd.appendChild(pattern);

  const validate = () => {
    const bad = !rule.pattern || (rule.match === "regex" && !compileRegex(rule.pattern));
    pattern.classList.toggle("invalid", bad);
    pattern.title = bad ? (rule.pattern ? "정규식이 올바르지 않습니다" : "패턴을 입력하세요") : "";
  };
  validate();
  match.addEventListener("change", () => {
    rule.match = match.value;
    validate();
    renderTest();
    scheduleSave();
  });
  pattern.addEventListener("input", () => {
    rule.pattern = pattern.value.trim();
    validate();
    renderTest();
    scheduleSave();
  });

  // 제목
  const titleTd = document.createElement("td");
  const title = document.createElement("input");
  title.type = "text";
  title.value = rule.title;
  title.placeholder = "탭 제목";
  title.addEventListener("input", () => {
    rule.title = title.value;
    renderTest();
    scheduleSave();
  });
  titleTd.appendChild(title);

  // 삭제
  const actTd = document.createElement("td");
  actTd.className = "actions";
  const del = document.createElement("button");
  del.className = "small danger";
  del.textContent = "삭제";
  del.addEventListener("click", () => {
    if (!confirm(`'${rule.title || rule.pattern}' 규칙을 삭제할까요?`)) return;
    config.rules = config.rules.filter((r) => r.id !== rule.id);
    renderRules();
    saveNow();
  });
  actTd.appendChild(del);

  // 드래그앤드롭
  tr.addEventListener("dragstart", (e) => {
    dragId = rule.id;
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  tr.addEventListener("dragend", () => {
    tr.draggable = false;
    dragId = null;
    tr.classList.remove("dragging");
    clearDropMarks();
  });
  tr.addEventListener("dragover", (e) => {
    if (!dragId || dragId === rule.id) return;
    e.preventDefault();
    const after = isLowerHalf(e, tr);
    clearDropMarks();
    tr.classList.add(after ? "drop-after" : "drop-before");
  });
  tr.addEventListener("drop", (e) => {
    if (!dragId || dragId === rule.id) return;
    e.preventDefault();
    config.rules = moveById(config.rules, dragId, rule.id, isLowerHalf(e, tr));
    renderRules();
    saveNow();
  });

  tr.append(grip, onTd, matchTd, patternTd, titleTd, actTd);
  return tr;
}

function isLowerHalf(e, el) {
  const rect = el.getBoundingClientRect();
  return e.clientY > rect.top + rect.height / 2;
}

function clearDropMarks() {
  document.querySelectorAll(".drop-before, .drop-after").forEach((el) => {
    el.classList.remove("drop-before", "drop-after");
  });
}

function moveById(list, srcId, targetId, after) {
  const src = list.find((x) => x.id === srcId);
  if (!src) return list;
  const rest = list.filter((x) => x.id !== srcId);
  const idx = rest.findIndex((x) => x.id === targetId);
  if (idx < 0) return list;
  rest.splice(after ? idx + 1 : idx, 0, src);
  return rest;
}

function addRule() {
  const rule = makeRule("", "");
  config.rules.unshift(rule);
  renderRules();
  const row = document.querySelector(`tr[data-id="${rule.id}"] td:nth-child(4) input`);
  if (row) row.focus();
  // 빈 패턴 규칙은 아무 URL 에도 맞지 않으므로 저장해도 무해하다
  scheduleSave();
}

// ── 규칙 테스트 ──
function renderTest() {
  const url = $("test-url").value.trim();
  const result = $("test-result");
  document.querySelectorAll("tr.rule-row.hit").forEach((el) => el.classList.remove("hit"));
  result.className = "hint";
  if (!url) {
    result.textContent = "";
    return;
  }
  const rule = findRule(config.rules, url);
  if (rule) {
    result.classList.add("ok");
    result.textContent = `→ "${rule.title}" (${config.rules.indexOf(rule) + 1}번째 규칙)`;
    const tr = document.querySelector(`tr[data-id="${rule.id}"]`);
    if (tr) tr.classList.add("hit");
  } else {
    result.textContent = "→ 맞는 규칙 없음 (프리픽스 적용)";
  }
}

// ── 제외 키워드 ──
function renderKeywords() {
  const list = $("keyword-list");
  list.textContent = "";
  for (const keyword of config.excludedKeywords) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = keyword;
    const x = document.createElement("button");
    x.textContent = "✕";
    x.title = "삭제";
    x.addEventListener("click", () => {
      config.excludedKeywords = config.excludedKeywords.filter((k) => k !== keyword);
      renderKeywords();
      saveNow();
    });
    chip.appendChild(x);
    list.appendChild(chip);
  }
  if (!config.excludedKeywords.length) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "제외 키워드가 없습니다.";
    list.appendChild(empty);
  }
}

function addKeyword() {
  const input = $("keyword-input");
  const value = input.value.trim();
  if (!value) return;
  if (config.excludedKeywords.includes(value)) {
    toast("이미 있는 키워드입니다", true);
    return;
  }
  config.excludedKeywords.push(value);
  input.value = "";
  renderKeywords();
  saveNow();
}

// ── 내보내기 / 가져오기 ──
function exportConfig() {
  const data = JSON.stringify(normalizeConfig(config), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  a.href = url;
  a.download = `title-prefixer-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 내보낸 설정 파일 외에 { "URL": "제목", ... } 형태의 단순 맵도 받는다
function parseImport(json) {
  if (json && Array.isArray(json.rules)) return normalizeConfig(json);
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const entries = Object.entries(json).filter(([, v]) => typeof v === "string");
    if (entries.length) {
      return { ...config, rules: entries.map(([pattern, title]) => makeRule(pattern, title)) };
    }
  }
  throw new Error("형식이 올바르지 않습니다");
}

async function importConfig(file) {
  try {
    const next = parseImport(JSON.parse(await file.text()));
    if (!confirm(`규칙 ${next.rules.length}개를 가져옵니다. 지금 설정을 덮어쓸까요?`)) return;
    config = next;
    renderAll();
    await saveNow();
  } catch (e) {
    toast("가져오기 실패: " + e.message, true);
  }
}

// ── 테마 ──
async function initTheme() {
  const select = $("theme");
  select.value = await readTheme();
  select.addEventListener("change", async () => {
    const res = await chrome.storage.local.get(THEME_SETTINGS_KEY);
    const settings = res[THEME_SETTINGS_KEY] || {};
    settings.theme = select.value;
    await chrome.storage.local.set({ [THEME_SETTINGS_KEY]: settings });
  });
}

function renderAll() {
  renderBasics();
  renderRules();
  renderKeywords();
}

async function init() {
  $("version").textContent = "v" + chrome.runtime.getManifest().version;
  config = await loadConfig();
  lastSavedJson = JSON.stringify(config);
  renderAll();
  initTheme();

  $("enabled").addEventListener("change", (e) => {
    config.enabled = e.target.checked;
    renderBasics();
    saveNow();
  });
  $("prefix").addEventListener("input", (e) => {
    config.prefix = e.target.value;
    renderPreview();
    scheduleSave();
  });
  $("append-date").addEventListener("change", (e) => {
    config.appendDateTime = e.target.checked;
    renderPreview();
    saveNow();
  });
  $("add-rule").addEventListener("click", addRule);
  $("test-url").addEventListener("input", renderTest);
  $("keyword-add").addEventListener("click", addKeyword);
  $("keyword-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) addKeyword();
  });
  $("export-btn").addEventListener("click", exportConfig);
  $("import-btn").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) importConfig(file);
  });
  $("reset-btn").addEventListener("click", async () => {
    if (!confirm("모든 설정을 기본값으로 되돌릴까요? 추가한 규칙은 사라집니다.")) return;
    config = defaultConfig();
    renderAll();
    await saveNow();
  });

  // 팝업에서 규칙을 추가하는 등 다른 화면에서 바뀐 경우 다시 읽는다
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_KEY]) return;
    const incoming = normalizeConfig(changes[CONFIG_KEY].newValue);
    if (JSON.stringify(incoming) === lastSavedJson) return; // 내가 저장한 것
    config = incoming;
    lastSavedJson = JSON.stringify(incoming);
    renderAll();
  });
}

init();

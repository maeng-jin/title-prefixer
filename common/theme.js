// 테마 적용 — 라이트 / 다크 / 시스템(기본)
//
// "시스템"일 때는 data-theme 을 지우고 CSS 의 prefers-color-scheme 에 맡긴다.
// 그래서 시스템 설정을 쓰는 사용자는 첫 페인트부터 올바른 색이라 깜빡임이 없다.
// 라이트·다크를 직접 고른 경우에만 data-theme 을 붙여 미디어 쿼리를 덮어쓴다.
//

const THEME_SETTINGS_KEY = "settings";
const THEME_VALUES = ["system", "light", "dark"];

function normalizeTheme(value) {
  return THEME_VALUES.includes(value) ? value : "system";
}

async function readTheme() {
  try {
    const res = await chrome.storage.local.get(THEME_SETTINGS_KEY);
    return normalizeTheme(res[THEME_SETTINGS_KEY] && res[THEME_SETTINGS_KEY].theme);
  } catch (e) {
    return "system";
  }
}

function setThemeAttribute(theme) {
  const root = document.documentElement;
  if (normalizeTheme(theme) === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

async function applyTheme() {
  const theme = await readTheme();
  if (typeof bootMark === "function") bootMark("테마 설정 읽기");
  setThemeAttribute(theme);
}

// 다른 화면(관리 페이지)에서 테마를 바꾸면 열려 있는 화면도 바로 따라간다
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[THEME_SETTINGS_KEY]) applyTheme();
  });
} catch (e) {}

applyTheme();

// 탭 제목 바꾸기 — 설정은 common/config.js (관리 페이지에서 편집)

importScripts("common/config.js");

chrome.runtime.onInstalled.addListener(async () => {
  const res = await chrome.storage.local.get(CONFIG_KEY);
  if (res[CONFIG_KEY]) return; // 이미 설정이 있으면 건드리지 않는다

  // 1.0 은 프리픽스만 sync 에 저장했다. 사용자가 바꿔 둔 값이 있으면 이어받는다.
  const config = defaultConfig();
  try {
    const legacy = await chrome.storage.sync.get("prefix");
    if (typeof legacy.prefix === "string") config.prefix = legacy.prefix;
  } catch (e) {}
  await saveConfig(config);
});

async function applyToTab(tabId, url, config) {
  if (!isTargetUrl(url)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: applyTitle,
      args: [buildTitleOptions(config, url)],
    });
  } catch (e) {
    // 웹스토어·오류 페이지 등 주입이 막힌 탭은 무시
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // loading: 기존과 같은 시점 / complete: 늦게 정해지는 제목 / title: 페이지가 제목을 바꾼 경우(SPA)
  if (changeInfo.status !== "loading" && changeInfo.status !== "complete" && changeInfo.title === undefined) return;
  applyToTab(tabId, tab.url, await loadConfig());
});

// 설정을 바꾸면 열려 있는 탭에도 바로 반영한다
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes[CONFIG_KEY]) return;
  const config = normalizeConfig(changes[CONFIG_KEY].newValue);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) applyToTab(tab.id, tab.url, config);
});

// 아래 함수가 탭에 주입된다. 바깥 변수를 참조할 수 없으므로 필요한 값은 opts 로 받는다.
//   opts === null            → 원래 제목으로 되돌림 (확장 꺼짐)
//   opts.fixedTitle          → URL 규칙에 맞은 고정 제목
//   opts.prefix 등           → 프리픽스 + 원래 제목 (+ 날짜)
//
// 원래 제목을 기억해 두므로 설정을 바꿔 다시 적용해도 프리픽스가 겹쳐 붙지 않는다.
// 현재 제목이 마지막으로 우리가 넣은 값과 다르면 페이지가 제목을 바꾼 것이므로 원래 제목을 갱신한다.
function applyTitle(opts) {
  const formatNow = () => {
    const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `${yy}.${mm}.${dd} (${weekDays[now.getDay()]}) ${hh}:${min}`;
  };

  const update = () => {
    const current = document.title;
    if (window.__tpApplied === undefined || current !== window.__tpApplied) {
      window.__tpOriginal = current;
    }
    const original = window.__tpOriginal;

    let next = original;
    if (opts && typeof opts.fixedTitle === "string") {
      next = opts.fixedTitle;
    } else if (opts) {
      const excluded = opts.excludedKeywords.some((k) => original.includes(k));
      const already = opts.prefix && original.startsWith(opts.prefix);
      if (!excluded && !already && original) {
        // 날짜는 페이지를 처음 처리한 시각으로 고정한다 (설정을 바꿔도 시각이 바뀌지 않게)
        if (!window.__tpStamp) window.__tpStamp = formatNow();
        next = opts.prefix + original + (opts.appendDateTime ? " | " + window.__tpStamp : "");
      }
    }

    window.__tpApplied = next;
    if (document.title !== next) document.title = next;
  };

  // 설정이 연달아 바뀌면 앞서 걸어 둔 3초 뒤 재실행이 옛 설정으로 덮어쓰지 않게 한다
  const gen = (window.__tpGen || 0) + 1;
  window.__tpGen = gen;

  update();
  // 페이지 스크립트가 제목을 늦게 정하는 경우를 위해 3초 뒤 한 번 더
  setTimeout(() => {
    if (window.__tpGen === gen) update();
  }, 3000);
}

// 설정 저장소 — 백그라운드·팝업·관리 페이지 공용
//
// 예전에는 프리픽스만 storage 에 두고 URL 규칙·제외 키워드는 background.js 에 하드코딩했다.
// 이제는 전부 chrome.storage.local 의 "config" 하나에 둔다.
// (sync 는 항목당 8KB 제한이 있어 규칙이 늘면 저장이 실패한다. 기기 간 이동은 내보내기/가져오기로)

const CONFIG_KEY = "config";

// 규칙 매칭 방식
const MATCH_TYPES = {
  contains: "포함",
  prefix: "시작",
  regex: "정규식",
};

// 기존 background.js 에 하드코딩돼 있던 값. 처음 설치(또는 이 버전으로 업데이트)할 때 한 번 채운다.
// 위에 있는 규칙이 먼저 적용되므로 더 구체적인 URL 을 위에 둔다.
const LEGACY_URL_TITLE_MAP = [
  ["http://localhost:8081/swagger-ui/index.html", "ps s local"],
  ["https://papi.dev.cats4me.net/swagger-ui/index.html", "ps s dev"],
  ["http://localhost:8060/swagger-ui/index.html", "bbs s local"],
  ["https://bbs.dev.cats4me.biz/swagger-ui/index.html", "bbs s dev"],
  ["https://ref-gw.dev.cats4me.net/swagger-ui/index.html", "ref-gw s dev"],
  ["http://localhost:8070/swagger-ui/index.html", "ss s local"],
  ["https://ses.dev.cats4me.net/swagger-ui/index.html", "ses s dev"],
  ["https://icms-gw.dev.cats4me.net/swagger-ui/index.html", "icms-gw s dev"],
  ["https://icms-adm.dev.cats4me.net/swagger-ui/index.html", "icms-adm s dev"],
  ["http://localhost:8090/swagger-ui/index.html", "icms s local"],
  ["https://file.dev.cats4me.net/swagger-ui/", "cfs s dev"],
  ["http://localhost:8100/swagger-ui/index.html#/", "cfs s local"],
  ["https://bill-int.dev.cats4me.net/swagger-ui/index.html", "bill s dev"],
  ["https://cas-adm.dev.cats4me.biz/member/swagger-ui/index.html#/", "cas-adm s dev"],
  ["http://localhost:9010/swagger-ui/index.html", "cas-adm member s local"],
  ["https://parents.dev.cats4me.net", "ps dev"],
  ["https://parents.cats4me.net", "ps prod"],
  ["https://teach.dev.cats4me.net", "ts dev"],
  ["https://teach.cats4me.net", "ts prod"],
  ["https://pinpoint.prod.cats4me.net/main/cats-service-parents-api", "ps pin prod"],
  ["https://pinpoint.prod.cats4me.net/transactionList/cats-service-parents-api", "ps pin prod"],
  ["https://pinpoint.prod.cats4me.net/main/cats-service-study", "ss pin prod"],
  ["https://pinpoint.prod.cats4me.net/transactionList/cats-service-study", "ss pin prod"],
  ["https://icms.dev.cats4me.net", "icms dev"],
  ["https://icms.cats4me.net", "icms prod"],
  ["https://cas.dev.cats4me.biz", "cas dev"],
  ["https://cas.cats4me.biz", "cas prod"],
  ["https://gw.danbiedu.co.kr/mail", "danbi gw mail"],
  ["https://gw.danbiedu.co.kr", "danbi gw"],
];

function newRuleId() {
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function makeRule(pattern, title, match = "contains") {
  return { id: newRuleId(), enabled: true, match, pattern, title };
}

function defaultConfig() {
  return {
    enabled: true,
    prefix: "회사 - ",
    appendDateTime: true,
    rules: LEGACY_URL_TITLE_MAP.map(([pattern, title]) => makeRule(pattern, title)),
    excludedKeywords: ["CATS-", "통합컨텐츠"],
  };
}

// 저장된 값이 일부 빠져 있거나 형식이 어긋나도 화면·백그라운드가 깨지지 않게 다듬는다
function normalizeConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    prefix: typeof raw.prefix === "string" ? raw.prefix : base.prefix,
    appendDateTime: typeof raw.appendDateTime === "boolean" ? raw.appendDateTime : base.appendDateTime,
    rules: Array.isArray(raw.rules)
      ? raw.rules
          .filter((r) => r && typeof r.pattern === "string")
          .map((r) => ({
            id: typeof r.id === "string" && r.id ? r.id : newRuleId(),
            enabled: r.enabled !== false,
            match: MATCH_TYPES[r.match] ? r.match : "contains",
            pattern: r.pattern,
            title: typeof r.title === "string" ? r.title : "",
          }))
      : base.rules,
    excludedKeywords: Array.isArray(raw.excludedKeywords)
      ? raw.excludedKeywords.filter((k) => typeof k === "string" && k)
      : base.excludedKeywords,
  };
}

async function loadConfig() {
  const res = await chrome.storage.local.get(CONFIG_KEY);
  return normalizeConfig(res[CONFIG_KEY]);
}

async function saveConfig(config) {
  await chrome.storage.local.set({ [CONFIG_KEY]: normalizeConfig(config) });
}

// 정규식이 잘못됐으면 null
function compileRegex(pattern) {
  try {
    return new RegExp(pattern);
  } catch (e) {
    return null;
  }
}

function ruleMatches(rule, url) {
  if (!rule.enabled || !rule.pattern) return false;
  if (rule.match === "prefix") return url.startsWith(rule.pattern);
  if (rule.match === "regex") {
    const re = compileRegex(rule.pattern);
    return !!re && re.test(url);
  }
  return url.includes(rule.pattern);
}

// 위에서부터 처음 맞는 규칙 하나
function findRule(rules, url) {
  return rules.find((r) => ruleMatches(r, url)) || null;
}

function isTargetUrl(url) {
  return typeof url === "string" && /^https?:/.test(url);
}

// 탭에 넘길 지시. null 이면 원래 제목으로 되돌린다.
function buildTitleOptions(config, url) {
  if (!config.enabled) return null;
  const rule = findRule(config.rules, url);
  if (rule) return { fixedTitle: rule.title };
  return {
    prefix: config.prefix,
    appendDateTime: config.appendDateTime,
    excludedKeywords: config.excludedKeywords,
  };
}

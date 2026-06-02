const SCRIPT_FIELDS = [
  ["opening", "오프닝 멘트"],
  ["talk1", "토크 1"],
  ["talk2", "토크 2"],
  ["talk3", "토크 3"],
  ["closingQuestion", "마무리 질문"],
  ["ending", "엔딩 멘트"],
];

const SCRIPT_VIEWS = [["all", "전체"], ...SCRIPT_FIELDS];

const elements = {
  editorName: document.querySelector("#editorName"),
  episodeList: document.querySelector("#episodeList"),
  episodeHeading: document.querySelector("#episodeHeading"),
  episodeSubheading: document.querySelector("#episodeSubheading"),
  episodeStatus: document.querySelector("#episodeStatus"),
  saveState: document.querySelector("#saveState"),
  versionTag: document.querySelector("#versionTag"),
  changeLog: document.querySelector("#changeLog"),
  rundownRows: document.querySelector("#rundownRows"),
  scriptViewTabs: document.querySelector("#scriptViewTabs"),
  scriptFields: document.querySelector("#scriptFields"),
  scriptPreviewTitle: document.querySelector("#scriptPreviewTitle"),
  scriptPreviewText: document.querySelector("#scriptPreviewText"),
  scenarioOverviewTitle: document.querySelector("#scenarioOverviewTitle"),
  scenarioOverviewText: document.querySelector("#scenarioOverviewText"),
  musicRows: document.querySelector("#musicRows"),
  conflictBanner: document.querySelector("#conflictBanner"),
  importModal: document.querySelector("#importModal"),
  mdImportText: document.querySelector("#mdImportText"),
  mdFileInput: document.querySelector("#mdFileInput"),
  importStatus: document.querySelector("#importStatus"),
};

let state = null;
let selectedEpisodeId = localStorage.getItem("ridingStarSelectedEpisode") || "";
let selectedScriptView = localStorage.getItem("ridingStarScriptView") || "all";
let dirty = false;
let saveTimer = null;
let saveInFlight = false;
let pendingNote = "";
let pendingRemoteState = null;
let importSampleMode = false;

elements.editorName.value = localStorage.getItem("ridingStarEditorName") || "";
elements.editorName.addEventListener("input", () => {
  localStorage.setItem("ridingStarEditorName", elements.editorName.value.trim());
});

function uid(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof fetch === "function") {
      fetch(url, options)
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) {
            const error = new Error(payload.message || "요청에 실패했습니다.");
            error.status = response.status;
            error.payload = payload;
            throw error;
          }
          return payload;
        })
        .then(resolve)
        .catch(reject);
      return;
    }

    if (typeof XMLHttpRequest !== "function") {
      reject(new Error("이 브라우저에서 요청 기능을 사용할 수 없습니다."));
      return;
    }

    const request = new XMLHttpRequest();
    request.open(options.method || "GET", url, true);
    request.responseType = "json";
    Object.entries(options.headers || {}).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });
    request.onload = () => {
      const payload = request.response || JSON.parse(request.responseText || "{}");
      if (request.status < 200 || request.status >= 300) {
        const error = new Error(payload.message || "요청에 실패했습니다.");
        error.status = request.status;
        error.payload = payload;
        reject(error);
        return;
      }
      resolve(payload);
    };
    request.onerror = () => reject(new Error("요청에 실패했습니다."));
    request.send(options.body || null);
  });
}

async function getJson(url, options) {
  return requestJson(url, options);
}

function currentEpisode() {
  return state?.episodes.find((episode) => episode.id === selectedEpisodeId) || state?.episodes[0] || null;
}

function setSaveState(text, mode = "") {
  elements.saveState.textContent = text;
  elements.saveState.className = `save-state ${mode}`.trim();
}

function setImportSampleMode(enabled) {
  importSampleMode = enabled;
  elements.mdImportText.classList.toggle("sample-import-text", enabled);
}

function markDirty(note) {
  dirty = true;
  pendingNote = note || pendingNote || "시나리오 수정";
  setSaveState("저장 대기", "dirty");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(), 1200);
}

function touchEpisode(episode) {
  episode.updatedAt = new Date().toISOString();
}

function createBlankEpisode() {
  const nextNumber = String((state?.episodes.length || 0) + 1).padStart(2, "0");
  return {
    id: uid("ep"),
    episodeNo: `EP.${nextNumber}`,
    title: "새 회차",
    theme: "",
    guest: "",
    hosts: "왕규, 정규",
    station: "전주공동체라디오 93.5MHz",
    recordDate: "",
    airDate: "",
    location: "방송실",
    duration: "56분",
    status: "초안",
    keywords: "",
    summary: "",
    rundown: [
      { id: uid("run"), segment: "오프닝", time: "00:00-03:00", duration: "3분", details: "", cast: "진행자" },
      { id: uid("run"), segment: "토크 1", time: "07:00-17:00", duration: "10분", details: "", cast: "진행자 & 게스트" },
      { id: uid("run"), segment: "토크 2", time: "20:00-35:00", duration: "15분", details: "", cast: "진행자 & 게스트" },
      { id: uid("run"), segment: "토크 3", time: "38:00-50:00", duration: "12분", details: "", cast: "진행자 & 게스트" },
      { id: uid("run"), segment: "엔딩 멘트", time: "53:00-56:00", duration: "3분", details: "", cast: "진행자" },
    ],
    script: {
      opening: "",
      talk1: "",
      talk2: "",
      talk3: "",
      closingQuestion: "",
      ending: "",
    },
    music: [
      { id: uid("music"), timing: "음악 1", title: "", artist: "", recommendedBy: "", reason: "", rightsNote: "송출 전 확인" },
    ],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

function renderEpisodeList() {
  elements.episodeList.innerHTML = "";

  state.episodes.forEach((episode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `episode-card ${episode.id === selectedEpisodeId ? "active" : ""}`;
    button.dataset.episodeId = episode.id;

    const title = document.createElement("strong");
    title.textContent = `${episode.episodeNo || "회차"} · ${episode.title || "제목 없음"}`;
    const meta = document.createElement("small");
    meta.textContent = [episode.guest, episode.status, episode.airDate].filter(Boolean).join(" / ");

    button.append(title, meta);
    elements.episodeList.append(button);
  });
}

function renderMetaFields(episode) {
  document.querySelectorAll("[data-field]").forEach((field) => {
    field.value = episode[field.dataset.field] || "";
  });
}

function renderHeading(episode) {
  elements.episodeHeading.textContent = `${episode.episodeNo || "회차 미정"} ${episode.title || ""}`.trim();
  elements.episodeSubheading.textContent = [episode.theme, episode.guest ? `게스트 ${episode.guest}` : ""].filter(Boolean).join(" · ");
  elements.episodeStatus.textContent = episode.status || "초안";
}

function renderRundown(episode) {
  elements.rundownRows.innerHTML = episode.rundown.map((row) => `
    <tr data-row-id="${escapeAttr(row.id)}">
      <td><input class="input" data-row-field="segment" value="${escapeAttr(row.segment)}"></td>
      <td><input class="input" data-row-field="time" value="${escapeAttr(row.time)}"></td>
      <td><input class="input" data-row-field="duration" value="${escapeAttr(row.duration)}"></td>
      <td><textarea class="textarea" data-row-field="details">${escapeHtml(row.details)}</textarea></td>
      <td><input class="input" data-row-field="cast" value="${escapeAttr(row.cast)}"></td>
      <td><button class="row-delete" data-delete-row="${escapeAttr(row.id)}" type="button" title="삭제" aria-label="삭제">×</button></td>
    </tr>
  `).join("");
}

function renderScriptTabs() {
  if (!SCRIPT_VIEWS.some(([key]) => key === selectedScriptView)) selectedScriptView = "all";
  elements.scriptViewTabs.innerHTML = SCRIPT_VIEWS.map(([key, label]) => `
    <button class="script-view-tab ${key === selectedScriptView ? "active" : ""}" data-script-view="${escapeAttr(key)}" type="button">${escapeHtml(label)}</button>
  `).join("");
}

function scriptPreviewPlainText(episode, key = selectedScriptView) {
  if (key !== "all") {
    const label = SCRIPT_FIELDS.find(([field]) => field === key)?.[1] || "대본";
    return `${label}\n\n${episode.script?.[key] || ""}`.trim();
  }

  return SCRIPT_FIELDS.map(([field, label]) => {
    const text = episode.script?.[field] || "";
    return `### ${label}\n\n${text}`;
  }).join("\n\n").trim();
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function renderReadableBlock(block) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line));
  if (lines.length && bulletLines.length === lines.length) {
    return `<ul>${lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
  }

  const renderedLines = lines.map((line) => {
    const speaker = line.match(/^([^:：]{1,18})\s*[:：]\s*(.*)$/);
    if (speaker && speaker[2]) {
      return `
        <p class="dialogue-line">
          <strong class="dialogue-speaker">${escapeHtml(speaker[1])}</strong>
          <span>${renderInlineMarkdown(speaker[2])}</span>
        </p>
      `;
    }
    return `<p>${renderInlineMarkdown(line)}</p>`;
  });

  return renderedLines.join("");
}

function renderPreviewBlock(block) {
  const escaped = escapeHtml(block);
  if (escaped.startsWith("### ")) {
    return `<h4>${escaped.slice(4)}</h4>`;
  }
  return renderReadableBlock(block);
}

function renderScriptPreview(episode) {
  const label = SCRIPT_VIEWS.find(([key]) => key === selectedScriptView)?.[1] || "전체";
  elements.scriptPreviewTitle.textContent = selectedScriptView === "all" ? "전체 대본" : `${label} 보기`;
  const text = scriptPreviewPlainText(episode);
  elements.scriptPreviewText.innerHTML = text
    ? text.split(/\n{2,}/).map(renderPreviewBlock).join("")
    : `<p class="empty-preview">아직 입력된 대본이 없습니다.</p>`;
}

function renderScenarioOverview(episode) {
  elements.scenarioOverviewTitle.textContent = `${episode.episodeNo || "회차 미정"} 시나리오`;
  const hasAnyScript = SCRIPT_FIELDS.some(([key]) => String(episode.script?.[key] || "").trim());

  if (!hasAnyScript) {
    elements.scenarioOverviewText.innerHTML = `<p class="empty-preview">아직 작성된 시나리오가 없습니다. 대본 편집에서 오프닝 멘트부터 입력해 주세요.</p>`;
    return;
  }

  elements.scenarioOverviewText.innerHTML = SCRIPT_FIELDS.map(([key, label]) => {
    const text = String(episode.script?.[key] || "").trim();
    const body = text ? renderReadableBlock(text) : `<p class="empty-preview">작성된 내용 없음</p>`;
    return `
      <article class="scenario-overview-section ${key === "opening" ? "opening" : ""}">
        <h3>${escapeHtml(label)}</h3>
        ${body}
      </article>
    `;
  }).join("");
}

function renderScript(episode) {
  renderScriptTabs();
  const fields = selectedScriptView === "all"
    ? SCRIPT_FIELDS
    : SCRIPT_FIELDS.filter(([key]) => key === selectedScriptView);

  elements.scriptFields.classList.toggle("single", selectedScriptView !== "all");
  elements.scriptFields.innerHTML = fields.map(([key, label]) => `
    <div class="script-field">
      <label for="script-${key}">${label}</label>
      <textarea id="script-${key}" class="textarea" data-script="${key}">${escapeHtml(episode.script?.[key] || "")}</textarea>
    </div>
  `).join("");
  renderScriptPreview(episode);
}

function renderMusic(episode) {
  elements.musicRows.innerHTML = episode.music.map((track) => `
    <tr data-music-id="${escapeAttr(track.id)}">
      <td><input class="input" data-music-field="timing" value="${escapeAttr(track.timing)}"></td>
      <td><input class="input" data-music-field="title" value="${escapeAttr(track.title)}"></td>
      <td><input class="input" data-music-field="artist" value="${escapeAttr(track.artist)}"></td>
      <td><input class="input" data-music-field="recommendedBy" value="${escapeAttr(track.recommendedBy)}"></td>
      <td><textarea class="textarea" data-music-field="reason">${escapeHtml(track.reason)}</textarea></td>
      <td><input class="input" data-music-field="rightsNote" value="${escapeAttr(track.rightsNote)}"></td>
      <td><button class="row-delete" data-delete-music="${escapeAttr(track.id)}" type="button" title="삭제" aria-label="삭제">×</button></td>
    </tr>
  `).join("");
}

function renderActivity() {
  elements.versionTag.textContent = `v${state.version}`;
  const entries = [...(state.changeLog || [])].reverse().slice(0, 8);
  elements.changeLog.innerHTML = entries.map((entry) => `
    <article class="change-item">
      <strong>${escapeHtml(entry.editor || "이름 없음")}</strong>
      <span>${escapeHtml(entry.note || "시나리오 수정")}</span>
      <time>${escapeHtml(formatDateTime(entry.at))}</time>
    </article>
  `).join("");
}

function renderAll() {
  if (!state.episodes.length) state.episodes.push(createBlankEpisode());
  if (!state.episodes.some((episode) => episode.id === selectedEpisodeId)) selectedEpisodeId = state.episodes[0].id;

  localStorage.setItem("ridingStarSelectedEpisode", selectedEpisodeId);
  const episode = currentEpisode();
  renderEpisodeList();
  renderHeading(episode);
  renderMetaFields(episode);
  renderRundown(episode);
  renderScenarioOverview(episode);
  renderScript(episode);
  renderMusic(episode);
  renderActivity();
}

function activateMainTab(tabName) {
  const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
  if (!tabButton) return;

  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === tabButton));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${tabName}Panel`)?.classList.add("active");
}

async function loadState(force = false) {
  if (dirty && force) {
    const shouldLoad = window.confirm("저장되지 않은 수정이 있습니다. 최신본을 불러올까요?");
    if (!shouldLoad) return;
  }

  if (dirty && !force) return;

  try {
    const remoteState = await getJson("/api/state");
    if (!state || force || Number(remoteState.version) > Number(state.version)) {
      state = remoteState;
      dirty = false;
      pendingRemoteState = null;
      elements.conflictBanner.hidden = true;
      renderAll();
      setSaveState("최신본");
    }
  } catch (error) {
    setSaveState("연결 오류", "error");
  }
}

function handleInitialHash() {
  if (window.location.hash === "#import") {
    openImportModal();
    history.replaceState(null, "", window.location.pathname);
    return;
  }

  if (window.location.hash === "#script") {
    activateMainTab("script");
    history.replaceState(null, "", window.location.pathname);
  }
}

async function saveNow(note) {
  clearTimeout(saveTimer);
  if (!state || saveInFlight || !dirty) return;

  saveInFlight = true;
  setSaveState("저장 중", "dirty");

  try {
    const nextState = await getJson("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientVersion: state.version,
        state,
        editor: elements.editorName.value.trim(),
        note: note || pendingNote || "시나리오 수정",
      }),
    });

    state = nextState;
    dirty = false;
    pendingNote = "";
    pendingRemoteState = null;
    elements.conflictBanner.hidden = true;
    renderEpisodeList();
    renderActivity();
    setSaveState("저장됨");
  } catch (error) {
    if (error.status === 409) {
      pendingRemoteState = error.payload.currentState;
      elements.conflictBanner.hidden = false;
      setSaveState("충돌", "error");
    } else {
      setSaveState("저장 실패", "error");
    }
  } finally {
    saveInFlight = false;
  }
}

async function ensureSaved(note) {
  if (!dirty) return true;
  await saveNow(note);
  return !dirty;
}

function updateHeadingAfterMeta(field) {
  if (["episodeNo", "title", "theme", "guest", "status", "airDate"].includes(field)) {
    const episode = currentEpisode();
    renderHeading(episode);
    renderScenarioOverview(episode);
    renderEpisodeList();
  }
}

function normalizeHeading(value) {
  return String(value || "")
    .replace(/[#*_`]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function findSection(markdown, aliases) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const normalizedAliases = aliases.map(normalizeHeading);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{2,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const level = match[1].length;
    const title = normalizeHeading(match[2]);
    if (!normalizedAliases.some((alias) => title.includes(alias))) continue;

    let end = lines.length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextMatch = lines[next].match(/^(#{2,6})\s+/);
      if (nextMatch && nextMatch[1].length <= level) {
        end = next;
        break;
      }
    }

    return lines.slice(index + 1, end).join("\n").trim();
  }

  return "";
}

function splitTableRow(row) {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cell = "";
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      cell += char === "|" ? "|" : `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }

  cells.push(cell.trim());
  return cells.map((value) => value.replace(/<br\s*\/?>/gi, "\n").trim());
}

function isDividerRow(row) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row);
}

function parseMarkdownTable(section) {
  const rows = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (rows.length < 2) return [];
  const headerLine = rows.find((line) => !isDividerRow(line));
  if (!headerLine) return [];

  const headerIndex = rows.indexOf(headerLine);
  const headers = splitTableRow(headerLine).map(normalizeHeading);
  const dataRows = rows.slice(headerIndex + 1).filter((line) => !isDividerRow(line));

  return dataRows.map((line) => {
    const cells = splitTableRow(line);
    return { headers, cells };
  });
}

function cellByHeader(row, aliases) {
  const normalizedAliases = aliases.map(normalizeHeading);
  const index = row.headers.findIndex((header) => normalizedAliases.some((alias) => header.includes(alias)));
  return index >= 0 ? row.cells[index] || "" : "";
}

function parseRundown(section) {
  return parseMarkdownTable(section).map((row) => ({
    id: uid("run"),
    segment: cellByHeader(row, ["구성", "코너", "순서", "파트", "segment"]),
    time: cellByHeader(row, ["시간", "방송시간", "타임", "time"]),
    duration: cellByHeader(row, ["길이", "분량", "소요시간", "duration", "소요"]),
    details: cellByHeader(row, ["세부사항", "상세사항", "내용", "질문", "메모", "details"]),
    cast: cellByHeader(row, ["출연", "출연자", "진행", "cast", "담당"]),
  })).filter((row) => row.segment || row.time || row.details);
}

function parseMusic(section, guest) {
  return parseMarkdownTable(section).map((row) => ({
    id: uid("music"),
    timing: cellByHeader(row, ["순서", "타이밍", "구성", "음악", "timing"]),
    title: cellByHeader(row, ["곡명", "제목", "추천곡", "노래", "title"]),
    artist: cellByHeader(row, ["가수", "아티스트", "artist"]),
    recommendedBy: cellByHeader(row, ["추천자", "추천한사람", "recommended"]) || guest || "",
    reason: cellByHeader(row, ["추천이유", "이유", "reason"]),
    rightsNote: cellByHeader(row, ["저작권", "송출", "확인", "rights"]) || "송출 전 확인",
  })).filter((track) => track.timing || track.title || track.reason);
}

function applyMetadataFromMarkdown(episode, markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const episodeHeading = lines.find((line) => /^##\s+/.test(line));
  if (episodeHeading) {
    const heading = episodeHeading.replace(/^##\s+/, "").trim();
    const match = heading.match(/^((?:EP\.?\s*)?\d+|EP\.\d+|제\s*\d+\s*회)\s*[·.\-:]?\s*(.*)$/i);
    if (match) {
      episode.episodeNo = match[1].replace(/\s+/g, "");
      episode.title = match[2] || episode.title;
    } else {
      episode.title = heading || episode.title;
    }
  }

  lines.forEach((line) => {
    const match = line.match(/^\s*[-*]\s*([^:：]+)\s*[:：]\s*(.*)$/);
    if (!match) return;
    const label = normalizeHeading(match[1]);
    const value = match[2].trim();

    if (label.includes("주제")) episode.theme = value;
    else if (label.includes("게스트")) episode.guest = value;
    else if (label.includes("진행")) episode.hosts = value;
    else if (label.includes("방송국")) episode.station = value;
    else if (label.includes("녹음일")) episode.recordDate = value;
    else if (label.includes("방송일")) episode.airDate = value;
    else if (label.includes("장소")) episode.location = value;
    else if (label.includes("러닝타임") || label.includes("전체시간")) episode.duration = value;
    else if (label.includes("상태")) episode.status = value;
    else if (label.includes("키워드")) episode.keywords = value;
    else if (label.includes("녹음") && value.includes("방송")) {
      const [recordDate, airDate] = value.split(/\/\s*방송\s*[:：]?/);
      episode.recordDate = recordDate.trim();
      episode.airDate = (airDate || "").trim();
    }
  });
}

function parseMarkdownScenario(markdown, baseEpisode, keepId) {
  const episode = clone(baseEpisode || createBlankEpisode());
  if (!keepId) episode.id = uid("ep");

  episode.script = {
    opening: episode.script?.opening || "",
    talk1: episode.script?.talk1 || "",
    talk2: episode.script?.talk2 || "",
    talk3: episode.script?.talk3 || "",
    closingQuestion: episode.script?.closingQuestion || "",
    ending: episode.script?.ending || "",
  };

  applyMetadataFromMarkdown(episode, markdown);

  const summary = findSection(markdown, ["회차 요약", "요약"]);
  if (summary) episode.summary = summary;

  const rundown = parseRundown(findSection(markdown, ["전체 방송 시간표", "전체 시간표", "시간표"]));
  if (rundown.length) episode.rundown = rundown;

  const scriptSections = {
    opening: findSection(markdown, ["오프닝 멘트", "오프닝멘트", "오프닝"]),
    talk1: findSection(markdown, ["토크 1", "토크1", "토크 1번", "첫 번째 토크"]),
    talk2: findSection(markdown, ["토크 2", "토크2", "토크 2번", "두 번째 토크"]),
    talk3: findSection(markdown, ["토크 3", "토크3", "토크 3번", "세 번째 토크"]),
    closingQuestion: findSection(markdown, ["마무리 질문", "클로징 질문", "마지막 질문", "역질문"]),
    ending: findSection(markdown, ["엔딩 멘트", "엔딩멘트", "엔딩"]),
  };

  Object.entries(scriptSections).forEach(([key, value]) => {
    if (value) episode.script[key] = value;
  });

  const music = parseMusic(findSection(markdown, ["게스트 추천 음악", "추천 음악", "추천곡", "음악 기록"]), episode.guest);
  if (music.length) episode.music = music;

  const notes = findSection(markdown, ["방송 후 메모", "방송 후 정리", "메모"]);
  if (notes) episode.notes = notes;

  touchEpisode(episode);
  return episode;
}

function sampleMarkdown() {
  return `# Riding-star 방송 시나리오

## EP.01 천천히, 같이, 멀리

- 주제: 처음 라이딩의 기억과 함께 달리는 즐거움
- 게스트: 이은영
- 진행: 왕규, 정규
- 방송국: 전주공동체라디오 93.5MHz
- 녹음일: 2025.08.28
- 방송일: 2025.09.__ __:__
- 장소: 방송실
- 러닝타임: 56분
- 상태: 샘플
- 키워드: 첫 라이딩, 동반 라이딩, 장거리, 자전거 코스, 맛집

### 회차 요약

자전거를 처음 배웠던 날부터 함께 달리는 리듬, 장거리 라이딩의 코스와 맛집까지 나누는 회차.

### 전체 방송 시간표

| 구성 | 시간 | 길이 | 세부사항 | 출연 |
|---|---:|---:|---|---|
| 오프닝 | 00:00-03:00 | 3분 | 시그널 음악, 진행자 인사, 오늘의 주제와 게스트 소개 | 진행자 |
| 음악 1 | 03:00-07:00 | 4분 | 게스트 추천곡 1. 첫 라이딩 기억으로 넘어가는 분위기 만들기 | 진행자 |
| 토크 1 | 07:00-17:00 | 10분 | 처음 자전거를 탔던 날, 첫 성공의 감각, 어린 시절과 지금의 라이딩 비교 | 진행자 & 게스트 |
| 음악 2 | 17:00-20:00 | 3분 | 게스트 추천곡 2. 천천히 달리는 장면에 어울리는 곡 | 진행자 |
| 토크 2 | 20:00-35:00 | 15분 | 함께 달릴 때의 배려, 안전, 속도보다 중요한 리듬과 관광 | 진행자 & 게스트 |
| 음악 3 | 35:00-38:00 | 3분 | 게스트 추천곡 3. 장거리 라이딩 전환 브리지 | 진행자 |
| 토크 3 | 38:00-50:00 | 12분 | 멀리 떠나는 라이딩 기억, 추천 코스, 코스 근처 맛집, 꼭 가보고 싶은 목적지 | 진행자 & 게스트 |
| 마무리 질문 | 50:00-53:00 | 3분 | 오늘 방송 후 어떤 하루를 보내고 싶은지, 게스트의 역질문, 오늘의 한 문장 | 진행자 & 게스트 |
| 엔딩 멘트 | 53:00-56:00 | 3분 | 게스트 감사 인사, 청취자에게 다음 회차 예고, 시그널 음악 | 진행자 |

### 오프닝 멘트

정규: 안녕하세요~! 만경강을 달리는 아줌마, 라이딩스타의 박정규입니다.

왕규: 안녕하세요~! 페달에 발만 올리면 행복해지는 남자, 라이딩스타의 강왕규입니다.

정규: 7월도 어느덧 중반으로 접어드는데요. 이제는 '덥다'는 말이 인사가 된 계절이죠. 밖에만 나가도 '아후~' 소리가 절로 나오는 무더위입니다.

왕규: 하지만 이런 날씨에도 자전거를 멈출 수는 없죠. 그렇지만 한 가지는 꼭 말씀드리고 싶어요. 요즘처럼 습도 높고 땡볕이 강한 날에는 한낮 라이딩은 피하는 게 좋습니다. 수분 섭취 충분히 하시고, 가능한 한 이른 아침이나 해 질 무렵에 타시는 걸 추천드립니다. 건강하게 오래 타는 게 더 중요하니까요~!

정규: 맞아요. 장마철이라고 해서 무조건 멈출 필요는 없지만, 폭염 속 무리한 라이딩은 오히려 건강을 해칠 수 있습니다. 대신 이런 계절엔 숲길, 바닷길처럼 시원한 코스를 찾아보는 것도 좋은 방법인 것 같아요~!

왕규: 그리고 지금 이 시기, 여름 축제도 한창입니다. 곧 시작되는 보령 머드축제처럼 더위를 이기는 색다른 즐거움도 있고, 곳곳에서 열리는 여름 음악 축제도 기다리고 있죠. 여름은 덥지만, 또 그만큼 살아 있다는 느낌이 강한 계절이니까요.

정규: 네. 무더위 속에서도 건강하게, 안전하게, 그리고 즐겁게. 오늘도 건강과 자전거를 이야기하는 라이딩스타, 노래 한 곡 듣고 본격적인 토크 이어가겠습니다.

### 토크 1

정규: 자전거를 처음 배울 때는 왜 그렇게 온몸에 힘이 들어갈까요. 은영님은 처음 페달을 밟던 날을 기억하시나요?

게스트: 어린 때 아빠가 잡아주셨던 기억이 나요. 중심을 잡는 게 무섭기도 했지만 어느 순간 혼자 앞으로 가고 있다는 느낌이 좋았어요.

왕규: 그때 가장 크게 남은 감각은 무엇이었나요. 바람, 웃음, 혹은 넘어질까 봐 긴장하던 마음 중에서요.

게스트: 바람이 제일 기억나요. 빠르지 않아도 제가 직접 앞으로 간다는 느낌이 좋았어요.

정규: 그 마음이 지금의 라이딩까지 이어졌네요. 첫 번째 이야기는 여기서 쉬어 가고, 천천히 달리는 장면에 어울리는 두 번째 음악 듣겠습니다.

### 토크 2

정규: 오늘의 첫 번째 키워드는 천천히입니다. 자전거를 타다 보면 일부러 속도를 늦추는 시간이 있잖아요. 언제 천천히 달리게 되나요?

게스트: 풍경이 좋거나 같이 타는 사람이 있을 때요. 천천히 가야 보이는 게 많더라고요.

왕규: 함께 달릴 때는 속도를 맞추는 것도 기술 같아요. 은영님은 어떤 배려가 중요하다고 생각하세요?

게스트: 앞에서 너무 멀리 가지 않기, 서로 자주 확인하기, 힘든 사람을 기다려주기 같은 것들이요.

정규: 자전거는 혼자 타도 좋지만, 같이 타면 이야기가 생깁니다. 은영님의 플레이리스트에서 함께 달릴 때 어울리는 곡 한 곡 들어볼까요?

### 토크 3

정규: 세 번째 키워드는 멀리입니다. 은영님에게 가장 기억에 남는 장거리 라이딩은 어디였나요?

게스트: 섬진강을 따라 갔던 1박 2일 여행이 기억에 남아요. 길도 좋고 중간중간 쉬어가는 시간이 좋았어요.

왕규: 그 코스를 누군가에게 추천한다면 어느 구간을 꼭 달려보라고 말하고 싶으세요?

게스트: 강을 옆에 두고 달리는 구간이요. 속도를 내지 않아도 풍경이 계속 바뀌어서 지루하지 않아요.

정규: 라이딩 이야기에서 맛집이 빠지면 서운합니다. 코스 근처에서 기억나는 곳이 있나요?

게스트: 따뜻한 국물이나 간단히 먹기 좋은 분식집처럼 부담 없는 곳이 좋더라고요.

왕규: 언젠가 꼭 가보고 싶은 멀리의 목적지도 궁금합니다.

게스트: 동해안 자전거길을 길게 달려보고 싶어요. 바다를 보면서 천천히 가보고 싶습니다.

### 마무리 질문

정규: 마지막 질문입니다. 오늘 방송을 마치고 나면 어떤 하루를 보내고 싶으세요?

게스트: 천천히 커피를 마시면서 오늘 나눈 이야기를 떠올리고 싶어요.

왕규: 역으로 은영님도 저희에게 물어볼 질문이 있을까요?

게스트: 두 분에게 천천히, 같이, 멀리는 어떤 모습인가요?

정규: 저는 천천히 달리면서 풍경을 놓치지 않는 것, 같이 웃는 것, 그리고 마음이 조금 더 멀리 가는 것이라고 생각합니다.

### 엔딩 멘트

왕규: 오늘 Riding-star는 천천히, 같이, 멀리라는 세 단어를 여러분과 함께 달렸습니다. 천천히 간 덕분에 숨은 이야기를 들었고, 같이 달리니 웃음이 끊이지 않았습니다.

정규: 이은영님, 오늘 함께해 주셔서 감사합니다. 덕분에 마음이 따뜻해졌습니다.

게스트: 저도 감사합니다. 여러분도 마음속에서 페달을 천천히 밟으며 멀리 꿈꿔보세요.

왕규: 청취자 여러분, 다음 주에는 또 다른 두 바퀴 이야기를 찾아올게요. 지금까지 Riding-star였습니다.

### 게스트 추천 음악

| 순서 | 곡명 | 가수 | 추천자 | 추천 이유 | 저작권/송출 확인 |
|---|---|---|---|---|---|
| 음악 1 |  |  | 이은영 | 첫 라이딩의 설렘으로 넘어가는 곡 | 송출 전 확인 |
| 음악 2 |  |  | 이은영 | 천천히 같이 달리는 분위기에 맞는 곡 | 송출 전 확인 |
| 음악 3 |  |  | 이은영 | 장거리 라이딩과 멀리 떠나는 마음을 잇는 곡 | 송출 전 확인 |

### 방송 후 메모

샘플 회차입니다. 방송 후 실제 러닝타임, 컷 편집 지점, 다음 회차로 넘길 질문을 적어둡니다.
`;
}

function openImportModal() {
  elements.importStatus.textContent = "";
  elements.importModal.hidden = false;
  elements.mdImportText.focus();
}

function closeImportModal() {
  elements.importModal.hidden = true;
}

function importMarkdown(asNew) {
  try {
    const markdown = elements.mdImportText.value.trim();
    if (!markdown) {
      elements.importStatus.textContent = "가져올 MD 내용을 입력해 주세요.";
      return;
    }

    if (!state) {
      elements.importStatus.textContent = "회차 정보를 불러오는 중입니다. 잠시 후 다시 적용해 주세요.";
      return;
    }

    if (!Array.isArray(state.episodes)) state.episodes = [];

    const current = currentEpisode();
    const shouldKeepCurrentId = !asNew && Boolean(current);
    const baseEpisode = shouldKeepCurrentId ? current : createBlankEpisode();
    const parsed = parseMarkdownScenario(markdown, baseEpisode, shouldKeepCurrentId);

    if (asNew || !current) {
      state.episodes.push(parsed);
    } else {
      const index = state.episodes.findIndex((episode) => episode.id === current.id);
      if (index >= 0) state.episodes[index] = parsed;
      else state.episodes.push(parsed);
    }

    selectedEpisodeId = parsed.id;
    setImportSampleMode(false);
    closeImportModal();
    renderAll();
    activateMainTab("script");
    markDirty(asNew ? "MD 새 회차 가져오기" : "MD 현재 회차 적용");
  } catch (error) {
    elements.importStatus.textContent = `적용하지 못했습니다: ${error.message || "MD 형식을 확인해 주세요."}`;
  }
}

async function exportMarkdown() {
  const episode = currentEpisode();
  if (!episode) return;
  if (!(await ensureSaved("MD 내보내기 전 저장"))) return;
  window.location.href = `/api/export.md?episode=${encodeURIComponent(episode.id)}`;
}

async function exportPdf() {
  const episode = currentEpisode();
  if (!episode) return;
  const popup = window.open("about:blank", "_blank");
  if (!(await ensureSaved("PDF 내보내기 전 저장"))) {
    if (popup) popup.close();
    return;
  }
  const url = `/print.html?episode=${encodeURIComponent(episode.id)}&print=1`;
  if (popup) popup.location.href = url;
  else window.location.href = url;
}

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target === elements.mdImportText) {
    if (importSampleMode) setImportSampleMode(false);
    return;
  }

  const episode = currentEpisode();
  if (!episode) return;

  if (target.dataset.field) {
    const field = target.dataset.field;
    episode[field] = target.value;
    touchEpisode(episode);
    updateHeadingAfterMeta(field);
    markDirty(`${field} 수정`);
    return;
  }

  if (target.dataset.rowField) {
    const row = episode.rundown.find((item) => item.id === target.closest("tr")?.dataset.rowId);
    if (!row) return;
    row[target.dataset.rowField] = target.value;
    touchEpisode(episode);
    markDirty("시간표 수정");
    return;
  }

  if (target.dataset.script) {
    episode.script[target.dataset.script] = target.value;
    touchEpisode(episode);
    renderScenarioOverview(episode);
    renderScriptPreview(episode);
    markDirty("대본 수정");
    return;
  }

  if (target.dataset.musicField) {
    const track = episode.music.find((item) => item.id === target.closest("tr")?.dataset.musicId);
    if (!track) return;
    track[target.dataset.musicField] = target.value;
    touchEpisode(episode);
    markDirty("추천 음악 수정");
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  const episode = currentEpisode();

  const episodeButton = target.closest("[data-episode-id]");
  if (episodeButton) {
    selectedEpisodeId = episodeButton.dataset.episodeId;
    renderAll();
    return;
  }

  const tabButton = target.closest("[data-tab]");
  if (tabButton) {
    activateMainTab(tabButton.dataset.tab);
    return;
  }

  const scriptViewButton = target.closest("[data-script-view]");
  if (scriptViewButton) {
    selectedScriptView = scriptViewButton.dataset.scriptView;
    localStorage.setItem("ridingStarScriptView", selectedScriptView);
    renderScript(episode);
    return;
  }

  if (target.id === "addEpisodeBtn") {
    const newEpisode = createBlankEpisode();
    state.episodes.push(newEpisode);
    selectedEpisodeId = newEpisode.id;
    markDirty("새 회차 추가");
    renderAll();
    return;
  }

  if (target.id === "duplicateEpisodeBtn" && episode) {
    const copied = clone(episode);
    copied.id = uid("ep");
    copied.episodeNo = `${episode.episodeNo || "EP"} copy`;
    copied.title = `${episode.title || "회차"} 복제본`;
    copied.status = "초안";
    copied.updatedAt = new Date().toISOString();
    copied.rundown = copied.rundown.map((row) => ({ ...row, id: uid("run") }));
    copied.music = copied.music.map((track) => ({ ...track, id: uid("music") }));
    state.episodes.push(copied);
    selectedEpisodeId = copied.id;
    markDirty("회차 복제");
    renderAll();
    return;
  }

  if (target.id === "addRundownBtn" && episode) {
    episode.rundown.push({
      id: uid("run"),
      segment: "새 구성",
      time: "",
      duration: "",
      details: "",
      cast: "",
    });
    touchEpisode(episode);
    markDirty("시간표 구성 추가");
    renderRundown(episode);
    return;
  }

  if (target.dataset.deleteRow && episode) {
    episode.rundown = episode.rundown.filter((row) => row.id !== target.dataset.deleteRow);
    touchEpisode(episode);
    markDirty("시간표 구성 삭제");
    renderRundown(episode);
    return;
  }

  if (target.id === "addMusicBtn" && episode) {
    episode.music.push({
      id: uid("music"),
      timing: `음악 ${episode.music.length + 1}`,
      title: "",
      artist: "",
      recommendedBy: episode.guest || "",
      reason: "",
      rightsNote: "송출 전 확인",
    });
    touchEpisode(episode);
    markDirty("추천 음악 추가");
    renderMusic(episode);
    return;
  }

  if (target.dataset.deleteMusic && episode) {
    episode.music = episode.music.filter((track) => track.id !== target.dataset.deleteMusic);
    touchEpisode(episode);
    markDirty("추천 음악 삭제");
    renderMusic(episode);
    return;
  }

  if (target.id === "saveBtn") {
    saveNow("수동 저장");
    return;
  }

  if (target.id === "reloadBtn") {
    loadState(true);
    return;
  }

  if (target.id === "openEpisodeBtn" && episode) {
    openEpisodeView();
    return;
  }

  if (target.id === "loadLatestBtn") {
    if (pendingRemoteState) {
      state = pendingRemoteState;
      dirty = false;
      pendingRemoteState = null;
      elements.conflictBanner.hidden = true;
      renderAll();
      setSaveState("최신본");
    } else {
      loadState(true);
    }
    return;
  }

  if (target.id === "importMdBtn") {
    openImportModal();
    return;
  }

  if (target.id === "closeImportBtn" || target === elements.importModal) {
    closeImportModal();
    return;
  }

  if (target.id === "useSampleMdBtn") {
    elements.mdImportText.value = sampleMarkdown();
    elements.importStatus.textContent = "예시 MD를 불러왔습니다.";
    setImportSampleMode(true);
    return;
  }

  if (target.id === "importCurrentBtn") {
    importMarkdown(false);
    return;
  }

  if (target.id === "importNewBtn") {
    importMarkdown(true);
    return;
  }

  if (target.id === "copyScriptBtn" && episode) {
    navigator.clipboard?.writeText(scriptPreviewPlainText(episode));
    return;
  }

  if (target.id === "exportMdBtn") {
    exportMarkdown();
    return;
  }

  if (target.id === "exportPdfBtn") {
    exportPdf();
  }
});

async function openEpisodeView() {
  const episode = currentEpisode();
  if (!episode) return;
  if (!(await ensureSaved("시나리오 보기 전 저장"))) return;
  window.open(`/episode.html?episode=${encodeURIComponent(episode.id)}`, "_blank");
}

elements.mdFileInput.addEventListener("change", async () => {
  const file = elements.mdFileInput.files?.[0];
  if (!file) return;
  elements.mdImportText.value = await file.text();
  setImportSampleMode(false);
  elements.importStatus.textContent = `${file.name} 파일을 불러왔습니다.`;
  elements.mdFileInput.value = "";
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("hashchange", handleInitialHash);

loadState(true).then(handleInitialHash);
setInterval(() => loadState(false), 7000);

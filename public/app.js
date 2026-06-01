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

async function getJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || "요청에 실패했습니다.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function currentEpisode() {
  return state?.episodes.find((episode) => episode.id === selectedEpisodeId) || state?.episodes[0] || null;
}

function setSaveState(text, mode = "") {
  elements.saveState.textContent = text;
  elements.saveState.className = `save-state ${mode}`.trim();
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

function renderPreviewBlock(block) {
  const escaped = escapeHtml(block);
  if (escaped.startsWith("### ")) {
    return `<h4>${escaped.slice(4)}</h4>`;
  }
  return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
}

function renderScriptPreview(episode) {
  const label = SCRIPT_VIEWS.find(([key]) => key === selectedScriptView)?.[1] || "전체";
  elements.scriptPreviewTitle.textContent = selectedScriptView === "all" ? "전체 대본" : `${label} 보기`;
  const text = scriptPreviewPlainText(episode);
  elements.scriptPreviewText.innerHTML = text
    ? text.split(/\n{2,}/).map(renderPreviewBlock).join("")
    : `<p class="empty-preview">아직 입력된 대본이 없습니다.</p>`;
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
    segment: cellByHeader(row, ["구성", "코너", "segment"]),
    time: cellByHeader(row, ["시간", "time"]),
    duration: cellByHeader(row, ["길이", "분량", "duration", "소요"]),
    details: cellByHeader(row, ["세부사항", "내용", "details"]),
    cast: cellByHeader(row, ["출연", "cast", "담당"]),
  })).filter((row) => row.segment || row.time || row.details);
}

function parseMusic(section, guest) {
  return parseMarkdownTable(section).map((row) => ({
    id: uid("music"),
    timing: cellByHeader(row, ["순서", "타이밍", "구성", "timing"]),
    title: cellByHeader(row, ["곡명", "제목", "title"]),
    artist: cellByHeader(row, ["가수", "아티스트", "artist"]),
    recommendedBy: cellByHeader(row, ["추천자", "recommended"]) || guest || "",
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
    opening: findSection(markdown, ["오프닝 멘트", "오프닝"]),
    talk1: findSection(markdown, ["토크 1", "토크1"]),
    talk2: findSection(markdown, ["토크 2", "토크2"]),
    talk3: findSection(markdown, ["토크 3", "토크3"]),
    closingQuestion: findSection(markdown, ["마무리 질문", "클로징 질문"]),
    ending: findSection(markdown, ["엔딩 멘트", "엔딩"]),
  };

  Object.entries(scriptSections).forEach(([key, value]) => {
    if (value) episode.script[key] = value;
  });

  const music = parseMusic(findSection(markdown, ["게스트 추천 음악", "추천 음악"]), episode.guest);
  if (music.length) episode.music = music;

  const notes = findSection(markdown, ["방송 후 메모", "방송 후 정리", "메모"]);
  if (notes) episode.notes = notes;

  touchEpisode(episode);
  return episode;
}

function sampleMarkdown() {
  return `# Riding-star 방송 시나리오

## EP.02 강변을 따라 달리는 오후

- 주제: 퇴근길 라이딩과 마음을 식히는 코스
- 게스트: 김민수
- 진행: 왕규, 정규
- 방송국: 전주공동체라디오 93.5MHz
- 녹음일: 2026.06.10
- 방송일: 2026.06.17 19:00
- 장소: 방송실
- 러닝타임: 56분
- 상태: 초안
- 키워드: 강변, 퇴근길, 음악, 안전

### 전체 방송 시간표

| 구성 | 시간 | 길이 | 세부사항 | 출연 |
|---|---:|---:|---|---|
| 오프닝 | 00:00-03:00 | 3분 | 오늘의 날씨와 강변 라이딩 주제 소개 | 진행자 |
| 토크 1 | 07:00-17:00 | 10분 | 퇴근 후 자전거를 타게 된 계기 | 진행자 & 게스트 |
| 토크 2 | 20:00-35:00 | 15분 | 강변 코스에서 지키는 안전 리듬 | 진행자 & 게스트 |
| 토크 3 | 38:00-50:00 | 12분 | 쉬어가기 좋은 지점과 추천 코스 | 진행자 & 게스트 |
| 엔딩 멘트 | 53:00-56:00 | 3분 | 다음 회차 예고와 감사 인사 | 진행자 |

### 오프닝 멘트

왕규: 오늘은 하루를 마치고 강변을 따라 천천히 달리는 이야기를 준비했습니다.

정규: 바퀴 소리와 물결 소리가 섞이는 저녁, Riding-star 시작합니다.

### 토크 1

정규: 퇴근 후 자전거를 타게 된 첫 계기는 무엇이었나요?

게스트: 머리를 비우고 싶어서였어요. 어느 날 강변을 달렸는데 마음이 가벼워졌습니다.

### 토크 2

왕규: 강변 코스에서는 속도보다 안전이 중요하죠. 어떤 점을 가장 신경 쓰나요?

게스트: 보행자와 간격을 두고, 조명을 꼭 켜고, 무리해서 추월하지 않는 것입니다.

### 토크 3

정규: 그 코스에서 쉬어가기 좋은 장소가 있다면요?

게스트: 다리 아래 벤치가 좋아요. 물소리를 들으며 잠깐 쉬기 좋습니다.

### 마무리 질문

왕규: 오늘 방송이 끝나면 어떤 마음으로 돌아가고 싶으세요?

게스트: 천천히 가도 충분하다는 마음이요.

### 엔딩 멘트

정규: 오늘 Riding-star는 강변을 따라 달리는 오후를 함께했습니다.

왕규: 다음 회차에서도 두 바퀴 위의 이야기를 가지고 돌아오겠습니다.

### 게스트 추천 음악

| 순서 | 곡명 | 가수 | 추천자 | 추천 이유 | 저작권/송출 확인 |
|---|---|---|---|---|---|
| 음악 1 |  |  | 김민수 | 퇴근길 분위기에 어울리는 곡 | 송출 전 확인 |
| 음악 2 |  |  | 김민수 | 강변을 천천히 달릴 때 듣고 싶은 곡 | 송출 전 확인 |

### 방송 후 메모

녹음 후 실제 러닝타임과 편집 지점을 적습니다.
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
  const markdown = elements.mdImportText.value.trim();
  if (!markdown) {
    elements.importStatus.textContent = "가져올 MD 내용을 입력해 주세요.";
    return;
  }

  const current = currentEpisode();
  const parsed = parseMarkdownScenario(markdown, asNew ? createBlankEpisode() : current, !asNew);

  if (asNew) {
    state.episodes.push(parsed);
  } else {
    const index = state.episodes.findIndex((episode) => episode.id === current.id);
    state.episodes[index] = parsed;
  }

  selectedEpisodeId = parsed.id;
  closeImportModal();
  renderAll();
  markDirty(asNew ? "MD 새 회차 가져오기" : "MD 현재 회차 적용");
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

elements.mdFileInput.addEventListener("change", async () => {
  const file = elements.mdFileInput.files?.[0];
  if (!file) return;
  elements.mdImportText.value = await file.text();
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

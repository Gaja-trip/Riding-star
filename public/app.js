const SCRIPT_FIELDS = [
  ["opening", "오프닝 멘트"],
  ["talk1", "토크 1"],
  ["talk2", "토크 2"],
  ["talk3", "토크 3"],
  ["closingQuestion", "마무리 질문"],
  ["ending", "엔딩 멘트"],
];

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
  scriptFields: document.querySelector("#scriptFields"),
  musicRows: document.querySelector("#musicRows"),
  conflictBanner: document.querySelector("#conflictBanner"),
};

let state = null;
let selectedEpisodeId = localStorage.getItem("ridingStarSelectedEpisode") || "";
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
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function renderScript(episode) {
  elements.scriptFields.innerHTML = SCRIPT_FIELDS.map(([key, label]) => `
    <div class="script-field">
      <label for="script-${key}">${label}</label>
      <textarea id="script-${key}" class="textarea" data-script="${key}">${escapeHtml(episode.script?.[key] || "")}</textarea>
    </div>
  `).join("");
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
  if (!state.episodes.length) {
    state.episodes.push(createBlankEpisode());
  }

  if (!state.episodes.some((episode) => episode.id === selectedEpisodeId)) {
    selectedEpisodeId = state.episodes[0].id;
  }

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

function updateHeadingAfterMeta(field) {
  if (["episodeNo", "title", "theme", "guest", "status", "airDate"].includes(field)) {
    const episode = currentEpisode();
    renderHeading(episode);
    renderEpisodeList();
  }
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
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === tabButton));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    document.querySelector(`#${tabButton.dataset.tab}Panel`)?.classList.add("active");
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
    const clone = JSON.parse(JSON.stringify(episode));
    clone.id = uid("ep");
    clone.episodeNo = `${episode.episodeNo || "EP"} copy`;
    clone.title = `${episode.title || "회차"} 복제본`;
    clone.status = "초안";
    clone.updatedAt = new Date().toISOString();
    clone.rundown = clone.rundown.map((row) => ({ ...row, id: uid("run") }));
    clone.music = clone.music.map((track) => ({ ...track, id: uid("music") }));
    state.episodes.push(clone);
    selectedEpisodeId = clone.id;
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

  if (target.id === "exportBtn") {
    window.location.href = "/api/export.md";
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

loadState(true);
setInterval(() => loadState(false), 7000);

const fs = require("fs");
const path = require("path");

const BUNDLED_DATA_FILE = path.join(process.cwd(), "data", "scenarios.json");
const RUNTIME_DATA_FILE = path.join("/tmp", "riding-star-scenarios.json");

let memoryState = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadState() {
  if (memoryState) return memoryState;

  if (fs.existsSync(RUNTIME_DATA_FILE)) {
    memoryState = readJson(RUNTIME_DATA_FILE);
    return memoryState;
  }

  memoryState = readJson(BUNDLED_DATA_FILE);
  return memoryState;
}

function saveState(state) {
  memoryState = state;
  writeJson(RUNTIME_DATA_FILE, state);
}

function sanitizeState(candidate, previousState, editor, note) {
  const incoming = candidate && typeof candidate === "object" ? candidate : {};
  const episodes = Array.isArray(incoming.episodes) ? incoming.episodes : [];
  const safeEpisodes = episodes.map((episode, index) => ({
    id: String(episode.id || `ep-${Date.now()}-${index}`),
    episodeNo: String(episode.episodeNo || ""),
    title: String(episode.title || ""),
    theme: String(episode.theme || ""),
    guest: String(episode.guest || ""),
    hosts: String(episode.hosts || ""),
    station: String(episode.station || ""),
    recordDate: String(episode.recordDate || ""),
    airDate: String(episode.airDate || ""),
    location: String(episode.location || ""),
    duration: String(episode.duration || ""),
    status: String(episode.status || "초안"),
    keywords: String(episode.keywords || ""),
    summary: String(episode.summary || ""),
    rundown: Array.isArray(episode.rundown)
      ? episode.rundown.map((row) => ({
          id: String(row.id || `run-${Date.now()}-${Math.random()}`),
          segment: String(row.segment || ""),
          time: String(row.time || ""),
          duration: String(row.duration || ""),
          details: String(row.details || ""),
          cast: String(row.cast || ""),
        }))
      : [],
    script: {
      opening: String(episode.script?.opening || ""),
      talk1: String(episode.script?.talk1 || ""),
      talk2: String(episode.script?.talk2 || ""),
      talk3: String(episode.script?.talk3 || ""),
      closingQuestion: String(episode.script?.closingQuestion || ""),
      ending: String(episode.script?.ending || ""),
    },
    music: Array.isArray(episode.music)
      ? episode.music.map((track) => ({
          id: String(track.id || `music-${Date.now()}-${Math.random()}`),
          timing: String(track.timing || ""),
          title: String(track.title || ""),
          artist: String(track.artist || ""),
          recommendedBy: String(track.recommendedBy || ""),
          reason: String(track.reason || ""),
          rightsNote: String(track.rightsNote || ""),
        }))
      : [],
    notes: String(episode.notes || ""),
    updatedAt: new Date().toISOString(),
  }));

  const changeLog = Array.isArray(previousState.changeLog)
    ? previousState.changeLog.slice(-49)
    : [];
  changeLog.push({
    id: `change-${Date.now()}`,
    editor: editor || "이름 없음",
    note: note || "시나리오 수정",
    at: new Date().toISOString(),
  });

  return {
    appName: "Riding-star",
    version: Number(previousState.version || 0) + 1,
    updatedAt: new Date().toISOString(),
    episodes: safeEpisodes,
    changeLog,
  };
}

function mdCell(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function episodeToMarkdown(episode) {
  const lines = [];
  lines.push(`## ${episode.episodeNo || "회차 미정"} ${episode.title || ""}`.trim());
  lines.push("");
  lines.push(`- 주제: ${episode.theme || ""}`);
  lines.push(`- 게스트: ${episode.guest || ""}`);
  lines.push(`- 진행: ${episode.hosts || ""}`);
  lines.push(`- 방송국: ${episode.station || ""}`);
  lines.push(`- 녹음일: ${episode.recordDate || ""}`);
  lines.push(`- 방송일: ${episode.airDate || ""}`);
  lines.push(`- 장소: ${episode.location || ""}`);
  lines.push(`- 러닝타임: ${episode.duration || ""}`);
  lines.push(`- 상태: ${episode.status || ""}`);
  lines.push(`- 키워드: ${episode.keywords || ""}`);
  lines.push("");

  if (episode.summary) {
    lines.push("### 회차 요약", "", episode.summary, "");
  }

  lines.push("### 전체 방송 시간표", "");
  lines.push("| 구성 | 시간 | 길이 | 세부사항 | 출연 |");
  lines.push("|---|---:|---:|---|---|");
  (episode.rundown || []).forEach((row) => {
    lines.push(`| ${mdCell(row.segment)} | ${mdCell(row.time)} | ${mdCell(row.duration)} | ${mdCell(row.details)} | ${mdCell(row.cast)} |`);
  });
  lines.push("");

  [
    ["오프닝 멘트", episode.script?.opening],
    ["토크 1", episode.script?.talk1],
    ["토크 2", episode.script?.talk2],
    ["토크 3", episode.script?.talk3],
    ["마무리 질문", episode.script?.closingQuestion],
    ["엔딩 멘트", episode.script?.ending],
  ].forEach(([title, text]) => {
    lines.push(`### ${title}`, "", text || "", "");
  });

  lines.push("### 게스트 추천 음악", "");
  lines.push("| 순서 | 곡명 | 가수 | 추천자 | 추천 이유 | 저작권/송출 확인 |");
  lines.push("|---|---|---|---|---|---|");
  (episode.music || []).forEach((track) => {
    lines.push(`| ${mdCell(track.timing)} | ${mdCell(track.title)} | ${mdCell(track.artist)} | ${mdCell(track.recommendedBy)} | ${mdCell(track.reason)} | ${mdCell(track.rightsNote)} |`);
  });
  lines.push("");

  if (episode.notes) {
    lines.push("### 방송 후 메모", "", episode.notes, "");
  }

  return lines.join("\n");
}

function stateToMarkdown(state, episodeId) {
  const episodes = episodeId
    ? state.episodes.filter((episode) => episode.id === episodeId)
    : state.episodes;
  const lines = [
    "# Riding-star 방송 시나리오 공유본",
    "",
    `내보낸 시각: ${new Date().toLocaleString("ko-KR")}`,
    "",
  ];

  episodes.forEach((episode, index) => {
    if (index > 0) lines.push("");
    lines.push(episodeToMarkdown(episode));
  });

  return `${lines.join("\n").trim()}\n`;
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
}

module.exports = function handler(req, res) {
  const apiPath = `/${[].concat(req.query.path || []).join("/")}`;

  try {
    if (req.method === "GET" && apiPath === "/health") {
      sendJson(res, 200, { ok: true, now: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && apiPath === "/state") {
      sendJson(res, 200, loadState());
      return;
    }

    if (req.method === "POST" && apiPath === "/save") {
      const payload = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
      const currentState = loadState();

      if (Number(payload.clientVersion) !== Number(currentState.version)) {
        sendJson(res, 409, {
          message: "다른 사용자의 최신 수정본이 먼저 저장되었습니다.",
          currentState,
        });
        return;
      }

      const nextState = sanitizeState(payload.state, currentState, payload.editor, payload.note);
      saveState(nextState);
      sendJson(res, 200, nextState);
      return;
    }

    if (req.method === "GET" && apiPath === "/export.md") {
      const markdown = stateToMarkdown(loadState(), req.query.episode);
      res.status(200);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="riding-star-scenario.md"');
      res.setHeader("Cache-Control", "no-store");
      res.send(markdown);
      return;
    }

    sendJson(res, 404, { message: "API를 찾을 수 없습니다." });
  } catch (error) {
    sendJson(res, 500, { message: error.message || "서버 오류가 발생했습니다." });
  }
};

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 5187);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(DATA_DIR, "scenarios.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryFile = `${filePath}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryFile, filePath);
}

function loadState() {
  return readJson(DATA_FILE);
}

function saveState(state) {
  writeJson(DATA_FILE, state);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("요청 데이터가 너무 큽니다."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
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
    rundown: Array.isArray(episode.rundown) ? episode.rundown.map((row) => ({
      id: String(row.id || `run-${Date.now()}-${Math.random()}`),
      segment: String(row.segment || ""),
      time: String(row.time || ""),
      duration: String(row.duration || ""),
      details: String(row.details || ""),
      cast: String(row.cast || ""),
    })) : [],
    script: {
      opening: String(episode.script?.opening || ""),
      talk1: String(episode.script?.talk1 || ""),
      talk2: String(episode.script?.talk2 || ""),
      talk3: String(episode.script?.talk3 || ""),
      closingQuestion: String(episode.script?.closingQuestion || ""),
      ending: String(episode.script?.ending || ""),
    },
    music: Array.isArray(episode.music) ? episode.music.map((track) => ({
      id: String(track.id || `music-${Date.now()}-${Math.random()}`),
      timing: String(track.timing || ""),
      title: String(track.title || ""),
      artist: String(track.artist || ""),
      recommendedBy: String(track.recommendedBy || ""),
      reason: String(track.reason || ""),
      rightsNote: String(track.rightsNote || ""),
    })) : [],
    notes: String(episode.notes || ""),
    updatedAt: new Date().toISOString(),
  }));

  const changeLog = Array.isArray(previousState.changeLog) ? previousState.changeLog.slice(-49) : [];
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

function stateToMarkdown(state) {
  const lines = [
    "# Riding-star 방송 시나리오 공유본",
    "",
    `내보낸 시각: ${new Date().toLocaleString("ko-KR")}`,
    "",
  ];

  state.episodes.forEach((episode) => {
    lines.push(`## ${episode.episodeNo || "회차 미정"} ${episode.title || ""}`.trim());
    lines.push("");
    lines.push(`- 주제: ${episode.theme || ""}`);
    lines.push(`- 게스트: ${episode.guest || ""}`);
    lines.push(`- 진행: ${episode.hosts || ""}`);
    lines.push(`- 녹음: ${episode.recordDate || ""} / 방송: ${episode.airDate || ""}`);
    lines.push(`- 장소: ${episode.location || ""}`);
    lines.push(`- 상태: ${episode.status || ""}`);
    lines.push("");

    lines.push("### 전체 시간표");
    lines.push("");
    lines.push("| 구성 | 시간 | 길이 | 세부사항 | 출연 |");
    lines.push("|---|---:|---:|---|---|");
    episode.rundown.forEach((row) => {
      lines.push(`| ${row.segment} | ${row.time} | ${row.duration} | ${(row.details || "").replace(/\n/g, "<br>")} | ${row.cast} |`);
    });
    lines.push("");

    [
      ["오프닝 멘트", episode.script.opening],
      ["토크 1", episode.script.talk1],
      ["토크 2", episode.script.talk2],
      ["토크 3", episode.script.talk3],
      ["마무리 질문", episode.script.closingQuestion],
      ["엔딩 멘트", episode.script.ending],
    ].forEach(([title, text]) => {
      lines.push(`### ${title}`);
      lines.push("");
      lines.push(text || "");
      lines.push("");
    });

    lines.push("### 게스트 추천 음악");
    lines.push("");
    lines.push("| 순서 | 곡명 | 가수 | 추천자 | 추천 이유 | 저작권/송출 확인 |");
    lines.push("|---|---|---|---|---|---|");
    episode.music.forEach((track) => {
      lines.push(`| ${track.timing} | ${track.title} | ${track.artist} | ${track.recommendedBy} | ${track.reason} | ${track.rightsNote} |`);
    });
    lines.push("");

    if (episode.notes) {
      lines.push("### 방송 후 메모");
      lines.push("");
      lines.push(episode.notes);
      lines.push("");
    }
  });

  return lines.join("\n");
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    res.end(data);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, now: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, loadState());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/save") {
      const body = await collectBody(req);
      const payload = JSON.parse(body || "{}");
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

    if (req.method === "GET" && url.pathname === "/api/export.md") {
      const markdown = stateToMarkdown(loadState());
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="riding-star-scenarios.md"',
      });
      res.end(markdown);
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { message: error.message || "서버 오류가 발생했습니다." });
  }
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const server = http.createServer(handleRequest);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Riding-star scenario hub is running.`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://<이 컴퓨터의 IP>:${PORT}`);
});

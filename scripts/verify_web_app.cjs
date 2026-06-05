const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.VERIFY_PORT || 5297);
const verifyDir = fs.mkdtempSync(path.join(os.tmpdir(), "riding-star-web-verify-"));
const dataFile = path.join(verifyDir, "scenarios.verify.json");

fs.mkdirSync(verifyDir, { recursive: true });
fs.copyFileSync(path.join(root, "data", "scenarios.json"), dataFile);

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : undefined,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(JSON.parse(data));
        });
      },
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function requestText(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(data);
        });
      },
    ).on("error", reject);
  });
}

async function waitForServer(server) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 8000) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited early with code ${server.exitCode}`);
    }

    try {
      await requestJson("GET", "/api/health");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  throw lastError || new Error("Server did not start.");
}

async function main() {
  const server = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: dataFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const serverOutput = [];
  server.stdout.on("data", (chunk) => serverOutput.push(chunk.toString()));
  server.stderr.on("data", (chunk) => serverOutput.push(chunk.toString()));

  try {
    await waitForServer(server);

    const state = await requestJson("GET", "/api/state");
    assert.equal(state.appName, "Riding-star");
    assert.ok(state.episodes.length > 0, "At least one episode should exist.");
    assert.equal(state.episodes[0].episodeNo, "EP.01");
    assert.equal(state.episodes[0].status, "샘플");
    assert.ok(state.episodes[0].script.opening.includes("라이딩스타"));

    const homeHtml = await requestText("/");
    const archiveHtml = await requestText("/archive.html");
    const scenarioHtml = await requestText("/scenarios.html");
    const episodeHtml = await requestText("/episode.html");
    const css = await requestText("/styles.css");
    const homeJs = await requestText("/home.js");
    const archiveJs = await requestText("/archive.js");
    const appJs = await requestText("/app.js");
    const episodeJs = await requestText("/episode.js");
    const printHtml = await requestText("/print.html");
    const printJs = await requestText("/print.js");

    assert.ok(homeHtml.includes("riding-star-main.png"));
    assert.ok(homeHtml.includes("전주FM"));
    assert.ok(homeHtml.includes("menu-jeonjufm.svg"));
    assert.ok(homeHtml.includes("menu-cast.svg"));
    assert.ok(homeHtml.includes("menu-archive.svg"));
    assert.ok(homeHtml.includes("menu-scenario.svg"));
    assert.ok(homeHtml.includes("/archive.html"));
    assert.ok(archiveHtml.includes("archiveSearch"));
    assert.ok(archiveHtml.includes("archive-body"));
    assert.ok(archiveHtml.includes("날짜별 회차 방송 내용"));
    assert.ok(archiveHtml.includes("/archive.js"));
    const castHtml = await requestText("/cast.html");
    assert.ok(castHtml.includes("cast-park-junggyu.png"));
    assert.ok(castHtml.includes("cast-kang-wanggyu.png"));
    assert.ok(castHtml.includes("cast-body"));
    assert.ok(castHtml.includes("menu-home.svg"));
    assert.ok(castHtml.includes("menu-cast.svg"));
    assert.ok(castHtml.includes("menu-archive.svg"));
    assert.ok(castHtml.includes("menu-scenario.svg"));
    assert.ok(castHtml.includes("회차별 게스트"));
    assert.ok(castHtml.includes("11회"));
    assert.ok(castHtml.includes("김길중"));
    assert.ok(scenarioHtml.includes("Riding-star Scenario Hub"));
    assert.ok(scenarioHtml.includes("importMdBtn"));
    assert.ok(scenarioHtml.includes("openEpisodeBtn"));
    assert.ok(scenarioHtml.includes("scenarioOverviewText"));
    assert.ok(scenarioHtml.includes("<option>샘플</option>"));
    assert.ok(scenarioHtml.includes("exportPdfBtn"));
    assert.ok(episodeHtml.includes("episodeRoot"));
    assert.ok(css.includes("archive-section"));
    assert.ok(css.includes("archive-page-main"));
    assert.ok(css.includes("archive-group h3 a"));
    assert.ok(css.includes("body.cast-body"));
    assert.ok(css.includes("cast-guest-list"));
    assert.ok(css.includes("menu-label-img"));
    assert.ok(css.includes("poster-menu-label-img"));
    assert.ok(css.includes("home-menu-label-img"));
    assert.ok(css.includes("episode-viewer"));
    assert.ok(homeJs.includes("parseEpisodeDate"));
    assert.ok(homeJs.includes("loadHomeStats"));
    assert.ok(archiveJs.includes("/episode.html"));
    assert.ok(archiveJs.includes("archiveList"));
    assert.ok(archiveJs.includes("archiveDateHref"));
    assert.ok(appJs.includes("parseMarkdownScenario"));
    assert.ok(appJs.includes("renderScenarioOverview"));
    assert.ok(appJs.includes("## EP.01 천천히, 같이, 멀리"));
    assert.ok(appJs.includes("- 상태: 샘플"));
    assert.ok(episodeJs.includes("renderEpisode"));
    assert.ok(episodeJs.includes("시나리오 관리"));
    assert.ok(printHtml.includes("printBtn"));
    assert.ok(printJs.includes("renderEpisode"));

    const savePayload = JSON.stringify({
      clientVersion: state.version,
      state,
      editor: "verify",
      note: "verify save",
    });
    const saved = await requestJson("POST", "/api/save", savePayload);
    assert.equal(saved.version, state.version + 1);

    console.log(JSON.stringify({
      ok: true,
      url: `http://127.0.0.1:${port}`,
      episodes: state.episodes.length,
      savedVersion: saved.version,
    }, null, 2));
  } catch (error) {
    console.error(serverOutput.join(""));
    throw error;
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

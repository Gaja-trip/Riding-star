const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.VERIFY_PORT || 5297);
const verifyDir = path.join(root, "dist", "web-verify");
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
    assert.ok(homeHtml.includes("/archive.html"));
    assert.ok(archiveHtml.includes("archiveSearch"));
    assert.ok(archiveHtml.includes("/archive.js"));
    assert.ok(scenarioHtml.includes("Riding-star Scenario Hub"));
    assert.ok(scenarioHtml.includes("importMdBtn"));
    assert.ok(scenarioHtml.includes("exportPdfBtn"));
    assert.ok(episodeHtml.includes("episodeRoot"));
    assert.ok(css.includes("archive-section"));
    assert.ok(css.includes("archive-page-main"));
    assert.ok(css.includes("episode-viewer"));
    assert.ok(homeJs.includes("parseEpisodeDate"));
    assert.ok(homeJs.includes("loadHomeStats"));
    assert.ok(archiveJs.includes("/episode.html"));
    assert.ok(archiveJs.includes("archiveList"));
    assert.ok(appJs.includes("parseMarkdownScenario"));
    assert.ok(episodeJs.includes("renderEpisode"));
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

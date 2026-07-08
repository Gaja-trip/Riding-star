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

function assertOrdered(source, values, label) {
  let cursor = -1;
  for (const value of values) {
    const next = source.indexOf(value);
    assert.ok(next > cursor, `${label} should contain ${value} in order.`);
    cursor = next;
  }
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
    const travelHtml = await requestText("/travel-info.html");
    const archiveHtml = await requestText("/archive.html");
    const scenarioHtml = await requestText("/scenarios.html");
    const episodeHtml = await requestText("/episode.html");
    const css = await requestText("/styles.css");
    const homeJs = await requestText("/home.js");
    const archiveJs = await requestText("/archive.js");
    const appJs = await requestText("/app.js");
    const episodeJs = await requestText("/episode.js");
    const travelJs = await requestText("/travel-info.js");
    const printHtml = await requestText("/print.html");
    const printJs = await requestText("/print.js");
    const menuInfoSvg = await requestText("/assets/menu-info.svg");
    const menuCastSvg = await requestText("/assets/menu-cast.svg");
    const textMenuOrder = [
      'aria-label="정보">정보</a>',
      'aria-label="시나리오">시나리오</a>',
      'aria-label="회차보기">회차보기</a>',
      'aria-label="출연진">출연진</a>',
    ];
    const homeMenuOrder = [
      'href="/travel-info.html">정보</a>',
      'href="https://broad-script.vercel.app">시나리오</a>',
      'href="/archive.html">회차보기</a>',
      'href="/cast.html">출연진</a>',
    ];
    const mainSequenceVideos = [
      "/assets/main-sequence/riding-intro-01.mp4",
      "/assets/main-sequence/riding-intro-02.mp4",
      "/assets/main-sequence/riding-intro-03.mp4",
      "/assets/main-sequence/riding-intro-04.mp4",
      "/assets/main-sequence/bicycle-radio-promo-no-korean-text.mp4",
      "/assets/main-sequence/jeonju-community-radio-promo-draft.mp4",
    ];

    assert.ok(!homeHtml.includes("riding-star-main.png"));
    assert.ok(!homeHtml.includes("jun6-travel-poster"));
    assert.ok(homeHtml.includes("poster-sequence"));
    assert.ok(homeHtml.includes("poster-media-stack"));
    assert.ok(!homeHtml.includes("poster-final-image"));
    assert.ok(homeHtml.includes("poster-replay-button"));
    mainSequenceVideos.forEach((videoPath) => {
      assert.ok(homeHtml.includes(videoPath), `${videoPath} should be in home HTML.`);
      assert.ok(fs.existsSync(path.join(root, "public", videoPath)), `${videoPath} should exist.`);
    });
    assert.ok(homeHtml.includes("정보"));
    assert.ok(!homeHtml.includes("여행정보"));
    assert.ok(!homeHtml.includes("종합정보"));
    assert.ok(!homeHtml.includes("menu-info.svg"));
    assert.ok(!homeHtml.includes("menu-cast.svg"));
    assert.ok(!homeHtml.includes("menu-archive.svg"));
    assert.ok(!homeHtml.includes("menu-scenario.svg"));
    assert.ok(homeHtml.includes("poster-mobile-top"));
    assert.ok(homeHtml.includes("poster-mobile-bottom"));
    assert.ok(homeHtml.includes("모바일 상단 바로가기"));
    assert.ok(homeHtml.includes("모바일 하단 바로가기"));
    assert.ok(homeHtml.includes('href="/travel-info.html">정보</a>'));
    assert.ok(homeHtml.includes('href="https://broad-script.vercel.app">시나리오</a>'));
    assert.ok(!homeHtml.includes("menu-jeonjufm.svg"));
    assert.ok(!homeHtml.includes("https://jcfm.kr"));
    assertOrdered(homeHtml, homeMenuOrder, "Home menu");
    assert.ok(homeHtml.includes("/archive.html"));
    assert.ok(travelHtml.includes("travel-body"));
    assert.ok(travelHtml.includes("정보"));
    assert.ok(!travelHtml.includes("여행정보"));
    assert.ok(travelHtml.includes('href="https://bicycle-trip.vercel.app/"'));
    assert.ok(travelHtml.includes('href="https://bicycle-tripmap.vercel.app/"'));
    assert.ok(travelHtml.includes('href="https://hopesound.github.io/bicycle-map/"'));
    assert.ok(travelHtml.includes('href="https://tgj-test.vercel.app/"'));
    assert.ok(travelHtml.includes('href="https://bicycle-route.vercel.app/"'));
    assert.ok(travelHtml.includes('href="https://jeju-gaja.vercel.app/"'));
    assert.ok(!travelHtml.includes("Riding-star Info"));
    assert.ok(!travelHtml.includes("<h1>정보</h1>"));
    assert.ok(travelHtml.includes("info-site-panel"));
    assert.ok(travelHtml.includes("infoPreviewFrame"));
    assert.ok(travelHtml.includes("infoPreviewOpen"));
    assert.ok(travelHtml.includes('data-title="bicycle-trip"'));
    assert.ok(travelHtml.includes('data-title="bicycle-tripmap"'));
    assert.ok(travelHtml.includes('data-title="bicycle-map"'));
    assert.ok(travelHtml.includes('data-title="tgj-test"'));
    assert.ok(travelHtml.includes('data-title="bicycle-route"'));
    assert.ok(travelHtml.includes('data-title="jeju-gaja"'));
    assert.ok(travelHtml.includes('<iframe id="infoPreviewFrame" title="bicycle-trip 메인 화면"'));
    assertOrdered(travelHtml, textMenuOrder, "Travel text menu");
    assert.ok(!travelHtml.includes("home-menu-label-img"));
    assert.ok(archiveHtml.includes("archiveSearch"));
    assert.ok(archiveHtml.includes("archive-body"));
    assert.ok(archiveHtml.includes("날짜별 회차 방송 내용"));
    assert.ok(archiveHtml.includes('href="/travel-info.html" aria-label="정보"'));
    assert.ok(archiveHtml.includes('href="https://broad-script.vercel.app" aria-label="시나리오"'));
    assertOrdered(archiveHtml, textMenuOrder, "Archive text menu");
    assert.ok(!archiveHtml.includes("home-menu-label-img"));
    assert.ok(archiveHtml.includes("/archive.js"));
    const castHtml = await requestText("/cast.html");
    assert.ok(castHtml.includes("cast-park-junggyu.png"));
    assert.ok(castHtml.includes("cast-kang-wanggyu.png"));
    assert.ok(castHtml.includes("cast-body"));
    assert.ok(castHtml.includes('href="/travel-info.html" aria-label="정보"'));
    assert.ok(castHtml.includes('href="https://broad-script.vercel.app" aria-label="시나리오"'));
    assertOrdered(castHtml, textMenuOrder, "Cast text menu");
    assert.ok(!castHtml.includes("home-menu-label-img"));
    assert.ok(castHtml.includes("회차별 게스트"));
    assert.ok(castHtml.includes("김원섭"));
    assert.ok(castHtml.includes("11회"));
    assert.ok(castHtml.includes("김길중"));
    assert.ok(scenarioHtml.includes("Riding-star Scenario Hub"));
    assert.ok(scenarioHtml.includes("정보"));
    assert.ok(scenarioHtml.includes("importMdBtn"));
    assert.ok(scenarioHtml.includes("openEpisodeBtn"));
    assert.ok(scenarioHtml.includes("scenarioOverviewText"));
    assert.ok(scenarioHtml.includes("<option>샘플</option>"));
    assert.ok(scenarioHtml.includes("exportPdfBtn"));
    assert.ok(episodeHtml.includes("episodeRoot"));
    assert.ok(episodeHtml.includes('href="/travel-info.html" aria-label="정보"'));
    assert.ok(episodeHtml.includes('href="https://broad-script.vercel.app" aria-label="시나리오"'));
    assertOrdered(episodeHtml, textMenuOrder, "Episode text menu");
    assert.ok(!episodeHtml.includes("home-menu-label-img"));
    assert.ok(css.includes("archive-section"));
    assert.ok(css.includes("archive-page-main"));
    assert.ok(css.includes("archive-group h3 a"));
    assert.ok(css.includes("body.cast-body"));
    assert.ok(css.includes("cast-guest-list"));
    assert.ok(css.includes("menu-label-img"));
    assert.ok(css.includes("poster-menu-label-img"));
    assert.ok(css.includes("home-menu-label-img"));
    assert.ok(css.includes("info-browser"));
    assert.ok(css.includes("info-preview-frame"));
    assert.ok(css.includes("poster-mobile-nav"));
    assert.ok(css.includes("poster-media-stack"));
    assert.ok(css.includes("contrast(1.04) saturate(1.06) brightness(1.01)"));
    assert.ok(css.includes("poster-sequence-status"));
    assert.ok(css.includes("display: none"));
    assert.ok(css.includes(".poster-radio-hotspot"));
    assert.ok(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"));
    assert.ok(css.includes("episode-viewer"));
    assert.ok(homeJs.includes("parseEpisodeDate"));
    assert.ok(homeJs.includes("loadHomeStats"));
    assert.ok(homeJs.includes("activateSequenceVideo"));
    assert.ok(homeJs.includes("playNextSequenceVideo"));
    assert.ok(homeJs.includes("syncSequenceTotal"));
    assert.ok(!homeJs.includes("showFinalPoster"));
    assert.ok(archiveJs.includes("/episode.html"));
    assert.ok(archiveJs.includes("archiveList"));
    assert.ok(archiveJs.includes("archiveDateHref"));
    assert.ok(appJs.includes("parseMarkdownScenario"));
    assert.ok(appJs.includes("renderScenarioOverview"));
    assert.ok(appJs.includes("## EP.01 천천히, 같이, 멀리"));
    assert.ok(appJs.includes("- 상태: 샘플"));
    assert.ok(episodeJs.includes("renderEpisode"));
    assert.ok(episodeJs.includes("시나리오 관리"));
    assert.ok(travelJs.includes("selectInfoSite"));
    assert.ok(travelJs.includes("infoPreviewFrame.src"));
    assert.ok(printHtml.includes("printBtn"));
    assert.ok(printJs.includes("renderEpisode"));
    assert.ok(menuInfoSvg.includes("정보"));
    assert.ok(!menuInfoSvg.includes("여행정보"));
    assert.ok(!menuInfoSvg.includes("종합정보"));
    assert.ok(menuCastSvg.includes('viewBox="0 0 220 72"'));

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

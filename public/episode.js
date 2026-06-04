const SCRIPT_FIELDS = [
  ["opening", "오프닝 멘트"],
  ["talk1", "토크 1"],
  ["talk2", "토크 2"],
  ["talk3", "토크 3"],
  ["closingQuestion", "마무리 질문"],
  ["ending", "엔딩 멘트"],
];

const root = document.querySelector("#episodeRoot");
const params = new URLSearchParams(window.location.search);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    if (typeof fetch === "function") {
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Request failed: ${response.status}`);
          return response.json();
        })
        .then(resolve)
        .catch(reject);
      return;
    }

    if (typeof XMLHttpRequest !== "function") {
      reject(new Error("No supported request API"));
      return;
    }

    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "json";
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Request failed: ${request.status}`));
        return;
      }
      resolve(request.response || JSON.parse(request.responseText || "{}"));
    };
    request.onerror = () => reject(new Error("Request failed"));
    request.send();
  });
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

  return lines.map((line) => {
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
  }).join("");
}

function renderBlocks(text) {
  if (!text) return "<p>-</p>";
  return text
    .split(/\n{2,}/)
    .map(renderReadableBlock)
    .join("");
}

function metaItem(label, value) {
  return `
    <div class="public-meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function parseDateCandidate(value, source) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const match = raw.match(/(20\d{2})[.\-/년\s]+(\d{1,2})(?:[.\-/월\s]+(\d{1,2}|__|00|xx|XX))?/);
  if (!match) return null;

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const hasDay = /^\d{1,2}$/.test(match[3] || "") && match[3] !== "00";
  const day = hasDay ? match[3].padStart(2, "0") : "";
  const sourceLabel = source === "air" ? "방송일" : "녹음일";

  return {
    raw,
    label: day ? `${year}.${month}.${day}` : `${year}.${month} ${sourceLabel} 미정`,
    sourceLabel,
    year,
    month,
    day,
  };
}

function scenarioDate(episode) {
  return parseDateCandidate(episode.airDate, "air")
    || parseDateCandidate(episode.recordDate, "record")
    || { raw: "", label: "날짜 미정", sourceLabel: "날짜", year: "", month: "", day: "" };
}

function archiveDateHref(date) {
  const query = new URLSearchParams();
  if (date.year) query.set("year", date.year);
  if (date.month) query.set("month", date.month);
  if (date.day) query.set("day", date.day);
  const search = query.toString();
  return search ? `/archive.html?${search}` : "/archive.html";
}

function renderEpisode(episode) {
  document.title = `${episode.episodeNo || "Riding-star"} ${episode.title || ""}`;
  const date = scenarioDate(episode);

  root.innerHTML = `
    <section class="public-cover">
      <div>
        <span class="status-chip">${escapeHtml(episode.status || "공개")}</span>
        <h1>${escapeHtml(`${episode.episodeNo || ""} ${episode.title || ""}`.trim())}</h1>
        <p>${escapeHtml(episode.summary || episode.theme || "등록된 방송 시나리오입니다.")}</p>
      </div>
      <div class="public-actions">
        <a class="button" href="/">홈으로 가기</a>
        <a class="button" href="${escapeHtml(archiveDateHref(date))}">같은 날짜 회차</a>
        <a class="button" href="/archive.html">전체 회차</a>
        <a class="button" href="/scenarios.html?episode=${encodeURIComponent(episode.id)}">시나리오 관리</a>
        <a class="button primary" href="/print.html?episode=${encodeURIComponent(episode.id)}">PDF 보기</a>
      </div>
    </section>

    <section class="public-meta">
      ${metaItem("시나리오 날짜", `${date.label} · ${date.sourceLabel} 기준`)}
      ${metaItem("방송일", episode.airDate)}
      ${metaItem("녹음일", episode.recordDate)}
      ${metaItem("게스트", episode.guest)}
      ${metaItem("진행", episode.hosts)}
      ${metaItem("장소", episode.location)}
      ${metaItem("러닝타임", episode.duration)}
    </section>

    <section class="public-section">
      <h2>전체 방송 시간표</h2>
      <div class="table-wrap">
        <table class="public-table">
          <thead>
            <tr>
              <th>구성</th>
              <th>시간</th>
              <th>길이</th>
              <th>세부사항</th>
              <th>출연</th>
            </tr>
          </thead>
          <tbody>
            ${(episode.rundown || []).map((row) => `
              <tr>
                <td>${escapeHtml(row.segment)}</td>
                <td>${escapeHtml(row.time)}</td>
                <td>${escapeHtml(row.duration)}</td>
                <td>${escapeHtml(row.details).replace(/\n/g, "<br>")}</td>
                <td>${escapeHtml(row.cast)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="public-section">
      <h2>방송 대본</h2>
      <div class="public-script-list">
        ${SCRIPT_FIELDS.map(([key, label]) => `
          <article>
            <h3>${escapeHtml(label)}</h3>
            ${renderBlocks(episode.script?.[key])}
          </article>
        `).join("")}
      </div>
    </section>

    <section class="public-section">
      <h2>게스트 추천 음악</h2>
      <div class="table-wrap">
        <table class="public-table">
          <thead>
            <tr>
              <th>순서</th>
              <th>곡명</th>
              <th>가수</th>
              <th>추천자</th>
              <th>추천 이유</th>
              <th>확인</th>
            </tr>
          </thead>
          <tbody>
            ${(episode.music || []).map((track) => `
              <tr>
                <td>${escapeHtml(track.timing)}</td>
                <td>${escapeHtml(track.title)}</td>
                <td>${escapeHtml(track.artist)}</td>
                <td>${escapeHtml(track.recommendedBy)}</td>
                <td>${escapeHtml(track.reason)}</td>
                <td>${escapeHtml(track.rightsNote)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function loadEpisode() {
  try {
    const state = await requestJson("/api/state");
    const episodeId = params.get("episode");
    const episode = state.episodes.find((item) => item.id === episodeId) || state.episodes[0];

    if (!episode) {
      root.innerHTML = `<p class="empty-preview">등록된 회차가 없습니다.</p>`;
      return;
    }

    renderEpisode(episode);
  } catch (error) {
    root.innerHTML = `<p class="empty-preview">회차 내용을 불러오지 못했습니다.</p>`;
  }
}

loadEpisode();

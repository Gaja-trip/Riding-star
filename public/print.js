const SCRIPT_FIELDS = [
  ["opening", "오프닝 멘트"],
  ["talk1", "토크 1"],
  ["talk2", "토크 2"],
  ["talk3", "토크 3"],
  ["closingQuestion", "마무리 질문"],
  ["ending", "엔딩 멘트"],
];

const root = document.querySelector("#printRoot");
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

function readableBlock(block) {
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

function paragraphs(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map(readableBlock)
    .join("");
}

function renderEpisode(episode) {
  const meta = [
    ["주제", episode.theme],
    ["게스트", episode.guest],
    ["진행", episode.hosts],
    ["방송국", episode.station],
    ["녹음일", episode.recordDate],
    ["방송일", episode.airDate],
    ["장소", episode.location],
    ["러닝타임", episode.duration],
    ["상태", episode.status],
  ];

  root.innerHTML = `
    <section class="cover">
      <p class="eyebrow">Riding-star 방송 시나리오</p>
      <h1>${escapeHtml(`${episode.episodeNo || ""} ${episode.title || ""}`.trim())}</h1>
      <p>${escapeHtml(episode.summary || "자전거 이야기를 천천히, 같이, 멀리 전하는 방송 시나리오입니다.")}</p>
      <div class="meta-grid">
        ${meta.map(([label, value]) => `
          <div class="meta-item">
            <span>${escapeHtml(label)}</span>
            ${escapeHtml(value || "-")}
          </div>
        `).join("")}
      </div>
    </section>

    <section>
      <h2>전체 방송 시간표</h2>
      <table>
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
    </section>

    <section>
      <h2>방송 대본</h2>
      ${SCRIPT_FIELDS.map(([key, label]) => `
        <article class="script-section">
          <h3>${escapeHtml(label)}</h3>
          <div class="script-text">${paragraphs(episode.script?.[key]) || "<p>-</p>"}</div>
        </article>
      `).join("")}
    </section>

    <section>
      <h2>게스트 추천 음악</h2>
      <table>
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
    </section>

    <section>
      <h2>방송 후 정리</h2>
      <div class="notes">${escapeHtml(episode.notes || "-")}</div>
    </section>
  `;
}

async function loadPrintView() {
  const state = await requestJson("/api/state");
  const episodeId = params.get("episode");
  const episode = state.episodes.find((item) => item.id === episodeId) || state.episodes[0];

  if (!episode) {
    root.innerHTML = "<p>출력할 회차가 없습니다.</p>";
    return;
  }

  renderEpisode(episode);
  document.title = `${episode.episodeNo || "Riding-star"} ${episode.title || ""} PDF`;

  if (params.get("print") === "1") {
    setTimeout(() => window.print(), 500);
  }
}

document.querySelector("#printBtn").addEventListener("click", () => window.print());
document.querySelector("#backBtn").addEventListener("click", () => {
  window.location.href = "/scenarios.html";
});

loadPrintView().catch((error) => {
  root.innerHTML = `<p>시나리오를 불러오지 못했습니다. ${escapeHtml(error.message)}</p>`;
});

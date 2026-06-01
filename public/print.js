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

function paragraphs(value) {
  return escapeHtml(value || "")
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
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
  const response = await fetch("/api/state");
  const state = await response.json();
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
  window.location.href = "/";
});

loadPrintView().catch((error) => {
  root.innerHTML = `<p>시나리오를 불러오지 못했습니다. ${escapeHtml(error.message)}</p>`;
});

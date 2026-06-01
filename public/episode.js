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

function renderBlocks(text) {
  if (!text) return "<p>-</p>";
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
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

function renderEpisode(episode) {
  document.title = `${episode.episodeNo || "Riding-star"} ${episode.title || ""}`;

  root.innerHTML = `
    <section class="public-cover">
      <div>
        <span class="status-chip">${escapeHtml(episode.status || "공개")}</span>
        <h1>${escapeHtml(`${episode.episodeNo || ""} ${episode.title || ""}`.trim())}</h1>
        <p>${escapeHtml(episode.summary || episode.theme || "등록된 방송 시나리오입니다.")}</p>
      </div>
      <div class="public-actions">
        <a class="button" href="/">홈으로 가기</a>
        <a class="button" href="/#archive">회차 목록</a>
        <a class="button primary" href="/print.html?episode=${encodeURIComponent(episode.id)}">PDF 보기</a>
      </div>
    </section>

    <section class="public-meta">
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
    const response = await fetch("/api/state");
    const state = await response.json();
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

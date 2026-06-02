const archiveElements = {
  count: document.querySelector("#episodeCount"),
  latestDate: document.querySelector("#latestDate"),
  search: document.querySelector("#archiveSearch"),
  year: document.querySelector("#yearFilter"),
  month: document.querySelector("#monthFilter"),
  day: document.querySelector("#dayFilter"),
  list: document.querySelector("#archiveList"),
};

let archiveEpisodes = [];

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

      if (request.response) {
        resolve(request.response);
        return;
      }

      try {
        resolve(JSON.parse(request.responseText || "{}"));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error("Request failed"));
    request.send();
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseEpisodeDate(episode) {
  const candidates = [episode.airDate, episode.recordDate].filter(Boolean);
  let raw = candidates[0] || "";
  let match = null;

  for (const candidate of candidates) {
    const candidateMatch = String(candidate).match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
    if (candidateMatch) {
      raw = candidate;
      match = candidateMatch;
      break;
    }
  }

  if (!match) {
    return {
      raw,
      label: raw || "날짜 미정",
      year: "",
      month: "",
      day: "",
      sortKey: "0000-00-00",
    };
  }

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return {
    raw,
    label: `${year}.${month}.${day}`,
    year,
    month,
    day,
    sortKey: `${year}-${month}-${day}`,
  };
}

function episodeSearchText(episode) {
  return [
    episode.episodeNo,
    episode.title,
    episode.theme,
    episode.guest,
    episode.hosts,
    episode.keywords,
    episode.summary,
  ].join(" ").toLowerCase();
}

function populateSelect(select, values, suffix = "") {
  const current = select.value;
  select.innerHTML = `<option value="">전체</option>${values.map((value) => (
    `<option value="${escapeHtml(value)}">${escapeHtml(`${Number(value) || value}${suffix}`)}</option>`
  )).join("")}`;
  if (values.includes(current)) select.value = current;
}

function updateFilters() {
  const dates = archiveEpisodes.map((episode) => episode.date);
  const years = [...new Set(dates.map((date) => date.year).filter(Boolean))].sort().reverse();
  const months = [...new Set(dates
    .filter((date) => !archiveElements.year.value || date.year === archiveElements.year.value)
    .map((date) => date.month)
    .filter(Boolean))].sort();
  const days = [...new Set(dates
    .filter((date) => !archiveElements.year.value || date.year === archiveElements.year.value)
    .filter((date) => !archiveElements.month.value || date.month === archiveElements.month.value)
    .map((date) => date.day)
    .filter(Boolean))].sort();

  populateSelect(archiveElements.year, years, "년");
  populateSelect(archiveElements.month, months, "월");
  populateSelect(archiveElements.day, days, "일");
}

function filteredEpisodes() {
  const query = archiveElements.search.value.trim().toLowerCase();
  return archiveEpisodes.filter((episode) => {
    if (query && !episodeSearchText(episode).includes(query)) return false;
    if (archiveElements.year.value && episode.date.year !== archiveElements.year.value) return false;
    if (archiveElements.month.value && episode.date.month !== archiveElements.month.value) return false;
    if (archiveElements.day.value && episode.date.day !== archiveElements.day.value) return false;
    return true;
  });
}

function groupByDate(episodes) {
  return episodes.reduce((groups, episode) => {
    const key = episode.date.label;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(episode);
    return groups;
  }, new Map());
}

function renderArchive() {
  const episodes = filteredEpisodes();

  if (!episodes.length) {
    archiveElements.list.innerHTML = `<p class="empty-preview">조건에 맞는 회차가 없습니다.</p>`;
    return;
  }

  const grouped = groupByDate(episodes);
  archiveElements.list.innerHTML = [...grouped.entries()].map(([dateLabel, items]) => `
    <section class="archive-group">
      <h3>${escapeHtml(dateLabel)}</h3>
      <div class="archive-cards">
        ${items.map((episode) => `
          <a class="archive-card" href="/episode.html?episode=${encodeURIComponent(episode.id)}">
            <span>${escapeHtml(episode.episodeNo || "회차 미정")}</span>
            <strong>${escapeHtml(episode.title || "제목 없음")}</strong>
            <small>${escapeHtml([episode.guest && `게스트 ${episode.guest}`, episode.status].filter(Boolean).join(" · "))}</small>
            <p>${escapeHtml(episode.summary || episode.theme || "등록된 방송 내용을 확인합니다.")}</p>
          </a>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function updateStats() {
  if (!archiveElements.count || !archiveElements.latestDate) return;

  archiveElements.count.textContent = String(archiveEpisodes.length);
  const latest = archiveEpisodes.find((episode) => episode.date.year);
  archiveElements.latestDate.textContent = latest ? latest.date.label : "-";
}

async function loadArchive() {
  try {
    const state = await requestJson("/api/state");
    archiveEpisodes = (state.episodes || [])
      .map((episode) => ({ ...episode, date: parseEpisodeDate(episode) }))
      .sort((a, b) => b.date.sortKey.localeCompare(a.date.sortKey));
    updateFilters();
    updateStats();
    renderArchive();
  } catch (error) {
    archiveElements.list.innerHTML = `<p class="empty-preview">회차를 불러오지 못했습니다.</p>`;
  }
}

function handleArchiveControl(control) {
  if (control === archiveElements.year) {
    archiveElements.month.value = "";
    archiveElements.day.value = "";
    updateFilters();
  }
  if (control === archiveElements.month) {
    archiveElements.day.value = "";
    updateFilters();
  }
  renderArchive();
}

[archiveElements.search, archiveElements.year, archiveElements.month, archiveElements.day].forEach((control) => {
  ["input", "change"].forEach((eventName) => {
    control.addEventListener(eventName, () => handleArchiveControl(control));
  });
});

loadArchive();

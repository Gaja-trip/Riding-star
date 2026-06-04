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

function archiveDateHref(date) {
  const params = new URLSearchParams();
  if (date.year) params.set("year", date.year);
  if (date.month) params.set("month", date.month);
  if (date.day) params.set("day", date.day);
  const query = params.toString();
  return query ? `/archive.html?${query}` : "/archive.html";
}

function episodeHref(episode) {
  const params = new URLSearchParams({ episode: episode.id });
  if (episode.date.year) params.set("year", episode.date.year);
  if (episode.date.month) params.set("month", episode.date.month);
  if (episode.date.day) params.set("day", episode.date.day);
  return `/episode.html?${params.toString()}`;
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
    sortKey: `${year}-${month}-${day || "00"}`,
  };
}

function parseEpisodeDate(episode) {
  return parseDateCandidate(episode.airDate, "air")
    || parseDateCandidate(episode.recordDate, "record")
    || {
      raw: episode.airDate || episode.recordDate || "",
      label: episode.airDate || episode.recordDate || "날짜 미정",
      sourceLabel: "날짜",
      year: "",
      month: "",
      day: "",
      sortKey: "0000-00-00",
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
    const key = `${episode.date.sortKey}|${episode.date.label}`;
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
  archiveElements.list.innerHTML = [...grouped.entries()].map(([, items]) => {
    const groupDate = items[0].date;
    return `
    <section class="archive-group">
      <h3>
        <a href="${escapeHtml(archiveDateHref(groupDate))}">${escapeHtml(groupDate.label)}</a>
        <span>${escapeHtml(groupDate.sourceLabel)} 기준</span>
      </h3>
      <div class="archive-cards">
        ${items.map((episode) => `
          <a class="archive-card" href="${escapeHtml(episodeHref(episode))}">
            <span>${escapeHtml(episode.episodeNo || "회차 미정")}</span>
            <strong>${escapeHtml(episode.title || "제목 없음")}</strong>
            <small>${escapeHtml([groupDate.sourceLabel, groupDate.raw, episode.guest && `게스트 ${episode.guest}`, episode.status].filter(Boolean).join(" · "))}</small>
            <p>${escapeHtml(episode.summary || episode.theme || "등록된 방송 내용을 확인합니다.")}</p>
          </a>
        `).join("")}
      </div>
    </section>
  `;
  }).join("");
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
    applyQueryFilters();
    updateStats();
    renderArchive();
  } catch (error) {
    archiveElements.list.innerHTML = `<p class="empty-preview">회차를 불러오지 못했습니다.</p>`;
  }
}

function applyQueryFilters() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get("year") || "";
  const month = params.get("month") || "";
  const day = params.get("day") || "";

  if (year && [...archiveElements.year.options].some((option) => option.value === year)) {
    archiveElements.year.value = year;
    updateFilters();
  }
  if (month && [...archiveElements.month.options].some((option) => option.value === month)) {
    archiveElements.month.value = month;
    updateFilters();
  }
  if (day && [...archiveElements.day.options].some((option) => option.value === day)) {
    archiveElements.day.value = day;
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
  syncQueryFromFilters();
  renderArchive();
}

function syncQueryFromFilters() {
  const params = new URLSearchParams(window.location.search);
  ["year", "month", "day"].forEach((key) => params.delete(key));
  if (archiveElements.year.value) params.set("year", archiveElements.year.value);
  if (archiveElements.month.value) params.set("month", archiveElements.month.value);
  if (archiveElements.day.value) params.set("day", archiveElements.day.value);

  const query = params.toString();
  history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

[archiveElements.search, archiveElements.year, archiveElements.month, archiveElements.day].forEach((control) => {
  ["input", "change"].forEach((eventName) => {
    control.addEventListener(eventName, () => handleArchiveControl(control));
  });
});

loadArchive();

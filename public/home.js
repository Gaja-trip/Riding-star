const homeCount = document.querySelector("#episodeCount");
const homeLatestDate = document.querySelector("#latestDate");

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
    label: day ? `${year}.${month}.${day}` : `${year}.${month} ${sourceLabel} 미정`,
    sortKey: `${year}-${month}-${day || "00"}`,
  };
}

function parseEpisodeDate(episode) {
  return parseDateCandidate(episode.airDate, "air")
    || parseDateCandidate(episode.recordDate, "record")
    || { label: "-", sortKey: "0000-00-00" };
}

async function loadHomeStats() {
  if (!homeCount && !homeLatestDate) return;

  try {
    const state = await requestJson("/api/state");
    const episodes = state.episodes || [];
    const latest = episodes
      .map((episode) => parseEpisodeDate(episode))
      .filter((date) => date.label !== "-")
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .at(-1);

    if (homeCount) homeCount.textContent = String(episodes.length);
    if (homeLatestDate) homeLatestDate.textContent = latest?.label || "-";
  } catch (error) {
    if (homeCount) homeCount.textContent = "-";
    if (homeLatestDate) homeLatestDate.textContent = "-";
  }
}

loadHomeStats();

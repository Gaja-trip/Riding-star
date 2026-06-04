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

function parseEpisodeDate(episode) {
  const candidates = [episode.airDate, episode.recordDate].filter(Boolean);

  for (const candidate of candidates) {
    const match = String(candidate).match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
    if (!match) continue;
    return `${match[1]}.${match[2].padStart(2, "0")}.${match[3].padStart(2, "0")}`;
  }

  return "-";
}

async function loadHomeStats() {
  if (!homeCount && !homeLatestDate) return;

  try {
    const state = await requestJson("/api/state");
    const episodes = state.episodes || [];
    const latest = episodes
      .map((episode) => parseEpisodeDate(episode))
      .filter((date) => date !== "-")
      .sort()
      .at(-1);

    if (homeCount) homeCount.textContent = String(episodes.length);
    if (homeLatestDate) homeLatestDate.textContent = latest || "-";
  } catch (error) {
    if (homeCount) homeCount.textContent = "-";
    if (homeLatestDate) homeLatestDate.textContent = "-";
  }
}

loadHomeStats();

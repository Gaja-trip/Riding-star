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

const posterSequence = document.querySelector(".poster-sequence");
const sequenceVideos = [...document.querySelectorAll(".poster-sequence-video")];
const posterReplayButton = document.querySelector(".poster-replay-button");
const sequenceCurrent = document.querySelector(".poster-sequence-current");
const sequenceTotal = document.querySelector(".poster-sequence-total");
const sequenceProgress = document.querySelector(".poster-sequence-line span");

let activeSequenceIndex = 0;
let sequenceFinished = false;

function syncSequenceTotal() {
  if (sequenceTotal) {
    sequenceTotal.textContent = String(Math.max(sequenceVideos.length, 1)).padStart(2, "0");
  }
}

function resetSequenceVideo(video) {
  try {
    video.currentTime = 0;
  } catch (error) {
    // Some browsers reject early seeks before metadata is available.
  }
}

function updateSequenceProgress(video) {
  if (!sequenceProgress || !sequenceCurrent) return;

  const total = Math.max(sequenceVideos.length, 1);
  const duration = Number(video?.duration || 0);
  const currentTime = Number(video?.currentTime || 0);
  const ratio = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const progress = ((activeSequenceIndex + ratio) / total) * 100;

  sequenceCurrent.textContent = String(Math.min(activeSequenceIndex + 1, total)).padStart(2, "0");
  sequenceProgress.style.width = `${Math.max(progress, 100 / total / 4)}%`;
}

function activateSequenceVideo(index) {
  const video = sequenceVideos[index];
  if (!video || sequenceFinished) return;

  activeSequenceIndex = index;
  posterSequence?.classList.remove("is-final");

  sequenceVideos.forEach((item, itemIndex) => {
    const isActive = itemIndex === index;
    item.classList.toggle("is-active", isActive);
    item.pause();
    if (!isActive) resetSequenceVideo(item);
  });

  video.muted = true;
  video.playsInline = true;
  resetSequenceVideo(video);
  updateSequenceProgress(video);

  const playAttempt = video.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {
      if (!sequenceFinished) playNextSequenceVideo(index);
    });
  }
}

function playNextSequenceVideo(index) {
  if (sequenceVideos.length === 0) {
    sequenceFinished = true;
    return;
  }

  const nextIndex = (index + 1) % sequenceVideos.length;
  activateSequenceVideo(nextIndex);
}

function replayPosterSequence() {
  sequenceFinished = false;
  activateSequenceVideo(0);
}

sequenceVideos.forEach((video, index) => {
  video.addEventListener("timeupdate", () => updateSequenceProgress(video));
  video.addEventListener("ended", () => {
    playNextSequenceVideo(index);
  });
  video.addEventListener("error", () => {
    playNextSequenceVideo(index);
  });
});

posterReplayButton?.addEventListener("click", replayPosterSequence);

if (sequenceVideos.length > 0) {
  syncSequenceTotal();
  activateSequenceVideo(0);
} else {
  syncSequenceTotal();
  sequenceFinished = true;
}

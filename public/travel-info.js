const infoButtons = [...document.querySelectorAll(".info-site-button")];
const infoItems = [...document.querySelectorAll(".info-site-item")];
const infoPreviewTitle = document.querySelector("#infoPreviewTitle");
const infoPreviewOpen = document.querySelector("#infoPreviewOpen");
const infoPreviewFrame = document.querySelector("#infoPreviewFrame");

function selectInfoSite(button) {
  const title = button.dataset.title || "";
  const url = button.dataset.url || "";

  infoItems.forEach((item) => item.classList.toggle("active", item.contains(button)));
  infoButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));

  infoPreviewTitle.textContent = title;
  infoPreviewOpen.href = url;
  infoPreviewFrame.src = url;
  infoPreviewFrame.title = `${title} 메인 화면`;
}

infoButtons.forEach((button) => {
  button.addEventListener("click", () => selectInfoSite(button));
});

const form = document.querySelector("#generator-form");
const fromInput = document.querySelector("#from");
const toInput = document.querySelector("#to");
const modeInput = document.querySelector("#mode");
const status = document.querySelector("#status");
const slides = document.querySelector("#slides");

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultRange() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 2);
  fromInput.value = isoDate(today);
  toInput.value = isoDate(end);
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function slideCard(slide, query) {
  const params = new URLSearchParams({
    ...query,
    index: String(slide.index)
  });

  const article = document.createElement("article");
  article.className = "slide-card";
  article.innerHTML = `
    <div class="slide-card__header">
      <div>
        <h2>${escapeHtml(slide.title)}</h2>
        <p>${slide.meta.map(escapeHtml).join(" · ")}</p>
      </div>
      <a class="download" href="/api/download-png?${params}">PNG herunterladen</a>
    </div>
    <div class="preview-wrap">
      <iframe title="${escapeHtml(slide.title)}" src="/slide?${params}"></iframe>
    </div>
  `;
  return article;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = {
    from: fromInput.value,
    to: toInput.value,
    mode: modeInput.value
  };

  slides.innerHTML = "";
  setStatus("Slides werden erzeugt …", "loading");

  try {
    const params = new URLSearchParams(query);
    const response = await fetch(`/api/slides?${params}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    if (!data.slides?.length) {
      setStatus("Für den Zeitraum wurden keine passenden Slides gefunden.", "empty");
      return;
    }

    data.slides.forEach((slide) => {
      slides.appendChild(slideCard(slide, query));
    });

    setStatus(`${data.slides.length} Slide(s) erzeugt.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Fehler beim Erzeugen der Slides.", "error");
  }
});

setDefaultRange();

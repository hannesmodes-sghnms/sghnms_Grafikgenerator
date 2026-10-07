const formatInput = document.querySelector("#format");
const slides = document.querySelector("#slides");

const STORY_WIDTH = 1122;
const POST_HEIGHT = 1402;
const STORY_HEIGHT = 1994;
const STORY_Y_SCALE = STORY_HEIGHT / POST_HEIGHT;

const OVERVIEW_GROUPS = [
  ".meta-bar",
  ".matches"
];

const SINGLE_GROUPS = [
  ".single-headline",
  ".single-meta",
  ".single-logos",
  ".single-card"
];

function currentFormat() {
  return formatInput?.value === "story" ? "story" : "post";
}

function waitForImages(doc) {
  return Promise.all([...doc.images].map((image) => {
    if (image.complete) return Promise.resolve();

    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
}

function toPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG konnte nicht erzeugt werden."));
    }, "image/png");
  });
}

function distributeGroupsVertically(root, win) {
  const selectors = root.id === "single-slide-root"
    ? SINGLE_GROUPS
    : OVERVIEW_GROUPS;

  selectors.forEach((selector) => {
    const element = root.querySelector(selector);
    if (!element) return;

    const computed = win.getComputedStyle(element);
    const baseTop = Number.parseFloat(computed.top);

    if (!Number.isFinite(baseTop)) return;

    element.style.top = `${Math.round(baseTop * STORY_Y_SCALE)}px`;
  });
}

function enlargeStoryHeadline(root) {
  if (root.id !== "single-slide-root") return;

  const headline = root.querySelector(".single-headline");
  if (!headline) return;

  headline.style.transform = "scale(1.16)";
  headline.style.transformOrigin = "center center";
}

function applyStoryLayout(iframe) {
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) return;

  const root = doc.querySelector("#slide-root, #single-slide-root");
  if (!root || root.dataset.storyFormatApplied === "true") return;

  const card = iframe.closest(".slide-card");
  card?.classList.add("slide-card--story");

  root.dataset.storyFormatApplied = "true";
  root.classList.add("format-story");
  root.style.height = `${STORY_HEIGHT}px`;

  /*
   * Story ist kein verschobener 4:5-Block mehr. Die Hauptgruppen behalten
   * ihre Groesse, ihre vertikale Position wird aber proportional von der
   * 1402px-Beitragshoehe auf die 1994px-Storyhoehe umgerechnet. Dadurch
   * wachsen die Abstaende zwischen Headline, Meta, Logos/Cards und dem Rand
   * mit der Gesamthoehe, ohne das eigentliche Layout horizontal zu veraendern.
   */
  distributeGroupsVertically(root, win);
  enlargeStoryHeadline(root);

  const fitStory = () => {
    const scale = Math.min(1, win.innerWidth / STORY_WIDTH);
    root.style.transform = `scale(${scale})`;
    doc.body.style.width = `${STORY_WIDTH * scale}px`;
    doc.body.style.height = `${STORY_HEIGHT * scale}px`;
  };

  win.sghnmsRenderSlidePng = async () => {
    if (!win.html2canvas) {
      throw new Error("PNG-Renderer konnte nicht geladen werden.");
    }

    await doc.fonts.ready;
    await waitForImages(doc);
    await new Promise((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));

    const oldTransform = root.style.transform;
    const oldBodyWidth = doc.body.style.width;
    const oldBodyHeight = doc.body.style.height;

    root.style.transform = "none";
    doc.body.style.width = `${STORY_WIDTH}px`;
    doc.body.style.height = `${STORY_HEIGHT}px`;

    try {
      const canvas = await win.html2canvas(root, {
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        scale: 1,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        windowWidth: STORY_WIDTH,
        windowHeight: STORY_HEIGHT
      });

      return await toPngBlob(canvas);
    } finally {
      root.style.transform = oldTransform;
      doc.body.style.width = oldBodyWidth;
      doc.body.style.height = oldBodyHeight;
      fitStory();
    }
  };

  win.addEventListener("resize", () => {
    win.requestAnimationFrame(fitStory);
  });

  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(fitStory);
  });

  // Die bestehenden Renderer initialisieren ihren 1122x1402-Viewport asynchron.
  // Ein kurzer Nachlauf stellt sicher, dass der Story-Viewport anschliessend gewinnt.
  win.setTimeout(fitStory, 80);
}

function registerIframe(iframe) {
  if (iframe.dataset.storyFormatRegistered === "true") return;
  iframe.dataset.storyFormatRegistered = "true";

  const format = currentFormat();
  iframe.dataset.outputFormat = format;

  if (format === "story") {
    iframe.closest(".slide-card")?.classList.add("slide-card--story");
  }

  iframe.addEventListener("load", () => {
    if (iframe.dataset.outputFormat === "story") {
      applyStoryLayout(iframe);
    }
  });

  if (iframe.contentDocument?.readyState === "complete" && format === "story") {
    applyStoryLayout(iframe);
  }
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;

      if (node.matches("iframe")) {
        registerIframe(node);
      }

      node.querySelectorAll?.("iframe").forEach(registerIframe);
    }
  }
});

if (slides) {
  observer.observe(slides, { childList: true, subtree: true });
  slides.querySelectorAll("iframe").forEach(registerIframe);
}

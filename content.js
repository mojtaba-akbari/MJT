// Mojjjak: content script — subtitle bubbles + accessibility
// Authors: mojtaba.akbari@gwdg.de, matthias.eulert@gwdg.de

if (!window.__mjtLoaded) {
  window.__mjtLoaded = true;

  let container = null;
  const MAX_LINES = 6;
  const lines = [];
  let lineCount = 0;
  const BG_DARK = "rgba(0, 0, 0, 0.60)";
  const BG_LIGHT = "rgba(45, 20, 60, 0.55)";
  const HC_DARK = "rgba(0, 0, 0, 0.92)";
  const HC_LIGHT = "rgba(40, 10, 55, 0.90)";

  let settings = { highContrast: false, fontSize: 24, subtitlePos: "bottom" };

  chrome.storage.local.get(["highContrast", "fontSize", "subtitlePos"], (k) => {
    if (k.highContrast !== undefined) settings.highContrast = k.highContrast;
    if (k.fontSize !== undefined) settings.fontSize = k.fontSize;
    if (k.subtitlePos !== undefined) settings.subtitlePos = k.subtitlePos;
  });

  // Mojjjak: live settings update without restart
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.highContrast) settings.highContrast = changes.highContrast.newValue;
    if (changes.fontSize) settings.fontSize = changes.fontSize.newValue;
    if (changes.subtitlePos) {
      settings.subtitlePos = changes.subtitlePos.newValue;
      if (container) applyPosition(container);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "showSubtitle") showSubtitle(msg.text);
  });

  // Mojjjak: position the container based on setting
  function applyPosition(el) {
    el.style.top = "";
    el.style.bottom = "";
    if (settings.subtitlePos === "top") {
      el.style.top = "40px";
      el.style.bottom = "";
    } else if (settings.subtitlePos === "center") {
      el.style.top = "50%";
      el.style.bottom = "";
      el.style.transform = "translate(-50%, -50%)";
    } else {
      el.style.bottom = "60px";
      el.style.top = "";
      el.style.transform = "translateX(-50%)";
    }
  }

  function ensureContainer() {
    if (container && document.body.contains(container)) return;
    container = document.createElement("div");
    container.id = "mjt-subtitle-container";
    applyPosition(container);
    document.body.appendChild(container);
  }

  function showSubtitle(text) {
    ensureContainer();
    applyPosition(container);

    const hc = settings.highContrast;
    const fontSize = settings.fontSize || 24;
    const line = document.createElement("div");
    line.className = "mjt-subtitle-line mjt-subtitle-enter";

    const isEven = lineCount % 2 === 0;
    if (hc) {
      line.style.background = isEven ? HC_DARK : HC_LIGHT;
      line.style.borderLeft = "4px solid #ffeb3b";
      line.style.fontSize = Math.max(fontSize, 28) + "px";
      line.style.fontWeight = "700";
    } else {
      line.style.background = isEven ? BG_DARK : BG_LIGHT;
      line.style.borderLeft = "3px solid #4fc3f7";
      line.style.fontSize = fontSize + "px";
    }
    lineCount++;

    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    line.appendChild(textSpan);
    container.appendChild(line);
    lines.push(line);

    requestAnimationFrame(() => line.classList.remove("mjt-subtitle-enter"));

    while (lines.length > MAX_LINES) {
      const old = lines.shift();
      old.classList.add("mjt-subtitle-exit");
      setTimeout(() => old.remove(), 400);
    }

    setTimeout(() => {
      if (lines.includes(line)) {
        line.classList.add("mjt-subtitle-exit");
        setTimeout(() => {
          line.remove();
          const idx = lines.indexOf(line);
          if (idx !== -1) lines.splice(idx, 1);
        }, 400);
      }
    }, 12000);
  }
}

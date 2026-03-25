// Mojjjak: popup script — settings, log, start/stop control
// Authors: mojtaba.akbari@gwdg.de, matthias.eulert@gwdg.de

const btn = document.getElementById("btn");
const status = document.getElementById("status");
const gearBtn = document.getElementById("gearBtn");
const logBtn = document.getElementById("logBtn");
const aboutBtn = document.getElementById("aboutBtn");
const settingsPanel = document.getElementById("settingsPanel");
const logPanel = document.getElementById("logPanel");
const aboutPanel = document.getElementById("aboutPanel");
const logList = document.getElementById("logList");
const fontSizeSlider = document.getElementById("fontSize");
const fontSizeVal = document.getElementById("fontSizeVal");
let active = false;

// Mojjjak: toggle panels
gearBtn.addEventListener("click", () => {
  logPanel.classList.remove("open");
  aboutPanel.classList.remove("open");
  settingsPanel.classList.toggle("open");
  gearBtn.textContent = settingsPanel.classList.contains("open") ? "\u2715" : "\u2699";
});

logBtn.addEventListener("click", () => {
  settingsPanel.classList.remove("open");
  aboutPanel.classList.remove("open");
  gearBtn.textContent = "\u2699";
  logPanel.classList.toggle("open");
  if (logPanel.classList.contains("open")) loadLog();
});

aboutBtn.addEventListener("click", () => {
  settingsPanel.classList.remove("open");
  logPanel.classList.remove("open");
  gearBtn.textContent = "\u2699";
  aboutPanel.classList.toggle("open");
});

fontSizeSlider.addEventListener("input", () => {
  fontSizeVal.textContent = fontSizeSlider.value + "px";
});

// Mojjjak: restore settings
chrome.storage.local.get([
  "groqKey", "sourceLang", "targetLang", "capturing",
  "highContrast", "fontSize", "subtitlePos", "apiProvider",
  "customSttUrl", "customLlmUrl", "customSttModel", "customLlmModel"
], (k) => {
  if (k.groqKey) document.getElementById("groqKey").value = k.groqKey;
  if (k.sourceLang) document.getElementById("sourceLang").value = k.sourceLang;
  if (k.targetLang) document.getElementById("targetLang").value = k.targetLang;
  if (k.highContrast) document.getElementById("highContrast").checked = true;
  if (k.subtitlePos) document.getElementById("subtitlePos").value = k.subtitlePos;
  if (k.apiProvider) document.getElementById("apiProvider").value = k.apiProvider;
  if (k.customSttUrl) document.getElementById("customSttUrl").value = k.customSttUrl;
  if (k.customLlmUrl) document.getElementById("customLlmUrl").value = k.customLlmUrl;
  if (k.customSttModel) document.getElementById("customSttModel").value = k.customSttModel;
  if (k.customLlmModel) document.getElementById("customLlmModel").value = k.customLlmModel;
  if (k.fontSize) {
    fontSizeSlider.value = k.fontSize;
    fontSizeVal.textContent = k.fontSize + "px";
  }
  if (k.capturing) {
    active = true;
    btn.textContent = "Stop Subtitles";
    btn.className = "stop";
    status.textContent = "Listening...";
  }
  updateProviderUI();
});

btn.addEventListener("click", async () => {
  const srcSelect = document.getElementById("sourceLang");
  const srcShort = srcSelect.options[srcSelect.selectedIndex].dataset.short;
  const groqKey = document.getElementById("groqKey").value.trim();

  if (!groqKey) {
    status.textContent = "Open settings and enter your Groq API key";
    settingsPanel.classList.add("open");
    gearBtn.textContent = "\u2715";
    return;
  }

  chrome.storage.local.set({
    groqKey,
    apiProvider: document.getElementById("apiProvider").value,
    customSttUrl: document.getElementById("customSttUrl").value.trim(),
    customLlmUrl: document.getElementById("customLlmUrl").value.trim(),
    customSttModel: document.getElementById("customSttModel").value.trim(),
    customLlmModel: document.getElementById("customLlmModel").value.trim(),
    sourceLang: srcSelect.value,
    sourceLangShort: srcShort,
    targetLang: document.getElementById("targetLang").value,
    highContrast: document.getElementById("highContrast").checked,
    fontSize: parseInt(fontSizeSlider.value),
    subtitlePos: document.getElementById("subtitlePos").value
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!active) {
    chrome.runtime.sendMessage({ action: "startCapture", tabId: tab.id }, (res) => {
      if (res?.ok) {
        active = true;
        btn.textContent = "Stop Subtitles";
        btn.className = "stop";
        status.textContent = "Listening...";
      } else {
        status.textContent = "Error: " + (res?.error || "unknown");
      }
    });
  } else {
    chrome.runtime.sendMessage({ action: "stopCapture", tabId: tab.id });
    active = false;
    btn.textContent = "Start Subtitles";
    btn.className = "start";
    status.textContent = "Stopped.";
  }
});

// Mojjjak: save settings live
document.getElementById("highContrast").addEventListener("change", (e) => {
  chrome.storage.local.set({ highContrast: e.target.checked });
});
fontSizeSlider.addEventListener("change", () => {
  chrome.storage.local.set({ fontSize: parseInt(fontSizeSlider.value) });
});
document.getElementById("subtitlePos").addEventListener("change", (e) => {
  chrome.storage.local.set({ subtitlePos: e.target.value });
});

// Mojjjak: API provider switching
function updateProviderUI() {
  const provider = document.getElementById("apiProvider").value;
  const customFields = document.getElementById("customFields");
  const apiHint = document.getElementById("apiHint");
  const keyInput = document.getElementById("groqKey");

  customFields.style.display = provider === "custom" ? "block" : "none";

  if (provider === "groq") {
    keyInput.placeholder = "gsk_...";
    apiHint.innerHTML = '<a href="https://console.groq.com/keys" target="_blank" class="key-btn">Get free API key</a>';
  } else if (provider === "openai") {
    keyInput.placeholder = "sk-...";
    apiHint.innerHTML = '<a href="https://platform.openai.com/api-keys" target="_blank" class="key-btn">Get OpenAI key</a>';
  } else {
    keyInput.placeholder = "your-api-key";
    apiHint.innerHTML = '';
  }
}

document.getElementById("apiProvider").addEventListener("change", () => {
  updateProviderUI();
  chrome.storage.local.set({ apiProvider: document.getElementById("apiProvider").value });
});

// Mojjjak: log functions
function loadLog() {
  chrome.storage.local.get(["subtitleLog"], (k) => {
    const log = k.subtitleLog || [];
    if (log.length === 0) {
      logList.innerHTML = '<div class="log-empty">No subtitles yet</div>';
      return;
    }
    logList.innerHTML = log.map(entry =>
      `<div class="log-entry"><span class="log-time">${entry.time}</span>${entry.text}</div>`
    ).join("");
    logList.scrollTop = logList.scrollHeight;
  });
}

document.getElementById("exportBtn").addEventListener("click", () => {
  chrome.storage.local.get(["subtitleLog"], (k) => {
    const log = k.subtitleLog || [];
    if (log.length === 0) return;
    const text = log.map(e => `[${e.time}] ${e.text}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mjt-subtitles-" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  });
});

document.getElementById("clearBtn").addEventListener("click", () => {
  chrome.storage.local.set({ subtitleLog: [] });
  logList.innerHTML = '<div class="log-empty">No subtitles yet</div>';
});

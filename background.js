// Mojjjak: background service worker — tab capture, offscreen lifecycle, message routing, subtitle log
// Authors: mojtaba.akbari@gwdg.de, matthias.eulert@gwdg.de

let capturing = false;
let captureTabId = null;
const channel = new BroadcastChannel("tab-subtitles");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "startCapture") {
    startCapture(msg.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.action === "stopCapture") {
    channel.postMessage({ action: "offscreen-stop" });
    capturing = false;
    captureTabId = null;
    chrome.storage.local.set({ capturing: false, captureTabId: null });
    sendResponse({ ok: true });
  }

  if (msg.action === "subtitle") {
    chrome.tabs.sendMessage(msg.tabId, { action: "showSubtitle", text: msg.text }).catch(() => {
      injectAndSend(msg.tabId, msg.text);
    });

    // Mojjjak: save subtitle to log with timestamp
    const now = new Date();
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    chrome.storage.local.get(["subtitleLog"], (k) => {
      const log = k.subtitleLog || [];
      log.push({ time, text: msg.text });
      // Mojjjak: keep max 500 entries to avoid storage bloat
      if (log.length > 500) log.splice(0, log.length - 500);
      chrome.storage.local.set({ subtitleLog: log });
    });
  }

  if (msg.action === "getState") {
    sendResponse({ capturing, captureTabId });
  }
});

async function injectAndSend(tabId, text) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await new Promise(r => setTimeout(r, 100));
    await chrome.tabs.sendMessage(tabId, { action: "showSubtitle", text });
  } catch (_) {}
}

async function startCapture(tabId) {
  if (capturing) return;

  await injectAndSend(tabId, "Subtitles starting...");

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Recording tab audio for speech-to-text"
    });
    await new Promise(r => setTimeout(r, 300));
  }

  const config = await chrome.storage.local.get([
    "groqKey", "sourceLangShort", "targetLang",
    "apiProvider", "customSttUrl", "customLlmUrl", "customSttModel", "customLlmModel"
  ]);
  channel.postMessage({ action: "offscreen-start", streamId, tabId, config });
  capturing = true;
  captureTabId = tabId;
  chrome.storage.local.set({ capturing: true, captureTabId: tabId });
}

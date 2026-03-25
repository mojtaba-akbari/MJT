// Mojjjak: offscreen document — audio pipeline engine
// Tab audio -> chunks -> silence check -> Whisper STT -> Llama translation -> subtitle
// Authors: mojtaba.akbari@gwdg.de, matthias.eulert@gwdg.de

let stream = null;
let recorder = null;
let currentTabId = null;
let config = {};
let chunks = [];
let recordingInterval = null;
let processing = false;

// Mojjjak: provider endpoint configs
const PROVIDERS = {
  groq: {
    sttUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
    llmUrl: "https://api.groq.com/openai/v1/chat/completions",
    sttModel: "whisper-large-v3-turbo",
    llmModel: "llama-3.3-70b-versatile"
  },
  openai: {
    sttUrl: "https://api.openai.com/v1/audio/transcriptions",
    llmUrl: "https://api.openai.com/v1/chat/completions",
    sttModel: "whisper-1",
    llmModel: "gpt-4o-mini"
  }
};

function getEndpoints() {
  const provider = config.apiProvider || "groq";
  if (provider === "custom") {
    return {
      sttUrl: config.customSttUrl || PROVIDERS.groq.sttUrl,
      llmUrl: config.customLlmUrl || PROVIDERS.groq.llmUrl,
      sttModel: config.customSttModel || PROVIDERS.groq.sttModel,
      llmModel: config.customLlmModel || PROVIDERS.groq.llmModel
    };
  }
  return PROVIDERS[provider] || PROVIDERS.groq;
}

const SILENCE_THRESHOLD = 0.01;
const transcriptionHistory = [];
const channel = new BroadcastChannel("tab-subtitles");

channel.onmessage = async (event) => {
  const msg = event.data;
  if (msg.action === "offscreen-start") {
    config = msg.config || {};
    await startRecording(msg.streamId, msg.tabId);
  }
  if (msg.action === "offscreen-stop") {
    stopRecording();
  }
};

async function startRecording(streamId, tabId) {
  currentTabId = tabId;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }
    });
  } catch (e) {
    console.error("[OFF] getUserMedia FAILED:", e);
    return;
  }

  // Mojjjak: audio passthrough so user still hears the tab
  try {
    const ctx = new AudioContext();
    ctx.createMediaStreamSource(stream).connect(ctx.destination);
  } catch (_) {}

  startNewRecorder();
  recordingInterval = setInterval(() => {
    if (recorder && recorder.state === "recording") recorder.stop();
  }, 4500);
}

function startNewRecorder() {
  chunks = [];
  try {
    recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  } catch (e) {
    console.error("[OFF] MediaRecorder failed:", e);
    return;
  }

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = async () => {
    if (chunks.length > 0 && !processing) {
      const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
      if (blob.size > 500) {
        const isSilent = await checkSilence(blob);
        if (!isSilent) await processChunk(blob);
      }
    }
    if (stream && stream.active) startNewRecorder();
  };

  recorder.start();
}

function stopRecording() {
  clearInterval(recordingInterval);
  if (recorder && recorder.state !== "inactive") recorder.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  recorder = null;
  stream = null;
  recordingInterval = null;
}

async function checkSilence(blob) {
  try {
    const buf = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audio = await ctx.decodeAudioData(buf);
    const samples = audio.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    return rms < SILENCE_THRESHOLD;
  } catch (_) {
    return false;
  }
}

// Mojjjak: main pipeline — transcribe then translate
async function processChunk(blob) {
  if (!config.groqKey) return;
  processing = true;

  const srcLang = config.sourceLangShort || "de";
  const tgtLang = config.targetLang || "en";

  try {
    const text = await transcribe(blob, config.groqKey, srcLang);
    if (!text || !text.trim()) { processing = false; return; }

    transcriptionHistory.push(text);
    if (transcriptionHistory.length > 3) transcriptionHistory.shift();

    let translated;
    if (srcLang === tgtLang) {
      translated = text;
    } else {
      translated = await translate(text, srcLang, tgtLang, transcriptionHistory);
    }

    chrome.runtime.sendMessage({ action: "subtitle", tabId: currentTabId, text: translated });
  } catch (e) {
    console.error("[OFF] Pipeline error:", e);
  }

  processing = false;
}

async function transcribe(blob, apiKey, lang) {
  const ep = getEndpoints();
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  form.append("model", ep.sttModel);
  form.append("language", lang);
  form.append("response_format", "json");

  const res = await fetch(ep.sttUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: form
  });

  if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text()}`);
  return (await res.json()).text;
}

// Mojjjak: LLM translation with context from previous chunks
async function translate(text, srcLang, tgtLang, history) {
  const ep = getEndpoints();
  const langNames = {
    de: "German", en: "English", fr: "French", es: "Spanish",
    ja: "Japanese", zh: "Chinese", ru: "Russian", pt: "Portuguese", it: "Italian"
  };
  const srcName = langNames[srcLang] || srcLang;
  const targetName = langNames[tgtLang] || tgtLang;

  let contextBlock = "";
  if (history.length > 1) {
    contextBlock = `Previous context (for reference only, do NOT translate this): "${history.slice(0, -1).join(" ")}"\n\n`;
  }

  const res = await fetch(ep.llmUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.groqKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ep.llmModel,
      temperature: 0.1,
      max_tokens: 256,
      messages: [
        {
          role: "system",
          content: `You are a professional ${srcName} to ${targetName} translator for live subtitles. Translate naturally and accurately. If the sentence seems incomplete, still translate what is there. Output ONLY the translation. No explanation, no quotes, no notes.`
        },
        {
          role: "user",
          content: `${contextBlock}Translate this to ${targetName}:\n${text}`
        }
      ]
    })
  });

  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content.trim();
}

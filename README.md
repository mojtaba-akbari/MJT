# MJT - Mojjjak Translator

Real-time translation with live subtitles.

## Motivation

### Not everyone experiences the web in the same language 
Or in the same way. MJT was built with three groups of people in mind: those who are deaf or hard of hearing and rely on subtitles to follow spoken content, those who are blind or visually impaired and benefit from screen-readable text transcriptions of audio, and those who speak a different language and simply need the words translated to understand what's being said. Whether it's a lecture, a meeting, or a video in a foreign language, MJT aims to make online audio accessible to everyone — instantly and at no cost.

## Features

- Real-time Translation , Source platform-independent
- 9 languages supported (German, English, French, Spanish, Japanese, Chinese, Russian, Portuguese, Italian)
- Silence detection
- Noise Canceler
- Context-aware translation
- Subtitle log with timestamps and .txt export
- Adjustable subtitle position (top/center/bottom)
- Adjustable font size
- High contrast mode for accessibility
- Alternating bubble colors (black/dark purple)
- Works while popup is closed

## Setup 
### Chrome extension
1. Load the extension in Chrome:
   - Go to `chrome://extensions`
   - Enable Developer Mode
   - Click "Load unpacked"
   - Select the project folder
2. Click the extension icon, open Settings (gear icon), paste your Groq key
3. Pick source and target languages
4. Hit Start Subtitles

## Tech Stack

- Chrome Extension Manifest V3
- Offscreen Document API (for MediaRecorder)
- Web Audio API (silence detection + audio passthrough)
- BroadcastChannel API (background ↔ offscreen communication)

## Future
1. Firefox Extension
2. Android Extension
3. Mac
## Authors

- **Mojtaba Akbari** — mojtaba.akbari@gwdg.de
- **Matthias Eulert** — matthias.eulert@gwdg.de

@ GWDG — Gesellschaft für wissenschaftliche Datenverarbeitung mbH Göttingen

## License

GPL-3.0 — See [LICENSE](LICENSE) for details.

Commercial use requires explicit permission from the authors.

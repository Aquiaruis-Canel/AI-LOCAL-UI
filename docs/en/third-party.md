# Third-party software

**English** · [Español](../terceros.md)

## Included in the repository (`assets/vendor/`, `assets/js/icons.js`)

| Component | Version | License | Use |
| --- | --- | --- | --- |
| [marked](https://github.com/markedjs/marked) | 4.3.0 | MIT | Markdown → HTML |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.0.6 | Apache-2.0 or MPL-2.0 | Sanitize HTML |
| [highlight.js](https://highlightjs.org) | 11.9.0 | BSD-3-Clause | Syntax highlighting (GitHub light and dark themes) |
| [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | 3.11.174 | Apache-2.0 | Read PDFs |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT or GPL-3.0 | Read Office/epub/zip and create the files .zip |
| [SheetJS](https://sheetjs.com) (`xlsx`) | 0.18.5 | Apache-2.0 | Read spreadsheets |
| [Lucide](https://lucide.dev) (`lucide-static`) | 1.49.0 | ISC | Icons (copied into `icons.js`) |

The minified files keep their license notice in the header.

## Downloaded when building the desktop app (not in the repository)

| Component | Version | License | How it arrives |
| --- | --- | --- | --- |
| [Electron](https://www.electronjs.org) (includes Chromium and Node.js) | 43.7.6 | MIT (Chromium: several, see `LICENSES.chromium.html` in the built program) | `npm install` |
| [electron-builder](https://www.electron.build) | 26.15.3 | MIT | `npm install` (only for building) |
| [PHP for Windows](https://windows.php.net) | 8.3.x (NTS, x64) | PHP License 3.01 | `desktop/preparar-php.ps1` |
| cURL root certificates (`cacert.pem`) | — | MPL-2.0 (Mozilla data) | `desktop/preparar-php.ps1` |
| Visual C++ runtime (`vcruntime140.dll`, `msvcp140.dll`) | — | Microsoft redistribution license | `desktop/construir.bat` (copied from Windows) |

## External programs the app uses but doesn't include

| Program | License | Purpose |
| --- | --- | --- |
| [Ollama](https://ollama.com) | MIT | Run the models (required) |
| [FastSD CPU](https://github.com/rupeshs/fastsdcpu) | MIT | Generate images (optional) |
| [SearXNG](https://github.com/searxng/searxng) | AGPL-3.0 | Local search engine (optional, in Docker) |

The AI models you download with Ollama have their own licenses (for example, Apache-2.0 for Qwen3 or the Llama license
for Meta's models). Review them if you're going to use the app for commercial purposes.

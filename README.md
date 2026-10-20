# Local AI UI

**English** · [Español](README.es.md)

By **Aquaruis Canel** · [MIT](LICENSE) license

A chat interface for your local AI models with [Ollama](https://ollama.com): everything runs and stays on your PC.
It searches the web only when needed (no API keys), shows the code the AI writes as editable files with a live preview,
can read your projects, generates images and offers an OpenAI-compatible API.

It runs as a **Windows program** (`.exe`, nothing to install besides Ollama) or as a **web app on XAMPP**.

## Features

- **Chat** with streaming answers, Markdown, syntax highlighting, visible reasoning, edit, regenerate, export to Markdown or PDF.
- **Automatic web search:** the AI decides whether the question needs the internet (something current or that the model doesn't know),
  writes the query using the chat context, reads the pages and cites the sources with their dates. No API key (DuckDuckGo) or a local
  [SearXNG](searxng/).
- **Code panel:** long code blocks open as files in a side panel, with an HTML/SVG preview. When you ask for a change, the AI sends only
  the lines to modify and a new version is created (v2, v3…). List of the chat's files and download as .zip.
- **Project folder (read-only):** connect a folder and the AI explores it with tools (list, search, read) to answer questions about your code.
- **Attachments:** images (vision models), PDF (scanned ones too), Word, PowerPoint, Excel, epub, zip, notebooks… and RAG for long documents.
- **Memory management:** a single model loaded at a time (switching AI frees the previous one's RAM and GPU), memory indicator, and
  models unloaded on exit.
- **Long-term memory** about the user and automatic chat titles.
- **Images** with [FastSD CPU](https://github.com/rupeshs/fastsdcpu): in the chat and in a console with a gallery.
- **OpenAI-compatible API** with local keys, a model assigned per key and optional web search.
- **Model manager:** download models and check for updates.
- Interface in **Español, English, Русский, 中文 and 日本語**, light and dark themes.

## Requirements

- Windows 10/11, 64-bit.
- [Ollama](https://ollama.com/download) with at least one model (`ollama pull qwen3:8b`). If it's installed but closed, the app starts it.
- Optional: [FastSD CPU](https://github.com/rupeshs/fastsdcpu) for images and [Docker Desktop](https://www.docker.com/products/docker-desktop/) for SearXNG.

Memory (RAM or GPU) depends on the model: a 7–8B model needs about 8 GB. For web search and the project folder, models with tool
support such as `qwen3` are recommended (they're marked «tools» in the model selector).

## Installation

### Option 1: Windows program

1. Download the ZIP from **[Releases](../../releases)** and unzip it anywhere.
2. Run `Local AI UI.exe` (it must stay in its folder, together with the other files).

The program isn't code-signed, so Windows will show «Windows protected your PC»: click **More info → Run anyway**.

Your data is stored in `%APPDATA%\Local AI UI\data` and is kept when you update.

### Option 2: build the program

```bat
git clone <this-repository-url>
cd <folder>\desktop
construir.bat
```

Requires [Node.js LTS](https://nodejs.org). The script downloads portable PHP and Electron and puts the build in `desktop\dist`.
Details and troubleshooting (in Spanish): [docs/escritorio.md](docs/escritorio.md).

### Option 3: XAMPP (for development)

1. Copy the folder into `C:\xampp\htdocs\`.
2. Start **Apache** in the XAMPP control panel. MySQL isn't needed: the SQLite database `data/ia_local.sqlite` is created automatically.
   If you see «pdo_sqlite no está activa», remove the `;` before `extension=pdo_sqlite` in XAMPP's `php.ini` and restart Apache.
3. Open `http://localhost/<folder>/`.

Ollama and FastSD addresses are set in `server/config.php`.

## Quick guide

The interface starts in Spanish: switch to English with the **Configuraciones** button (gear icon) → **Idioma**. The labels below are the English ones.

| I want to… | How |
| --- | --- |
| Search the internet | It already does when needed. **Web** selector next to the model: Automatic / Always / Never. |
| See or download the code it wrote | **Open** button on the file card, or the files button in the header (download as .zip). |
| Change that code | Ask in the chat («make the button green»): the next version appears. |
| Have it read my project | Folder button next to the paperclip → pick the folder. Use a model marked «tools». |
| Free GPU memory | Eject button next to the memory indicator, or switch models (the previous one is unloaded). |
| Use it from another program | Create a key in the **API keys console** and use `http://127.0.0.1:8765/api.php/v1` as the base URL. |
| Bring my chats from the MySQL version | Run `desktop\importar-mysql.bat` with XAMPP's MySQL running. |

Shortcuts: **Alt+N** new chat · **Ctrl+B** sidebar · **Ctrl+,** settings · **Ctrl+K** search chats · **Esc** close the code panel.

## Documentation

The technical documentation is in Spanish.

| Document | Contents |
| --- | --- |
| [Architecture](docs/arquitectura.md) | Overview, layers, the path of a message, design decisions |
| [Server (PHP)](docs/backend.md) | Routing, libraries, handlers, database, security |
| [API reference](docs/api.md) | Every internal action and the OpenAI-compatible API, with examples |
| [Interface (JavaScript)](docs/frontend.md) | Pages, load order, global state, saved settings, languages, icons, styles |
| [How each feature works](docs/funciones.md) | Web search, code panel and edits, project folder, model memory, attachments, RAG… |
| [Desktop app](docs/escritorio.md) | Electron, portable PHP, building, paths, troubleshooting |
| [Contributing guide](docs/contribuir.md) | Conventions, adding actions, modules and translations |
| [Third-party software](docs/terceros.md) | Bundled libraries and their licenses |

## Structure

```
├── index.html · imagenes.html · claves.html   The three pages (chat, images, API keys)
├── api.php                                    API entry point
├── assets/
│   ├── css/styles.css
│   ├── js/common.js · icons.js
│   ├── js/i18n/                               Translations and language engine
│   ├── js/chat/                               The chat, one file per topic
│   ├── js/pages/                              Image and API key consoles
│   └── vendor/                                Bundled libraries (works offline)
├── server/
│   ├── config.php
│   ├── lib/                                   Database, HTTP and page reading, search engines
│   ├── handlers/                              One file per group of actions
│   └── tools/importar-mysql.php
├── desktop/                                   Desktop app (Electron + portable PHP) and scripts
├── searxng/                                   Optional local search engine (Docker)
├── docs/                                      Documentation
└── limpiar.bat                                Deletes build output and local data before publishing
```

## Privacy and security

- Conversations, memory and images stay on your PC. Only **web searches** (to the chosen search engine and the pages it reads)
  and model downloads go to the internet.
- The project folder is read **without writing anything**, and only from this PC.
- The desktop app only listens on `127.0.0.1`. **With XAMPP**, Apache listens on your whole local network: don't expose it to the internet.
- API keys are stored as hashes.

More details in [docs/backend.md](docs/backend.md#seguridad).

## License

© 2026 **Aquaruis Canel**. Open source under the [MIT license](LICENSE).

You may use, copy, modify and distribute this project (commercially too) as long as you **credit its author**:
keep the copyright notice and the `LICENSE` file in every copy or modified version, and mention Aquaruis Canel as the original author.
To cite it in a work, use GitHub's «Cite this repository» button ([CITATION.cff](CITATION.cff)).

Bundled libraries and external programs have their own licenses: see [docs/terceros.md](docs/terceros.md).

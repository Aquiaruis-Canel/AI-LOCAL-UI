# Interface (HTML + JavaScript)

**English** · [Español](../frontend.md)

The interface is three HTML pages with JavaScript **without a framework or build step**. Edit a file, reload the page
(Ctrl+F5, or Ctrl+R in the desktop app) and that's it.

| Page | Purpose | Own scripts |
| --- | --- | --- |
| `index.html` | Chat | `assets/js/chat/*.js` (18 files) |
| `imagenes.html` | Image console (FastSD CPU) and gallery | `assets/js/pages/imagenes.js` |
| `claves.html` | API keys console, server search engine and `/v1` API tests | `assets/js/pages/claves.js` |

All three load `common.js`, `icons.js`, `i18n/translations.js` and `i18n/engine.js` first.

## Classic scripts and load order

The files in `assets/js/chat/` are **not ES modules**: they're plain `<script>` tags sharing the global scope. Each one defines
functions and variables the others use directly (`send()`, `getChat()`, `controller`…). Therefore:

- **The order in `index.html` matters** for code that runs at load time (for example, assigning a button's `onclick`).
- Functions can call others defined further down, as long as they're called **after** everything has loaded.
  That's why `main.js` (which calls `init()`) comes last.
- Every file starts with a one-line comment describing what it contains (in Spanish).

Chat load order:

| # | File | Responsibility |
| --- | --- | --- |
| 1 | `common.js` | Helpers: `$(id)`, `API`, `JSON_HDR`, `esc()`, `dbApi()`; replaces `prompt()` in Electron |
| 2 | `icons.js` | Inline Lucide icons: `ic(name)` and `data-ic` attributes |
| 3 | `i18n/translations.js` | Translation table `TR` and `LANGS` |
| 4 | `i18n/engine.js` | Translates the page live; `t()`, `setLang()` |
| 5 | `state.js` | Global state, sidebar, modes, vision model, saving (`save`, `persist`, `loadMessages`) |
| 6 | `attachments.js` | Attachments: images, PDF (text or scanned → images), pending list; `getChat()` |
| 7 | `chats.js` | Chat list: new, open, delete, import old chats from `localStorage`; `init()` |
| 8 | `code-panel.js` | File cards, side code panel, isolated preview |
| 9 | `files.js` | Versions of the chat's files, SEARCH/REPLACE edits, file list and .zip |
| 10 | `messages.js` | Markdown (marked + DOMPurify + highlight.js), bubbles, edit/copy/regenerate, context counter |
| 11 | `generation.js` | Image mode in the chat |
| 12 | `send.js` | Sending: search decision, RAG, streaming, tool loop |
| 13 | `events.js` | Enter, paste, drag files, image mode button |
| 14 | `models.js` | Model selector, download and update manager, reasoning |
| 15 | `ram.js` | Models in memory: indicator and «one model only» |
| 16 | `folder.js` | Project folder: bar, tools for the model |
| 17 | `file-reader.js` | Reading Office, spreadsheets, zip, epub, ipynb, gz, rtf… |
| 18 | `memory.js` | Long-term memory and automatic titles |
| 19 | `settings.js` | Appearance, web search (mode, provider, keys) |
| 20 | `actions.js` | Copy code, export .md/PDF, regenerate, summarize, search chats, keyboard shortcuts |
| 21 | `rag.js` | Chunks and embeddings of long documents |
| 22 | `main.js` | Calls `init()` |

## Global state

| Variable | File | What it holds |
| --- | --- | --- |
| `chats` | `state.js` | List of chats `{id, title, messages, system?, folder?}`. `messages` is `null` until the chat is opened. |
| `current` | `state.js` | Id of the open chat (also in `localStorage`). |
| `controller` | `state.js` | `AbortController` of the answer in progress; `null` when there's none. Many actions are blocked while it exists. |
| `modelCaps` | `state.js` | Each model's capabilities (`vision`, `tools`, `thinking`…) from `?action=models`. |
| `genMode` | `state.js` | Image mode on. |
| `pending` | `attachments.js` | Attachments ready for the next message. |
| `memories` | `memory.js` | Long-term memories. |
| `knownThinking`, `noThinkModels` | `models.js` | Models that reason or that reject the `think` parameter (learned from the answers). |
| `mdFiles`, `mdPlain` | `files.js`, `code-panel.js` | Markdown renderer context while painting a message (see [features.md](features.md#code-panel-and-edits)). |
| `cp` | `code-panel.js` | Panel state: open file, whether it follows the answer in progress, code/preview view. |

`getChat()` returns the open chat. `save()` stores it in the database; `persist()` queues saves so they don't overwrite each other.

## Main functions

| Function | File | What it does |
| --- | --- | --- |
| `send(override?)` | `send.js` | Sends the message (or the one in `override` when editing or regenerating). Full flow in [architecture.md](architecture.md#the-path-of-a-message). |
| `streamChat(body, reply, bubble, model)` | `send.js` | One streaming chat request: paints each chunk and returns the `tool_calls` the model asks for. |
| `needsWeb()`, `searchQuery()`, `quickAsk()` | `send.js` | Search decision (YES/NO), query for the search engine and short question to the model. |
| `render()` | `messages.js` | Repaints the sidebar, messages, context counter, folder bar and file list. |
| `bubbleHTML(m)`, `paint(bubble, m)` | `messages.js` | A message's HTML; `paint` repaints it during streaming without closing an open reasoning block. |
| `md(text, plain?)` | `messages.js` | Markdown → sanitized HTML. `plain = true` renders code inline (PDF export). |
| `codeCard()`, `openCodePanel()`, `codePanelLive()` | `code-panel.js` | File card, open the panel, follow the answer in progress. |
| `chatFiles(c, upto)`, `filesForModel(c, upto)` | `files.js` | Versions of the chat's files; what is sent to the model. |
| `unloadOthers(keep, force?)`, `refreshLoaded()` | `ram.js` | Unload models from memory; refresh the indicator. |
| `runTool()`, `folderSys()`, `folderTree()` | `folder.js` | Run a folder tool; instructions and file map for the model. |
| `generate(c, text)` | `generation.js` | Image mode: improves the prompt with the AI and calls FastSD. |
| `loadModels()` | `models.js` | Fills the model selectors and Ollama's status. |

## Settings saved in the browser (`localStorage`)

These are per-browser preferences (in the desktop app, per installation). Chats and memory are **not** here: they're in SQLite.

| Key | Setting |
| --- | --- |
| `lang` | Language (`es`, `en`, `ru`, `zh`, `ja`), shared by the three pages |
| `theme`, `fontSize` | Light/dark theme and font size |
| `current`, `sidebarHidden` | Open chat and hidden sidebar |
| `model`, `defModel`, `visionModel` | Last used model, default model and vision model |
| `mode` | Reasoning / Fast / Precise / Creative |
| `webMode` | Web search: `auto` (default), `always`, `never` |
| `rewriteOn`, `scrapeOn`, `searchV2` | Rewrite the query («Always» mode), read pages, one-time migration to the key-free search engine |
| `searchProvider`, `searxUrl`, `ollamaKey`, `tavilyKey`, `googleKey`, `googleCx` | Search engine and its keys (only in this browser) |
| `oneModel` | Keep only one model in memory |
| `memOn`, `ragOn`, `embedModel`, `pdfPages` | Memory, RAG, embedding model, scanned PDF pages |
| `imgModel`, `img_*` | Image model and image console fields |
| `cpWidth` | Code panel width |
| `knownThinking`, `noThinkModels` | What was learned about each model's reasoning |
| `chats`, `skipMigrate` | Old chats from the first version (before MySQL) and whether importing them was already offered |

## Languages (`assets/js/i18n/`)

- `translations.js`: `TR` is an object whose **key is the Spanish text** and whose value is `[English, Russian, Chinese, Japanese]`.
  Placeholders `{0}`, `{1}`… allow translating sentences with data: `'{0} líneas': ['{0} lines', …]`.
- `engine.js` walks the page and translates text and the `placeholder`, `title`, `aria-label` and `label` attributes, and watches
  everything added later with a `MutationObserver`. It remembers the original text so the language can be switched live.
- It doesn't translate chat bubble content (what the AI or the user writes) except for marked parts: `summary`,
  `.cpy`, `.edit`, `.role`, `.empty`, `.cf-meta`, `.cf-open`.
- `t(text)` translates from code. `alert`, `confirm` and `prompt` are wrapped so they come out translated.
- Changing the language in one tab updates the others (`storage` event).

To translate a new text, write it in Spanish in the HTML or with `t()` and add its entry to `TR`.

## Icons (`assets/js/icons.js`)

[Lucide](https://lucide.dev) icons (ISC license) embedded as SVG in the file itself. Two ways to use them:

```html
<button data-ic="paperclip" title="Adjuntar archivos"></button>   <!-- the icon is added before the text -->
```

```js
b.innerHTML = ic('download') + '<span>Descargar</span>';
```

To add an icon, copy the contents of the `<svg>` in Lucide's file (`lucide-static/icons/<name>.svg`) into the `ICONS` object.

## Styles (`assets/css/styles.css`)

- CSS variables in `:root` (`--bg`, `--panel`, `--panel2`, `--line`, `--text`, `--muted`, `--accent`, `--code`…) and their light
  version in `:root[data-theme=light]`. `settings.js` switches `data-theme` and the highlight.js theme.
- Commented sections: sidebar, header, messages, footer, dialogs, image console, API keys console, scrollbars, code panel, icons,
  project folder, file list.
- Responsive layout: below 700 px the sidebar floats and below 900 px the code panel takes the whole screen.

## Bundled libraries (`assets/vendor/`)

| File | Use |
| --- | --- |
| `marked.min.js` | Markdown → HTML |
| `purify.min.js` | Sanitize the generated HTML |
| `hljs/highlight.min.js` + themes | Syntax highlighting |
| `pdf.min.js` + `pdf.worker.min.js` | Read PDFs and turn scanned ones into images |
| `jszip.min.js` | Read docx/pptx/odt/epub/zip and create the .zip of the chat's files |
| `xlsx.full.min.js` | Read spreadsheets |

Versions and licenses in [third-party.md](third-party.md).

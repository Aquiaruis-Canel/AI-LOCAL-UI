# Architecture

**English** · [Español](../arquitectura.md)

Local AI UI is a classic web application (HTML + framework-free JavaScript + PHP) that talks to **Ollama** on the same PC.
It runs in two ways with the same code:

| Mode | Web server | Window | Data |
| --- | --- | --- | --- |
| **XAMPP** (development) | XAMPP's Apache + PHP | Any browser | `data/ia_local.sqlite` and `galeria/` inside the project |
| **Desktop app** (`.exe`) | Portable PHP (`php -S`) + `desktop/router.php` | Electron | `%APPDATA%\Local AI UI\data` |

## Overview

```mermaid
flowchart LR
    subgraph PC["Your PC"]
        subgraph APP["Local AI UI"]
            UI["Interface<br/>index.html · imagenes.html · claves.html<br/>assets/js"]
            API["api.php<br/>(routes to server/handlers)"]
            DB[("SQLite<br/>ia_local.sqlite")]
        end
        OLLAMA["Ollama<br/>127.0.0.1:11434"]
        FASTSD["FastSD CPU<br/>127.0.0.1:8000<br/>(optional)"]
        SEARX["SearXNG<br/>127.0.0.1:8888<br/>(optional)"]
        FOLDER["Project folder<br/>(read-only)"]
        EXT["Other programs<br/>(API /v1)"]
    end
    WEB["Internet<br/>DuckDuckGo · web pages"]

    UI -- "fetch api.php?action=…" --> API
    EXT -- "Bearer sk-local-…" --> API
    API --> DB
    API -- "/api/chat, /api/ps…" --> OLLAMA
    API --> FASTSD
    API --> SEARX
    API --> WEB
    API -- "fs_list / fs_read / fs_search" --> FOLDER
```

The interface **never** talks to Ollama or the internet directly: everything goes through `api.php`. That lets the same page run
in the browser and in Electron, and keeps the security checks (paths, origin IP, keys) on the server.

## Layers

### 1. Interface (`index.html`, `imagenes.html`, `claves.html`, `assets/`)

- Three independent pages that share `assets/css/styles.css`, `assets/js/common.js`, `assets/js/icons.js` and the language engine.
- The chat is split into **classic scripts** (not ES modules) inside `assets/js/chat/`: they all share the global scope and
  **the load order in `index.html` matters** (a file can use another file's functions as long as they're called after everything has loaded).
- External libraries are copied into `assets/vendor/` (no CDN), so the interface works offline.
- Details: [frontend.md](frontend.md).

### 2. Server (`api.php`, `server/`)

- `api.php` is the only entry point. It reads `?action=` (or the OpenAI-style `/v1/...` path) and loads **one** file from `server/handlers/`.
- `server/lib/` holds shared code: database, HTTP/page reading and search engines.
- `server/config.php` reads the Ollama/FastSD addresses and the data folder (also from environment variables, which is how the desktop app sets them).
- Details: [backend.md](backend.md) · action reference: [api.md](api.md).

### 3. Data (SQLite)

A single `ia_local.sqlite` file in WAL mode with six tables: `chats`, `images`, `memories`, `settings`, `api_keys`, `gallery`.
Tables are created automatically on first use. Full schema in [backend.md](backend.md#database).

### 4. Desktop app (`desktop/`)

Electron starts portable PHP with `router.php` (which plays the role of Apache and the `.htaccess` files), waits for it to answer and
opens the interface in its window. It also starts Ollama if it's installed but closed, and frees the models' memory on exit.
Details: [desktop.md](desktop.md).

## The path of a message

What happens from pressing **Enviar** (Send) until the answer is saved (function `send()` in `assets/js/chat/send.js`):

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant JS as send.js
    participant API as api.php
    participant O as Ollama
    participant W as Search engine / web

    U->>JS: Send
    JS->>API: unload (keep only the current model in memory)
    API->>O: /api/ps + /api/generate keep_alive=0
    opt Long documents (RAG)
        JS->>API: embed (question)
        API->>O: /api/embed
    end
    opt Web on «Automatic» or «Always»
        JS->>API: complete (search needed? YES/NO)
        API->>O: /api/chat (no streaming)
        JS->>API: complete (query for the search engine)
        JS->>API: websearch
        API->>W: DuckDuckGo / SearXNG / … + reading 4 pages
    end
    JS->>API: chat (streaming, with tools if a folder is connected)
    API->>O: /api/chat stream=true
    O-->>JS: NDJSON chunks (painted as they arrive)
    loop While the model asks for tools (max. 12)
        JS->>API: fs_list / fs_read / fs_search
        JS->>API: chat (with the results)
    end
    JS->>JS: title and memory (<titulo>, <memoria>)
    JS->>API: db_save
    JS->>API: ps (memory indicator)
```

Each optional step is explained in [features.md](features.md).

## Design decisions

| Decision | Reason |
| --- | --- |
| Framework-free PHP and bundler-free JS | The project started on XAMPP: copy the folder and open the browser. No build step. |
| One file per topic in `assets/js/chat/` | Small, easy-to-find files without build tools. |
| SQLite instead of MySQL | One file, no server: essential for the `.exe`. Old data can be imported with `server/tools/importar-mysql.php`. |
| Libraries in `assets/vendor/` | Work offline and keep the `.exe` independent of any CDN. |
| PHP's built-in server (`php -S`) in the `.exe` | Avoids bundling Apache. Trade-off: on Windows it handles one request at a time. |
| The AI doesn't write to the project folder | Local models make more mistakes; reading is useful and risk-free. |
| Text-based SEARCH/REPLACE edits | Work with any model (no *tool calling* needed) and save tokens compared to rewriting the file. |

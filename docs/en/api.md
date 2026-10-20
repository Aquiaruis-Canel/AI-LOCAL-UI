# API reference

**English** · [Español](../api.md)

There are two APIs in the same `api.php`:

1. **Internal API** (`api.php?action=…`): used by the interface. No authentication: it's meant for the local PC.
2. **OpenAI-compatible API** (`api.php/v1/…`): for scripts and other apps. Requires an API key created in the API keys console.

Internal API conventions:

- JSON request bodies and responses (`Content-Type: application/json`), except for streaming actions, which return **NDJSON**
  (one JSON object per line).
- An error returns an HTTP 4xx/5xx code and `{"error": "readable message"}`.
- Base URL: `http://localhost/<folder>/api.php` with XAMPP; `http://127.0.0.1:8765/api.php` in the desktop app.

## Chat and models

### `POST ?action=chat` (or no `action`): streaming chat

| Field | Type | Description |
| --- | --- | --- |
| `model` | text | Required. Ollama name, e.g. `qwen3:8b`. |
| `messages` | list | Required. Ollama format (`role`, `content`, `images`, `tool_calls`, `tool_name`). |
| `num_ctx` | integer | Context in tokens (default 8192). |
| `temperature` | number | Default 0.7. |
| `think` | bool | Only sent when the model supports reasoning (`true`/`false`). |
| `tools` | list | Tools in Ollama/OpenAI format (used by the project folder). |

Response: NDJSON forwarded as-is from Ollama's `/api/chat` (`message.content`, `message.thinking`, `message.tool_calls`,
and finally `done: true` with `prompt_eval_count`, `eval_count`, `eval_duration`). On failure, a line `{"error": "…"}`.
If the browser closes the connection (Stop), the server stops reading from Ollama.

### `POST ?action=complete`: short answer without streaming

| Field | Default | Description |
| --- | --- | --- |
| `model`, `messages` | — | As in `chat`. |
| `think` | — | `false` so that a reasoning model answers directly. |
| `num_ctx` | 4096 | |
| `temperature` | 0.7 | |
| `num_predict` | — | Maximum tokens to generate. |
| `keep_alive` | `"5m"` | How long the model stays in memory. `0` = unload it when done (used by image mode). |

Response: Ollama's `/api/chat` JSON (`message.content`…). Used by the search decision, the search query, the image prompt and
«Resumir y continuar» (Summarize and continue).

### `POST ?action=embed`

`{"model": "nomic-embed-text", "input": ["text 1", "text 2"]}` → `{"embeddings": [[…], […]]}`. For RAG.

### `GET ?action=ps` and `POST ?action=unload`

- `ps` → `{"loaded": [{"name", "size", "vram", "expires"}], "unloaded": []}`: models loaded in memory (`size` and `vram` in bytes).
- `unload` with `{"keep": ["qwen3:8b", "nomic-embed-text:latest"]}` unloads every model from RAM/VRAM **except** those in `keep`
  and returns the same format with the `unloaded` list. `keep: []` unloads them all.

### `GET ?action=models`

Ollama's `/api/tags`, with `capabilities` filled in from `/api/show`:
`{"models": [{"name": "qwen3:8b", "size": …, "digest": "…", "capabilities": ["completion", "tools", "thinking"]}]}`.

### `GET ?action=check_updates`

`{"models": [{"name", "size", "digest", "local", "remote", "status": "ok" | "update" | "error", "note"}]}`.
Compares the local digest with the registry's (registry.ollama.ai or the model's host, such as `hf.co`).

### `POST ?action=pull`

`{"name": "qwen3:8b"}` → NDJSON with `/api/pull` progress (`status`, `total`, `completed`).

## Web search

### `POST ?action=websearch`

| Field | Description |
| --- | --- |
| `query` | Required. Text to search for. |
| `provider` | `duckduckgo` (default), `searxng`, `ollama`, `tavily` or `google`. |
| `searx_url` | SearXNG address (default `http://127.0.0.1:8888`). |
| `key`, `tavily_key`, `google_key`, `google_cx` | Keys for the providers that need an API key. |
| `scrape` | `true` (default) = read the text of the first 4 pages. |

Empty fields are filled from what's saved in the API keys console and then from the environment variables
`OLLAMA_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` and `SEARXNG_URL`.

Response: `{"provider": "duckduckgo", "results": [{"title", "url", "content", "date"}]}` (`date` as `Y-m-d` or empty).

## Chat history (`db_*`)

| Action | Method | Input | Response |
| --- | --- | --- | --- |
| `db_list` | GET | — | `{"chats": [{"id", "title", "t"}]}` (`t` = Unix seconds of the last change), newest first |
| `db_get` | GET | `&id=…` | `{"id", "title", "messages": […]}` with images already rebuilt |
| `db_save` | POST | `{"id", "title", "messages"}` | `{"ok": true}`. Creates or replaces the chat. |
| `db_delete` | POST | `{"id"}` | `{"ok": true}` |
| `db_search` | GET | `&q=text` | `{"ids": […]}`: chats whose title or messages contain the text (max. 200) |
| `db_mem_list` | GET | — | `{"memories": [{"id", "text"}]}` |
| `db_mem_add` | POST | `{"text"}` (max. 500 characters) | `{"id"}` |
| `db_mem_delete` | POST | `{"id"}` or `{"id": "all"}` | `{"ok": true}` |

## Project folder (`fs_*`)

All by POST, only from `127.0.0.1`/`::1`, and always with `root` (absolute path of the folder). `path` values are relative to
`root`; an absolute path is only accepted if it falls inside it.

| Action | Input | Response |
| --- | --- | --- |
| `fs_check` | `{root}` | `{"root", "name", "files", "size", "more"}`: validates and counts the folder (stops at 20,000 files) |
| `fs_list` | `{root, path=".", depth=2}` (1–4) | `{"result": "text tree", "summary"}`: max. 400 entries |
| `fs_read` | `{root, path, start_line=1, end_line}` | `{"result": "numbered lines", "summary"}`: max. 400 lines per read |
| `fs_search` | `{root, query, path="."}` | `{"result": "path:line: text…", "summary"}`: max. 60 results, 8 per file |

`result` is the text returned to the model; `summary` is the line shown in the chat (in Spanish: «Leyó src/app.js (líneas 1–120)»).

## Images and gallery

| Action | Method | Input | Response |
| --- | --- | --- | --- |
| `imagestatus` | GET | — | `{"ok": true}` if FastSD CPU answers |
| `imagegen` | POST | `{prompt, negative, model, steps, guidance, width, height, count (1–4), seed, openvino, tiny}` | `{"images": [base64…]}` |
| `image` | POST | `{prompt, width}` | `{"image": base64}` (old variant, no longer used by the interface) |
| `gal_save` | POST | `{image, prompt, info}` | `{"id", "url": "galeria/<file>"}` |
| `gal_list` | GET | — | `{"items": [{"id", "url", "prompt", "info"}]}` (max. 300) |
| `gal_delete` | POST | `{id}` | `{"ok": true}` |

In `imagegen`, a `model` starting with `lora:` uses LCM-LoRA on that base model (without OpenVINO).

## API keys and server search engine (`key_*`)

| Action | Method | Input | Response |
| --- | --- | --- | --- |
| `key_list` | GET | — | `{"keys": [{"id", "name", "prefix", "web_search", "model", "created", "last_used", "uses"}]}` |
| `key_create` | POST | `{name, web_search, model}` | `{"key": "sk-local-…", "id", "model"}`: the full key is **only** returned here |
| `key_update` | POST | `{id, model}` | `{"ok": true}` |
| `key_delete` | POST | `{id}` | `{"ok": true}` |
| `key_search_get` | GET | — | `{"provider", "scrape", "google_cx", "searx_url", "has": {"key", "tavily_key", "google_key"}}`: never returns the keys |
| `key_search_save` | POST | `{provider, scrape, google_cx, searx_url, key, tavily_key, google_key, clear_keys}` | `{"ok": true}`: an empty key keeps the previous one |
| `key_search_test` | POST | `{query}` | `{"provider", "results"}` |

---

## OpenAI-compatible API

Base URL: `http://127.0.0.1:8765/api.php/v1` (desktop app; menu Archivo → «Copiar la URL de la API») or
`http://localhost/<folder>/api.php/v1` (XAMPP). It only works while the app (or Apache) is running.

**Authentication:** `Authorization: Bearer sk-local-…` (the `X-Api-Key` header is also accepted).

### `GET /v1/models`

```json
{"object": "list", "data": [{"id": "qwen3:8b", "object": "model", "created": 0, "owned_by": "ollama"}]}
```

If the key has an assigned model, only that one is listed.

### `POST /v1/chat/completions`

The body is OpenAI's and is forwarded to Ollama's `/v1/chat/completions`, with and without `"stream": true` (SSE).
Extras of this API:

| Extra | Effect |
| --- | --- |
| `"web_search": true` or `"model": "qwen3:8b+web"` | Searches the web with the last user message and appends the results with their dates and the usage rules. The key needs search permission. |
| `web_sources` in the response | Without streaming: `[{"title", "url"}]` of the sources used. |
| `X-Web-Sources` header | URLs consulted (also with streaming). |
| Key with an assigned model | `model` is optional; asking for another one returns **403**. |

Errors in OpenAI format: `{"error": {"message", "type", "code"}}` (401 missing or invalid key, 403 not allowed, 404 unknown route).

**Example with the official Python SDK:**

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8765/api.php/v1", api_key="sk-local-…")
r = client.chat.completions.create(
    model="qwen3:8b",
    messages=[{"role": "user", "content": "When is Colombia's next match?"}],
    extra_body={"web_search": True},
)
print(r.choices[0].message.content)
```

**With curl:**

```bash
curl http://127.0.0.1:8765/api.php/v1/chat/completions \
  -H "Authorization: Bearer sk-local-…" -H "Content-Type: application/json" \
  -d '{"model": "qwen3:8b", "messages": [{"role": "user", "content": "Hello"}]}'
```

# Referencia de la API

Hay dos APIs en el mismo `api.php`:

1. **API interna** (`api.php?action=…`): la usa la interfaz. Sin autenticación: está pensada para el propio PC.
2. **API compatible con OpenAI** (`api.php/v1/…`): para scripts y otras apps. Requiere una API key creada en la consola de API keys.

Convenciones de la API interna:

- Cuerpo y respuestas en JSON (`Content-Type: application/json`), salvo las acciones con streaming, que devuelven **NDJSON**
  (un objeto JSON por línea).
- Un error responde con un código HTTP 4xx/5xx y `{"error": "mensaje legible"}`.
- Base URL: `http://localhost/<carpeta>/api.php` con XAMPP; `http://127.0.0.1:8765/api.php` en la app de escritorio.

## Chat y modelos

### `POST ?action=chat` (o sin `action`): chat con streaming

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `model` | texto | Obligatorio. Nombre en Ollama, p. ej. `qwen3:8b`. |
| `messages` | lista | Obligatorio. Formato de Ollama (`role`, `content`, `images`, `tool_calls`, `tool_name`). |
| `num_ctx` | entero | Contexto en tokens (por defecto 8192). |
| `temperature` | número | Por defecto 0.7. |
| `think` | bool | Solo se envía si el modelo razona (`true`/`false`). |
| `tools` | lista | Herramientas en formato Ollama/OpenAI (las usa la carpeta del proyecto). |

Respuesta: NDJSON reenviado tal cual desde `/api/chat` de Ollama (`message.content`, `message.thinking`, `message.tool_calls`,
y al final `done: true` con `prompt_eval_count`, `eval_count`, `eval_duration`). Si falla, una línea `{"error": "…"}`.
Si el navegador corta la conexión («Detener»), el servidor deja de leer de Ollama.

### `POST ?action=complete`: respuesta corta sin streaming

| Campo | Por defecto | Descripción |
| --- | --- | --- |
| `model`, `messages` | — | Como en `chat`. |
| `think` | — | `false` para que un modelo que razona conteste directo. |
| `num_ctx` | 4096 | |
| `temperature` | 0.7 | |
| `num_predict` | — | Máximo de tokens a generar. |
| `keep_alive` | `"5m"` | Cuánto tiempo sigue el modelo en memoria. `0` = descargarlo al terminar (lo usa el modo imagen). |

Respuesta: el JSON de `/api/chat` de Ollama (`message.content`…). Lo usan la decisión de búsqueda, la consulta para el buscador,
el prompt de imagen y «Resumir y continuar».

### `POST ?action=embed`

`{"model": "nomic-embed-text", "input": ["texto 1", "texto 2"]}` → `{"embeddings": [[…], […]]}`. Para el RAG.

### `GET ?action=ps` y `POST ?action=unload`

- `ps` → `{"loaded": [{"name", "size", "vram", "expires"}], "unloaded": []}`: modelos cargados en memoria (`size` y `vram` en bytes).
- `unload` con `{"keep": ["qwen3:8b", "nomic-embed-text:latest"]}` descarga de la RAM/VRAM todos los modelos **excepto** los de `keep`
  y devuelve el mismo formato con la lista `unloaded`. `keep: []` los descarga todos.

### `GET ?action=models`

`/api/tags` de Ollama, con `capabilities` completadas desde `/api/show`:
`{"models": [{"name": "qwen3:8b", "size": …, "digest": "…", "capabilities": ["completion", "tools", "thinking"]}]}`.

### `GET ?action=check_updates`

`{"models": [{"name", "size", "digest", "local", "remote", "status": "ok" | "update" | "error", "note"}]}`.
Compara el digest local con el del registro (registry.ollama.ai o el host del modelo, como `hf.co`).

### `POST ?action=pull`

`{"name": "qwen3:8b"}` → NDJSON con el progreso de `/api/pull` (`status`, `total`, `completed`).

## Búsqueda web

### `POST ?action=websearch`

| Campo | Descripción |
| --- | --- |
| `query` | Obligatorio. Texto a buscar. |
| `provider` | `duckduckgo` (por defecto), `searxng`, `ollama`, `tavily` o `google`. |
| `searx_url` | Dirección de SearXNG (por defecto `http://127.0.0.1:8888`). |
| `key`, `tavily_key`, `google_key`, `google_cx` | Claves de los proveedores con API key. |
| `scrape` | `true` (por defecto) = leer el texto de las 4 primeras páginas. |

Los campos vacíos se completan con lo guardado en la consola de API keys y, después, con las variables de entorno
`OLLAMA_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` y `SEARXNG_URL`.

Respuesta: `{"provider": "duckduckgo", "results": [{"title", "url", "content", "date"}]}` (`date` en `Y-m-d` o vacío).

## Historial de chats (`db_*`)

| Acción | Método | Entrada | Respuesta |
| --- | --- | --- | --- |
| `db_list` | GET | — | `{"chats": [{"id", "title", "t"}]}` (`t` = segundos Unix de la última modificación), del más reciente al más antiguo |
| `db_get` | GET | `&id=…` | `{"id", "title", "messages": […]}` con las imágenes ya reconstruidas |
| `db_save` | POST | `{"id", "title", "messages"}` | `{"ok": true}`. Crea o reemplaza el chat. |
| `db_delete` | POST | `{"id"}` | `{"ok": true}` |
| `db_search` | GET | `&q=texto` | `{"ids": […]}`: chats cuyo título o mensajes contienen el texto (máx. 200) |
| `db_mem_list` | GET | — | `{"memories": [{"id", "text"}]}` |
| `db_mem_add` | POST | `{"text"}` (máx. 500 caracteres) | `{"id"}` |
| `db_mem_delete` | POST | `{"id"}` o `{"id": "all"}` | `{"ok": true}` |

## Carpeta del proyecto (`fs_*`)

Todas por POST, solo desde `127.0.0.1`/`::1`, y siempre con `root` (ruta absoluta de la carpeta). Las rutas `path` son
relativas a `root`; una ruta absoluta solo se acepta si cae dentro.

| Acción | Entrada | Respuesta |
| --- | --- | --- |
| `fs_check` | `{root}` | `{"root", "name", "files", "size", "more"}`: valida la carpeta y la cuenta (se detiene en 20.000 archivos) |
| `fs_list` | `{root, path=".", depth=2}` (1–4) | `{"result": "árbol de texto", "summary"}`: máx. 400 entradas |
| `fs_read` | `{root, path, start_line=1, end_line}` | `{"result": "líneas numeradas", "summary"}`: máx. 400 líneas por lectura |
| `fs_search` | `{root, query, path="."}` | `{"result": "ruta:línea: texto…", "summary"}`: máx. 60 resultados, 8 por archivo |

`result` es el texto que se le devuelve al modelo; `summary` es la línea que se muestra en el chat («Leyó src/app.js (líneas 1–120)»).

## Imágenes y galería

| Acción | Método | Entrada | Respuesta |
| --- | --- | --- | --- |
| `imagestatus` | GET | — | `{"ok": true}` si FastSD CPU responde |
| `imagegen` | POST | `{prompt, negative, model, steps, guidance, width, height, count (1–4), seed, openvino, tiny}` | `{"images": [base64…]}` |
| `image` | POST | `{prompt, width}` | `{"image": base64}` (variante antigua, la interfaz ya no la usa) |
| `gal_save` | POST | `{image, prompt, info}` | `{"id", "url": "galeria/<archivo>"}` |
| `gal_list` | GET | — | `{"items": [{"id", "url", "prompt", "info"}]}` (máx. 300) |
| `gal_delete` | POST | `{id}` | `{"ok": true}` |

En `imagegen`, un `model` que empieza por `lora:` usa LCM-LoRA sobre ese modelo base (sin OpenVINO).

## API keys y buscador del servidor (`key_*`)

| Acción | Método | Entrada | Respuesta |
| --- | --- | --- | --- |
| `key_list` | GET | — | `{"keys": [{"id", "name", "prefix", "web_search", "model", "created", "last_used", "uses"}]}` |
| `key_create` | POST | `{name, web_search, model}` | `{"key": "sk-local-…", "id", "model"}`: la clave completa **solo** se devuelve aquí |
| `key_update` | POST | `{id, model}` | `{"ok": true}` |
| `key_delete` | POST | `{id}` | `{"ok": true}` |
| `key_search_get` | GET | — | `{"provider", "scrape", "google_cx", "searx_url", "has": {"key", "tavily_key", "google_key"}}`: nunca devuelve las claves |
| `key_search_save` | POST | `{provider, scrape, google_cx, searx_url, key, tavily_key, google_key, clear_keys}` | `{"ok": true}`: una clave vacía conserva la anterior |
| `key_search_test` | POST | `{query}` | `{"provider", "results"}` |

---

## API compatible con OpenAI

Base URL: `http://127.0.0.1:8765/api.php/v1` (app de escritorio; menú Archivo → «Copiar la URL de la API») o
`http://localhost/<carpeta>/api.php/v1` (XAMPP). Solo funciona mientras la app (o Apache) está en marcha.

**Autenticación:** `Authorization: Bearer sk-local-…` (también se acepta la cabecera `X-Api-Key`).

### `GET /v1/models`

```json
{"object": "list", "data": [{"id": "qwen3:8b", "object": "model", "created": 0, "owned_by": "ollama"}]}
```

Si la clave tiene un modelo asignado, solo aparece ese.

### `POST /v1/chat/completions`

El cuerpo es el de OpenAI y se reenvía a `/v1/chat/completions` de Ollama, con y sin `"stream": true` (SSE).
Extras de esta API:

| Extra | Efecto |
| --- | --- |
| `"web_search": true` o `"model": "qwen3:8b+web"` | Busca en la web con el último mensaje del usuario y añade los resultados con sus fechas y las reglas de uso. Requiere que la clave tenga permiso de búsqueda. |
| Respuesta `web_sources` | Sin streaming: `[{"title", "url"}]` de las fuentes usadas. |
| Cabecera `X-Web-Sources` | URLs consultadas (también con streaming). |
| Clave con modelo asignado | `model` es opcional; pedir otro devuelve **403**. |

Errores en formato OpenAI: `{"error": {"message", "type", "code"}}` (401 sin clave o clave inválida, 403 sin permiso, 404 ruta desconocida).

**Ejemplo con el SDK oficial de Python:**

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8765/api.php/v1", api_key="sk-local-…")
r = client.chat.completions.create(
    model="qwen3:8b",
    messages=[{"role": "user", "content": "¿Cuándo es el próximo partido de Colombia?"}],
    extra_body={"web_search": True},
)
print(r.choices[0].message.content)
```

**Con curl:**

```bash
curl http://127.0.0.1:8765/api.php/v1/chat/completions \
  -H "Authorization: Bearer sk-local-…" -H "Content-Type: application/json" \
  -d '{"model": "qwen3:8b", "messages": [{"role": "user", "content": "Hola"}]}'
```

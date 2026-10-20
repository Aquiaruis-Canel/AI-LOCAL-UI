# Guide to modifying the project

**English** · [Español](../contribuir.md)

## Development environment

There are two ways to work, with the same code:

| Option | Steps | Reload changes |
| --- | --- | --- |
| **XAMPP** | Copy the folder into `htdocs`, start Apache and open `http://localhost/<folder>/`. Enable `extension=pdo_sqlite` in XAMPP's `php.ini` if it isn't already. | Ctrl+F5 |
| **Desktop app** | `desktop\probar.bat` | Ctrl+R (web) · close and reopen (`main.js`) |

To test without a GPU, any small Ollama model will do (for example `qwen3:4b`, which supports tools).

## Conventions

- **Language:** the interface, comments and error messages are in Spanish. Visible text is translated with the `TR`
  table (see below).
- **Comments:** every file starts with a line saying what it contains; functions have a short comment explaining
  **why**, not what.
- **JavaScript:** classic scripts (not modules), no new dependencies unless they're copied into `assets/vendor/`. Use `$(id)`,
  `dbApi()`, `esc()` and `t()` from `common.js`. Always escape with `esc()` anything coming from the user or the AI before putting it into `innerHTML`.
- **PHP:** every handler starts with the `IA_LOCAL` guard, answers JSON with `{"error": "…"}` and a suitable HTTP code on failure,
  and uses `db()` and prepared statements.
- **No CDN:** every external resource is copied into the project.

## Adding an API action

1. Create `server/handlers/my_module.php`:

   ```php
   <?php
   // What this module does and which actions it handles.
   if (!defined('IA_LOCAL')) { http_response_code(403); exit; }

   if ($action === 'my_action') {
       header('Content-Type: application/json');
       $in = json_decode(file_get_contents('php://input'), true) ?: [];
       try {
           echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
       } catch (Throwable $e) {
           http_response_code(500);
           echo json_encode(['error' => $e->getMessage()]);
       }
       exit;
   }
   ```

2. Register it in the map in `api.php` (by name or by prefix, like `db_` or `fs_`).
3. Call it from the browser: `await dbApi('my_action', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({...}) })`.
4. Document it in [api.md](api.md) (and in the Spanish [api.md](../api.md)).

## Adding a chat module

1. Create `assets/js/chat/my-module.js` with its header comment.
2. Add its `<script>` to `index.html` at the right place in the load order: after the files whose variables it uses **at
   load time** and before `main.js`.
3. If it needs to repaint along with the chat, call it from `render()` in `messages.js`.

## Translating text

1. Write the text in Spanish in the HTML, or with `t('…')` in JavaScript.
2. Add the entry to `assets/js/i18n/translations.js`: `'Texto en español': ['English', 'Русский', '中文', '日本語'],`
3. For text with data, use placeholders: `t(\`${n} archivos\`)` is translated with the key `'{0} archivos'`.
4. Don't use keys that are only placeholders (`'{0}'`): they would match any text.

## Settings that are often changed

| What | Where |
| --- | --- |
| Number of lines from which a code block becomes a file | `CODE_MIN_LINES` in `code-panel.js` |
| Minimum context with a connected folder and maximum lookups | `FOLDER_CTX`, `FOLDER_ROUNDS` in `folder.js` |
| Words that trigger web search | `CURRENT_RE` in `send.js` |
| Rules the model receives with the web results | `webRules` in `send.js` and `web_rules()` in `search.php` (keep them identical) |
| Folders that aren't explored and reading limits | `FS_SKIP_DIRS`, `FS_MAX_*` in `files.php` |
| Ollama and FastSD addresses | `server/config.php` |
| Desktop app port | `PORT` in `desktop/main.js` (or the `IA_LOCAL_PORT` variable) |
| Program version | `"version"` in `desktop/package.json` |

## Before publishing

1. Run `limpiar.bat` (deletes downloaded dependencies, build output and local data) or rely on the `.gitignore`.
2. Make sure you don't upload `data/`, `galeria/` or `.sqlite` files: they contain chats and API keys.
3. Test at least: sending a message, a web search, opening a file in the panel and its preview, and connecting a folder.
4. Update the documentation in `docs/` (both languages) if you changed an action, a setting or a flow.

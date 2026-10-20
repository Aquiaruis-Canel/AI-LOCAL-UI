# Interfaz (HTML + JavaScript)

La interfaz son tres páginas HTML con JavaScript **sin framework ni compilación**. Se edita un archivo, se recarga la página
(Ctrl+F5, o Ctrl+R en la app de escritorio) y listo.

| Página | Para qué | Scripts propios |
| --- | --- | --- |
| `index.html` | Chat | `assets/js/chat/*.js` (18 archivos) |
| `imagenes.html` | Consola de imágenes (FastSD CPU) y biblioteca | `assets/js/pages/imagenes.js` |
| `claves.html` | Consola de API keys, buscador del servidor y pruebas de la API `/v1` | `assets/js/pages/claves.js` |

Las tres cargan antes `common.js`, `icons.js`, `i18n/translations.js` e `i18n/engine.js`.

## Scripts clásicos y orden de carga

Los archivos de `assets/js/chat/` **no son módulos ES**: son `<script>` normales que comparten el ámbito global. Cada uno
define funciones y variables que los demás usan directamente (`send()`, `getChat()`, `controller`…). Por eso:

- El **orden de `index.html` importa** para el código que se ejecuta al cargar (por ejemplo, asignar `onclick` a un botón).
- Las funciones sí pueden llamar a otras definidas más abajo, siempre que se llamen **después** de que todo haya cargado.
  Por eso `main.js` (que llama a `init()`) va el último.
- Cada archivo empieza con un comentario de una línea que dice qué contiene.

Orden de carga del chat:

| # | Archivo | Responsabilidad |
| --- | --- | --- |
| 1 | `common.js` | Utilidades: `$(id)`, `API`, `JSON_HDR`, `esc()`, `dbApi()`; en Electron reemplaza `prompt()` |
| 2 | `icons.js` | Íconos Lucide en línea: `ic(nombre)` y los atributos `data-ic` |
| 3 | `i18n/translations.js` | Tabla de traducciones `TR` y `LANGS` |
| 4 | `i18n/engine.js` | Traduce la página en vivo; `t()`, `setLang()` |
| 5 | `state.js` | Estado global, barra lateral, modos, modelo para visión, guardado (`save`, `persist`, `loadMessages`) |
| 6 | `attachments.js` | Adjuntar: imágenes, PDF (con texto o escaneado → imágenes), lista de pendientes; `getChat()` |
| 7 | `chats.js` | Lista de chats: nuevo, abrir, borrar, importar los antiguos de `localStorage`; `init()` |
| 8 | `code-panel.js` | Tarjetas de archivo, panel lateral de código, vista previa aislada |
| 9 | `files.js` | Versiones de los archivos del chat, ediciones BUSCAR/REEMPLAZAR, lista de archivos y .zip |
| 10 | `messages.js` | Markdown (marked + DOMPurify + highlight.js), burbujas, editar/copiar/regenerar, contador de contexto |
| 11 | `generation.js` | Modo imagen en el chat |
| 12 | `send.js` | Envío: decisión de búsqueda, RAG, streaming, bucle de herramientas |
| 13 | `events.js` | Enter, pegar, arrastrar archivos, botón de modo imagen |
| 14 | `models.js` | Selector de modelos, gestor de descargas y actualizaciones, razonamiento |
| 15 | `ram.js` | Modelos en memoria: indicador y «un solo modelo» |
| 16 | `folder.js` | Carpeta del proyecto: barra, herramientas para el modelo |
| 17 | `file-reader.js` | Lectura de Office, hojas de cálculo, zip, epub, ipynb, gz, rtf… |
| 18 | `memory.js` | Memoria a largo plazo y título automático |
| 19 | `settings.js` | Apariencia, búsqueda web (modo, proveedor, claves) |
| 20 | `actions.js` | Copiar código, exportar .md/PDF, regenerar, resumir, buscar chats, atajos de teclado |
| 21 | `rag.js` | Fragmentos y embeddings de documentos largos |
| 22 | `main.js` | Llama a `init()` |

## Estado global

| Variable | Archivo | Qué guarda |
| --- | --- | --- |
| `chats` | `state.js` | Lista de chats `{id, title, messages, system?, folder?}`. `messages` es `null` hasta que se abre el chat. |
| `current` | `state.js` | Id del chat abierto (también en `localStorage`). |
| `controller` | `state.js` | `AbortController` de la respuesta en curso; `null` si no hay ninguna. Muchas acciones se bloquean mientras existe. |
| `modelCaps` | `state.js` | Capacidades de cada modelo (`vision`, `tools`, `thinking`…) según `?action=models`. |
| `genMode` | `state.js` | Modo imagen activo. |
| `pending` | `attachments.js` | Adjuntos preparados para el próximo mensaje. |
| `memories` | `memory.js` | Recuerdos a largo plazo. |
| `knownThinking`, `noThinkModels` | `models.js` | Modelos que razonan o que rechazan el parámetro `think` (se aprenden de las respuestas). |
| `mdFiles`, `mdPlain` | `files.js`, `code-panel.js` | Contexto del renderer de Markdown mientras pinta un mensaje (ver [funciones.md](funciones.md#panel-de-código-y-ediciones)). |
| `cp` | `code-panel.js` | Estado del panel: archivo abierto, si sigue la respuesta en curso, vista código/previa. |

`getChat()` devuelve el chat abierto. `save()` lo guarda en la base de datos; `persist()` encola los guardados para que no se pisen.

## Funciones principales

| Función | Archivo | Qué hace |
| --- | --- | --- |
| `send(override?)` | `send.js` | Envía el mensaje (o el de `override` al editar o regenerar). Ver el recorrido completo en [arquitectura.md](arquitectura.md#recorrido-de-un-mensaje). |
| `streamChat(body, reply, bubble, model)` | `send.js` | Una petición de chat con streaming: pinta cada trozo y devuelve las `tool_calls` que pida el modelo. |
| `needsWeb()`, `searchQuery()`, `quickAsk()` | `send.js` | Decisión de búsqueda (SÍ/NO), consulta para el buscador y pregunta corta al modelo. |
| `render()` | `messages.js` | Repinta barra lateral, mensajes, contador de contexto, barra de carpeta y lista de archivos. |
| `bubbleHTML(m)`, `paint(bubble, m)` | `messages.js` | HTML de un mensaje; `paint` lo repinta durante el streaming sin cerrar el bloque de razonamiento abierto. |
| `md(text, plain?)` | `messages.js` | Markdown → HTML saneado. `plain = true` pinta el código en línea (exportar a PDF). |
| `codeCard()`, `openCodePanel()`, `codePanelLive()` | `code-panel.js` | Tarjeta de archivo, abrir el panel, seguir la respuesta en curso. |
| `chatFiles(c, upto)`, `filesForModel(c, upto)` | `files.js` | Versiones de los archivos del chat; lo que se le manda al modelo. |
| `unloadOthers(keep, force?)`, `refreshLoaded()` | `ram.js` | Descargar modelos de memoria; actualizar el indicador. |
| `runTool()`, `folderSys()`, `folderTree()` | `folder.js` | Ejecutar una herramienta de carpeta; instrucciones y mapa de archivos para el modelo. |
| `generate(c, text)` | `generation.js` | Modo imagen: mejora el prompt con la IA y llama a FastSD. |
| `loadModels()` | `models.js` | Rellena los selectores de modelos y el estado de Ollama. |

## Ajustes guardados en el navegador (`localStorage`)

Son preferencias por navegador (en la app de escritorio, por instalación). Los chats y la memoria **no** van aquí: van en SQLite.

| Clave | Ajuste |
| --- | --- |
| `lang` | Idioma (`es`, `en`, `ru`, `zh`, `ja`), compartido entre las tres páginas |
| `theme`, `fontSize` | Tema claro/oscuro y tamaño de letra |
| `current`, `sidebarHidden` | Chat abierto y barra lateral oculta |
| `model`, `defModel`, `visionModel` | Último modelo usado, modelo por defecto y modelo de visión |
| `mode` | Razonamiento / Rápido / Preciso / Creativo |
| `webMode` | Búsqueda web: `auto` (por defecto), `always`, `never` |
| `rewriteOn`, `scrapeOn`, `searchV2` | Reformular la consulta (modo «Siempre»), leer páginas, migración única al buscador sin API key |
| `searchProvider`, `searxUrl`, `ollamaKey`, `tavilyKey`, `googleKey`, `googleCx` | Buscador y sus claves (solo en este navegador) |
| `oneModel` | Mantener solo un modelo en memoria |
| `memOn`, `ragOn`, `embedModel`, `pdfPages` | Memoria, RAG, modelo de embeddings, páginas de PDF escaneado |
| `imgModel`, `img_*` | Modelo de imágenes y campos de la consola de imágenes |
| `cpWidth` | Ancho del panel de código |
| `knownThinking`, `noThinkModels` | Lo aprendido sobre el razonamiento de cada modelo |
| `chats`, `skipMigrate` | Chats antiguos de la primera versión (antes de MySQL) y si ya se ofreció importarlos |

## Idiomas (`assets/js/i18n/`)

- `translations.js`: `TR` es un objeto cuya **clave es el texto en español** y cuyo valor es `[inglés, ruso, chino, japonés]`.
  Los huecos `{0}`, `{1}`… permiten traducir frases con datos: `'{0} líneas': ['{0} lines', …]`.
- `engine.js` recorre la página y traduce los textos y los atributos `placeholder`, `title`, `aria-label` y `label`, y vigila
  con un `MutationObserver` todo lo que se añada después. Recuerda el texto original para poder cambiar de idioma en vivo.
- No traduce el contenido de las burbujas de chat (lo que escribe la IA o el usuario) salvo las partes marcadas: `summary`,
  `.cpy`, `.edit`, `.role`, `.empty`, `.cf-meta`, `.cf-open`.
- `t(texto)` traduce desde código. `alert`, `confirm` y `prompt` se envuelven para salir traducidos.
- Cambiar el idioma en una pestaña actualiza las demás (evento `storage`).

Para traducir un texto nuevo basta con escribirlo en español en el HTML o con `t()` y añadir su entrada a `TR`.

## Íconos (`assets/js/icons.js`)

Íconos de [Lucide](https://lucide.dev) (licencia ISC) incrustados como SVG en el propio archivo. Dos formas de usarlos:

```html
<button data-ic="paperclip" title="Adjuntar archivos"></button>   <!-- se añade el ícono delante del texto -->
```

```js
b.innerHTML = ic('download') + '<span>Descargar</span>';
```

Para añadir un ícono: copia el contenido del `<svg>` del archivo de Lucide (`lucide-static/icons/<nombre>.svg`) en el objeto `ICONS`.

## Estilos (`assets/css/styles.css`)

- Variables CSS en `:root` (`--bg`, `--panel`, `--panel2`, `--line`, `--text`, `--muted`, `--accent`, `--code`…) y su versión clara
  en `:root[data-theme=light]`. `settings.js` cambia `data-theme` y el tema de highlight.js.
- Secciones comentadas: barra lateral, cabecera, mensajes, pie, diálogos, consola de imágenes, consola de API keys, barras de
  desplazamiento, panel de código, íconos, carpeta del proyecto, lista de archivos.
- Diseño adaptable: por debajo de 700 px la barra lateral flota y por debajo de 900 px el panel de código ocupa toda la pantalla.

## Librerías incluidas (`assets/vendor/`)

| Archivo | Uso |
| --- | --- |
| `marked.min.js` | Markdown → HTML |
| `purify.min.js` | Sanear el HTML generado |
| `hljs/highlight.min.js` + temas | Colorear código |
| `pdf.min.js` + `pdf.worker.min.js` | Leer PDF y convertir los escaneados en imágenes |
| `jszip.min.js` | Leer docx/pptx/odt/epub/zip y crear el .zip de archivos del chat |
| `xlsx.full.min.js` | Leer hojas de cálculo |

Versiones y licencias en [terceros.md](terceros.md).

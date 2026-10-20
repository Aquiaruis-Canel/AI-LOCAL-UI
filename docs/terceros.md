# Software de terceros

## Incluido en el repositorio (`assets/vendor/`, `assets/js/icons.js`)

| Componente | Versión | Licencia | Uso |
| --- | --- | --- | --- |
| [marked](https://github.com/markedjs/marked) | 4.3.0 | MIT | Markdown → HTML |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.0.6 | Apache-2.0 o MPL-2.0 | Sanear el HTML |
| [highlight.js](https://highlightjs.org) | 11.9.0 | BSD-3-Clause | Colorear código (temas GitHub claro y oscuro) |
| [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | 3.11.174 | Apache-2.0 | Leer PDF |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT o GPL-3.0 | Leer Office/epub/zip y crear el .zip de archivos |
| [SheetJS](https://sheetjs.com) (`xlsx`) | 0.18.5 | Apache-2.0 | Leer hojas de cálculo |
| [Lucide](https://lucide.dev) (`lucide-static`) | 1.49.0 | ISC | Íconos (copiados en `icons.js`) |

Los archivos minificados conservan su aviso de licencia en la cabecera.

## Descargado al construir la app de escritorio (no está en el repositorio)

| Componente | Versión | Licencia | Cómo llega |
| --- | --- | --- | --- |
| [Electron](https://www.electronjs.org) (incluye Chromium y Node.js) | 43.7.6 | MIT (Chromium: varias, ver `LICENSES.chromium.html` en el programa construido) | `npm install` |
| [electron-builder](https://www.electron.build) | 26.15.3 | MIT | `npm install` (solo para construir) |
| [PHP para Windows](https://windows.php.net) | 8.3.x (NTS, x64) | PHP License 3.01 | `desktop/preparar-php.ps1` |
| Certificados raíz de cURL (`cacert.pem`) | — | MPL-2.0 (datos de Mozilla) | `desktop/preparar-php.ps1` |
| Runtime de Visual C++ (`vcruntime140.dll`, `msvcp140.dll`) | — | Licencia de redistribución de Microsoft | `desktop/construir.bat` (se copia desde Windows) |

## Programas externos que la app usa, pero no incluye

| Programa | Licencia | Para qué |
| --- | --- | --- |
| [Ollama](https://ollama.com) | MIT | Ejecutar los modelos (obligatorio) |
| [FastSD CPU](https://github.com/rupeshs/fastsdcpu) | MIT | Generar imágenes (opcional) |
| [SearXNG](https://github.com/searxng/searxng) | AGPL-3.0 | Buscador local (opcional, en Docker) |

Los modelos de IA que descargues con Ollama tienen sus propias licencias (por ejemplo, Apache-2.0 para Qwen3 o la licencia de Llama
para los modelos de Meta). Revísalas si vas a usar la app con fines comerciales.

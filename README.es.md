# Local AI UI

[English](README.md) · **Español**

Por **Aquaruis Canel** · Licencia [MIT](LICENSE)

Interfaz de chat para tus modelos de IA locales con [Ollama](https://ollama.com): todo se ejecuta y se guarda en tu PC.
Busca en la web solo cuando hace falta (sin API keys), muestra el código que escribe la IA como archivos editables con vista previa,
puede leer tus proyectos, genera imágenes y ofrece una API compatible con OpenAI.

Funciona como **programa de Windows** (`.exe`, sin instalar nada más que Ollama) o como **web en XAMPP**.

## Funciones

- **Chat** con respuestas en tiempo real, Markdown, código coloreado, razonamiento visible, editar, regenerar, exportar a Markdown o PDF.
- **Búsqueda web automática:** la IA decide si la pregunta necesita internet (algo actual o que el modelo no sabe), redacta la consulta
  con el contexto del chat, lee las páginas y cita las fuentes con su fecha. Sin API key (DuckDuckGo) o con [SearXNG](searxng/) local.
- **Panel de código:** los bloques largos salen como archivos en un panel lateral, con vista previa de HTML/SVG. Si pides un cambio,
  la IA envía solo las líneas a modificar y se crea una versión nueva (v2, v3…). Lista de archivos del chat y descarga en .zip.
- **Carpeta del proyecto (solo lectura):** conecta una carpeta y la IA la explora con herramientas (listar, buscar, leer) para responder sobre tu código.
- **Adjuntos:** imágenes (modelos con visión), PDF (también escaneados), Word, PowerPoint, Excel, epub, zip, notebooks… y RAG para documentos largos.
- **Gestión de memoria:** un solo modelo cargado a la vez (al cambiar de IA, la anterior libera RAM y GPU), indicador de memoria y
  descarga de modelos al cerrar.
- **Memoria a largo plazo** sobre el usuario y títulos automáticos de los chats.
- **Imágenes** con [FastSD CPU](https://github.com/rupeshs/fastsdcpu): en el chat y en una consola con biblioteca.
- **API compatible con OpenAI** con claves locales, modelo asignado por clave y búsqueda web opcional.
- **Gestor de modelos:** descargar, comprobar actualizaciones.
- Interfaz en **español, English, Русский, 中文 y 日本語**, tema claro y oscuro.

## Requisitos

- Windows 10/11 de 64 bits.
- [Ollama](https://ollama.com/download) con al menos un modelo (`ollama pull qwen3:8b`). Si está instalado pero cerrado, la app lo abre sola.
- Opcional: [FastSD CPU](https://github.com/rupeshs/fastsdcpu) para imágenes y [Docker Desktop](https://www.docker.com/products/docker-desktop/) para SearXNG.

La memoria (RAM o GPU) la pone el modelo: uno de 7–8B necesita unos 8 GB. Para la búsqueda web y la carpeta del proyecto se recomiendan
modelos con herramientas como `qwen3` (se marcan como «herramientas» en el selector).

## Instalación

### Opción 1: programa de Windows

1. Descarga el ZIP desde **[Releases](../../releases)** y descomprímelo donde quieras.
2. Abre `Local AI UI.exe` (debe quedarse en su carpeta, junto a los demás archivos).

Como el programa no está firmado, Windows mostrará «Windows protegió su PC»: pulsa **Más información → Ejecutar de todas formas**.

Tus datos se guardan en `%APPDATA%\Local AI UI\data` y se conservan al actualizar.

### Opción 2: construir el programa

```bat
git clone <url-de-este-repositorio>
cd <carpeta>\desktop
construir.bat
```

Necesita [Node.js LTS](https://nodejs.org). El script descarga PHP portátil y Electron, y deja el instalador en `desktop\dist`.
Detalles y solución de problemas: [docs/escritorio.md](docs/escritorio.md).

### Opción 3: XAMPP (para desarrollar)

1. Copia la carpeta en `C:\xampp\htdocs\`.
2. Arranca **Apache** en el panel de XAMPP. No hace falta MySQL: la base SQLite `data/ia_local.sqlite` se crea sola.
   Si aparece «pdo_sqlite no está activa», quita el `;` de `extension=pdo_sqlite` en el `php.ini` de XAMPP y reinicia Apache.
3. Abre `http://localhost/<carpeta>/`.

Las direcciones de Ollama y FastSD se cambian en `server/config.php`.

## Uso rápido

| Quiero… | Cómo |
| --- | --- |
| Que busque en internet | Ya lo hace solo cuando hace falta. Selector **Web** junto al modelo: Automática / Siempre / Nunca. |
| Ver o descargar el código que escribió | Botón **Abrir** de la tarjeta del archivo, o el botón de archivos de la cabecera (descarga en .zip). |
| Cambiar ese código | Pídeselo en el chat («cambia el botón a verde»): aparece la versión siguiente. |
| Que lea mi proyecto | Botón de carpeta junto al clip → elige la carpeta. Usa un modelo con «herramientas». |
| Liberar la memoria de la GPU | Botón de expulsar junto al indicador de memoria, o cambia de modelo (se descarga el anterior). |
| Usarlo desde otro programa | Crea una clave en **Consola de API keys** y usa `http://127.0.0.1:8765/api.php/v1` como base URL. |
| Traer mis chats de la versión con MySQL | `desktop\importar-mysql.bat` con MySQL de XAMPP en marcha. |

Atajos: **Alt+N** chat nuevo · **Ctrl+B** barra lateral · **Ctrl+,** configuraciones · **Ctrl+K** buscar en los chats · **Esc** cerrar el panel de código.

## Documentación

| Documento | Contenido |
| --- | --- |
| [Arquitectura](docs/arquitectura.md) | Visión general, capas, recorrido de un mensaje, decisiones de diseño |
| [Servidor (PHP)](docs/backend.md) | Enrutado, librerías, handlers, base de datos, seguridad |
| [Referencia de la API](docs/api.md) | Todas las acciones internas y la API compatible con OpenAI, con ejemplos |
| [Interfaz (JavaScript)](docs/frontend.md) | Páginas, orden de carga, estado global, ajustes guardados, idiomas, íconos, estilos |
| [Cómo funciona cada función](docs/funciones.md) | Búsqueda web, panel de código y ediciones, carpeta, memoria de modelos, adjuntos, RAG… |
| [App de escritorio](docs/escritorio.md) | Electron, PHP portátil, construir, rutas, solución de problemas |
| [Guía para modificar el proyecto](docs/contribuir.md) | Convenciones, añadir acciones, módulos y traducciones |
| [Software de terceros](docs/terceros.md) | Librerías incluidas y sus licencias |

## Estructura

```
├── index.html · imagenes.html · claves.html   Las tres páginas (chat, imágenes, API keys)
├── api.php                                    Punto de entrada de la API
├── assets/
│   ├── css/styles.css
│   ├── js/common.js · icons.js
│   ├── js/i18n/                               Traducciones y motor de idiomas
│   ├── js/chat/                               El chat, un archivo por tema
│   ├── js/pages/                              Consolas de imágenes y de API keys
│   └── vendor/                                Librerías incluidas (funciona sin internet)
├── server/
│   ├── config.php
│   ├── lib/                                   Base de datos, HTTP y lectura de páginas, buscadores
│   ├── handlers/                              Un archivo por grupo de acciones
│   └── tools/importar-mysql.php
├── desktop/                                   App de escritorio (Electron + PHP portátil) y scripts
├── searxng/                                   Buscador local opcional (Docker)
├── docs/                                      Documentación
└── limpiar.bat                                Borra lo generado y los datos locales antes de publicar
```

## Privacidad y seguridad

- Las conversaciones, la memoria y las imágenes se quedan en tu PC. Solo salen a internet las **búsquedas web** (al buscador
  elegido y a las páginas que se leen) y la descarga de modelos.
- La carpeta del proyecto se lee **sin escribir nada** y solo desde este PC.
- La app de escritorio solo escucha en `127.0.0.1`. **Con XAMPP**, Apache escucha en toda tu red local: no lo expongas a internet.
- Las API keys se guardan como hash.

Más detalles en [docs/backend.md](docs/backend.md#seguridad).

## Licencia

© 2026 **Aquaruis Canel**. Código abierto bajo la [licencia MIT](LICENSE).

Puedes usar, copiar, modificar y distribuir este proyecto (también con fines comerciales) siempre que **cites a su autor**:
conserva el aviso de copyright y el archivo `LICENSE` en cualquier copia o versión modificada, y menciona a
Aquaruis Canel como autor original. Para citarlo en un trabajo, usa el botón «Cite this repository» de GitHub ([CITATION.cff](CITATION.cff)).

Las librerías incluidas y los programas externos tienen sus propias licencias: ver [docs/terceros.md](docs/terceros.md).

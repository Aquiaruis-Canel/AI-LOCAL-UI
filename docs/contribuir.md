# Guía para modificar el proyecto

## Entorno de desarrollo

Hay dos formas de trabajar, con el mismo código:

| Opción | Pasos | Recargar cambios |
| --- | --- | --- |
| **XAMPP** | Copia la carpeta en `htdocs`, arranca Apache y abre `http://localhost/<carpeta>/`. Activa `extension=pdo_sqlite` en el `php.ini` de XAMPP si no lo está. | Ctrl+F5 |
| **App de escritorio** | `desktop\probar.bat` | Ctrl+R (la web) · cerrar y abrir (`main.js`) |

Para probar sin GPU se puede usar cualquier modelo pequeño de Ollama (por ejemplo `qwen3:4b`, que admite herramientas).

## Convenciones

- **Idioma:** la interfaz, los comentarios y los mensajes de error están en español. Los textos visibles se traducen con la tabla
  `TR` (ver más abajo).
- **Comentarios:** cada archivo empieza con una línea que dice qué contiene; las funciones llevan un comentario breve que explica
  el **porqué**, no el qué.
- **JavaScript:** scripts clásicos (no módulos), sin dependencias nuevas salvo que se copien en `assets/vendor/`. Usa `$(id)`,
  `dbApi()`, `esc()` y `t()` de `common.js`. Escapa siempre con `esc()` lo que venga del usuario o de la IA antes de meterlo en `innerHTML`.
- **PHP:** cada handler empieza con el guard `IA_LOCAL`, responde JSON con `{"error": "…"}` y un código HTTP adecuado si falla,
  y usa `db()` y consultas preparadas.
- **Sin CDN:** todo recurso externo se copia al proyecto.

## Añadir una acción a la API

1. Crea `server/handlers/mi_modulo.php`:

   ```php
   <?php
   // Qué hace este módulo y qué acciones atiende.
   if (!defined('IA_LOCAL')) { http_response_code(403); exit; }

   if ($action === 'mi_accion') {
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

2. Regístrala en el mapa de `api.php` (por nombre o por prefijo, como `db_` o `fs_`).
3. Llámala desde el navegador: `await dbApi('mi_accion', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({...}) })`.
4. Documéntala en [api.md](api.md).

## Añadir un módulo al chat

1. Crea `assets/js/chat/mi-modulo.js` con su comentario de cabecera.
2. Añade su `<script>` en `index.html` en el lugar adecuado del orden de carga: después de los archivos cuyas variables use **al
   cargar** y antes de `main.js`.
3. Si necesita repintarse con el chat, llámalo desde `render()` en `messages.js`.

## Traducir textos

1. Escribe el texto en español en el HTML, o con `t('…')` en JavaScript.
2. Añade la entrada en `assets/js/i18n/translations.js`: `'Texto en español': ['English', 'Русский', '中文', '日本語'],`
3. Para textos con datos usa huecos: `t(\`${n} archivos\`)` se traduce con la clave `'{0} archivos'`.
4. No uses claves que sean solo huecos (`'{0}'`): coincidirían con cualquier texto.

## Ajustes que suelen tocarse

| Qué | Dónde |
| --- | --- |
| Líneas a partir de las que un bloque de código es un archivo | `CODE_MIN_LINES` en `code-panel.js` |
| Contexto mínimo con carpeta conectada y máximo de consultas | `FOLDER_CTX`, `FOLDER_ROUNDS` en `folder.js` |
| Palabras que activan la búsqueda web | `CURRENT_RE` en `send.js` |
| Reglas que recibe el modelo con los resultados web | `webRules` en `send.js` y `web_rules()` en `search.php` (mantener iguales) |
| Carpetas que no se exploran y límites de lectura | `FS_SKIP_DIRS`, `FS_MAX_*` en `files.php` |
| Direcciones de Ollama y FastSD | `server/config.php` |
| Puerto de la app de escritorio | `PORT` en `desktop/main.js` (o la variable `IA_LOCAL_PORT`) |
| Versión del programa | `"version"` en `desktop/package.json` |

## Antes de publicar

1. Ejecuta `limpiar.bat` (borra dependencias descargadas, compilados y datos locales) o confía en el `.gitignore`.
2. Comprueba que no subes `data/`, `galeria/` ni archivos `.sqlite`: contienen chats y API keys.
3. Prueba al menos: enviar un mensaje, una búsqueda web, abrir un archivo en el panel y su vista previa, y conectar una carpeta.
4. Actualiza la documentación de `docs/` si cambiaste una acción, un ajuste o un flujo.

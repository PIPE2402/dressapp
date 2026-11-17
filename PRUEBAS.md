# Resultado de validación — 17 de noviembre de 2026

## Resultado más reciente: pruebas reales de las cuatro redes

**8/8 combinaciones aprobadas**: YouTube, TikTok, Instagram y Facebook, cada una en MP4 con audio y MP3 de solo audio. Se verificaron guardado mediante HTTP, integridad SHA-256, pistas, duración, decodificación completa y solicitudes parciales para previsualización. Se corrigió un fallo del filtro de calidad para videos verticales de TikTok. Las 9 pruebas automatizadas también pasaron.

Consulta el [informe actual con los archivos guardados](artifacts/VALIDACION-REDES.md) y el [detalle en JSON](artifacts/verificacion-final.json). Los resultados anteriores que siguen a continuación son el historial de la implementación y no representan el estado actual de conectividad.

## Optimización del reconocimiento

Medición puntual con el video VxrIZGQfxmE: el método anterior con yt-dlp tardó 10.708 ms. La primera consulta al endpoint de reconocimiento optimizado tardó 893 ms; una segunda consulta al mismo video usando otra forma de URL tardó 7 ms por la caché. Las tres consultas reconocieron el mismo título. Son mediciones de esta conexión, no garantías de latencia. El reconocimiento rápido consulta metadatos oficiales de YouTube por oEmbed; la comprobación de los formatos descargables continúa al descargar.

Se añadieron pruebas de la consulta ligera, unificación de URLs, agrupación de peticiones simultáneas, caducidad de caché y reintento tras errores sin guardarlos en caché.

## Actualización: MP3 y MP4

Se añadieron pruebas con el mismo flujo de descarga y conversión de la app, servido desde una fuente WebM local controlada. Se comprueba el archivo final mediante FFprobe: MP3 con una pista de audio MP3 y sin video; MP4 con video H.264 y audio AAC. También se comprueba el rechazo de formatos desconocidos desde la API.

La prueba con el enlace de YouTube proporcionado sigue fallando con ConnectionResetError 10054 antes de extraer metadatos. curl a YouTube también falla al establecer la conexión. La resolución de www.youtube.com devuelve un CNAME restrictmoderate.youtube.com. No se modificaron DNS, firewall ni controles de red y no se confirmó qué componente cierra la conexión. Elegir MP3 no resuelve este error de red.

`node --test test.mjs`: 4 pruebas aprobadas, 0 fallidas.

- URLs válidas de las cuatro plataformas y rechazo de protocolos/dominios no permitidos.
- Interfaz y recursos HTTP accesibles; respuesta 404 para recursos inexistentes.
- API: rechazo de JSON inválido, URLs ajenas, orígenes externos y archivos inexistentes.
- FFmpeg generó un MP4 con video y audio. yt-dlp lo descargó de un servidor local de prueba y el archivo resultó idéntico byte por byte.

Motor instalado: yt-dlp 2026.10.26. FFmpeg instalado. No se realizó comprobación visual con navegador automatizado: no había herramienta de navegador conectada.

## Comprobaciones externas

Se intentó extraer información de un enlace público de cada servicio. Ninguno pudo verificarse desde esta conexión:

| Servicio | Resultado observado |
| --- | --- |
| YouTube | Conexión reiniciada, error 10054 |
| TikTok | Tiempo agotado resolviendo el dominio |
| Instagram | Tiempo agotado resolviendo el dominio |
| Facebook | Error de resolución DNS |

Estas pruebas no confirman que los enlaces sigan disponibles ni que la descarga desde dichas plataformas funcione. Hace falta probar con un enlace vigente en una conexión que permita acceder a ellas. No se ha verificado la obtención de videos sin marca de agua.

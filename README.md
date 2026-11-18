# Dressapp

Para el APK autónomo de Android, consulta las [instrucciones de instalación y compilación con Gradle](android/README.md).

## App instalable

Incluye un manifiesto PWA, iconos para Android/iOS, botón Instalar app, apertura independiente y shell offline. Consulta [cómo instalarla y los requisitos de conexión](INSTALAR-APP.md). En esta PC se instala desde localhost con un navegador compatible; usarla en teléfonos necesita un servidor HTTPS accesible desde ellos. No hay una publicación móvil o URL pública completada. El motor de descarga sigue ejecutándose en el servidor.

## Reconocer un enlace

Al pegar una URL, la app inicia la comprobación sin espera adicional; al escribir, espera 250 ms desde la última tecla. Para YouTube consulta primero el endpoint oficial oEmbed (hasta 5 segundos), que confirma el título sin extraer todos los formatos. Si no responde con un video válido, se utiliza yt-dlp como respaldo. El reconocimiento rápido no devuelve duración; esta solo se muestra cuando está disponible. Los formatos y restricciones de descarga se comprueban al iniciar la descarga.

El servidor conserva los reconocimientos correctos durante 5 minutos (máximo 100 videos), agrupa peticiones simultáneas para el mismo video y unifica enlaces cortos, normales, Shorts y enlaces con parámetros de seguimiento de YouTube. Los errores no se guardan en caché. Muestra un banner de comprobación y solo habilita Descargar después de reconocerlo. Cambiar el enlace invalida la comprobación anterior. El servidor exige un permiso asociado al enlace, válido por 10 minutos. Una verificación correcta no garantiza que una descarga posterior no encuentre restricciones nuevas de la plataforma. Si falla, el banner explica el error y permite verificar de nuevo.

Los selectores de formato y calidad tienen menús oscuros, selección marcada, navegación con flechas, Inicio/Fin, Escape y cierre al hacer clic fuera. En MP3 se desactiva la resolución de video.

## Formatos

Al finalizar aparece un reproductor dentro de la tarjeta: video para MP4 o audio para MP3, sin reproducción automática. El botón Guardar sigue disponible. La previsualización sirve el archivo local con su tipo MIME y admite rangos de bytes para avanzar en la reproducción sin descargarlo entero de nuevo. Si el navegador no admite el códec, se muestra una indicación para guardar el archivo.

Escoge **MP4 · Video + audio** o **MP3 · Solo audio** antes de descargar. MP3 usa 192 kbps y desactiva el selector de resolución de video. El enlace final dice Guardar MP3 o Guardar MP4. FFprobe se instala con las dependencias y se prepara junto a FFmpeg para permitir la extracción de audio. Los fallos de conexión a las plataformas ocurren antes de la conversión y afectan a ambos formatos.

## Despliegue web

Se incluye un Dockerfile Linux con Node.js, yt-dlp y FFmpeg. El alojamiento debe admitir contenedores y procesos; el hosting estático o Cloudflare Workers no puede ejecutar este motor.

El mismo servidor debe servir la interfaz, `/api/inspect`, `/api/jobs` y los archivos descargados. Después de desplegar, comprueba que `GET /api/health` devuelva JSON con `recognition: true`. Si `POST /api/inspect` devuelve 404, el dominio no está sirviendo la API de Dressapp.

El archivo `render.yaml` configura un servicio Docker gratuito con la rama `main` y la comprobación de salud. [Crear el servicio en Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FPIPE2402%2Fdressapp). El servicio publica la interfaz y la API juntas en la URL HTTPS asignada por Render.

Dressapp usa `RENDER_EXTERNAL_URL` automáticamente. Si usas otro alojamiento o un dominio personalizado, configura `PUBLIC_ORIGIN` con su URL HTTPS exacta, sin barra final. El contenedor escucha en `0.0.0.0` y respeta `PORT`. Los videos se almacenan temporalmente en el servidor y pueden desaparecer cuando el servicio reinicia. Si conservas la URL de Vercel, puedes redirigirla al servicio una vez que esté activo.

App local para Windows con Node.js 22 o superior. Interfaz en español para descargar un video por enlace de YouTube, TikTok, Instagram o Facebook usando yt-dlp y FFmpeg.

## Abrir

Desde la web publicada, si el servidor de descargas no está disponible, abre `iniciar.cmd` y pulsa **Abrir Dressapp en este equipo** en la página. Dressapp local recibe el enlace, formato y calidad. Los archivos se guardan en `downloads/` y el botón **Guardar MP4** o **Guardar MP3** permite descargarlos desde el navegador.

Las dependencias ya están instaladas en este equipo. Haz doble clic en **iniciar.cmd** y abre http://localhost:3847. Mantén la ventana del servidor abierta mientras descargas. Los archivos quedan en `downloads/`; el botón **Guardar video** permite guardarlos también desde el navegador. El historial en pantalla dura hasta que cierres o recargues la página; los archivos permanecen en disco.

Para instalar en otro equipo: instala Node.js y ejecuta `powershell -ExecutionPolicy Bypass -File instalar.ps1` desde esta carpeta. Este comando descarga el ejecutable oficial de yt-dlp e instala FFmpeg. Para actualizar el motor, vuelve a ejecutar el instalador.

## Alcance real

- Selección de mejor calidad o hasta 720p, audio incluido, combinación de pistas con FFmpeg, estado de descarga y errores visibles.
- Usa las fuentes ofrecidas por cada plataforma. Puede obtener videos sin marca cuando la fuente está disponible; no borra ni reconstruye marcas incrustadas y no garantiza una fuente sin marca.
- No todos los videos son descargables: puede haber autenticación, contenido privado, restricciones regionales, bloqueos o cambios en las plataformas. No se incluyen cookies ni credenciales. No admite listas, directos indefinidos ni elusión de DRM.
- Solo escucha en 127.0.0.1; no se diseñó para exponerlo públicamente. Dos descargas concurrentes, límite de 15 minutos por tarea. No hay limpieza automática de los archivos descargados.
- Descarga contenido propio o con autorización.

## Validación

Ejecuta `node --test test.mjs`. Comprueba URLs de las cuatro plataformas, rechazo de destinos externos, recursos de la interfaz, errores de la API y descarga real de un MP4 generado con audio mediante yt-dlp desde un servidor de prueba local. Este último caso valida el motor y la integridad del archivo, no los extractores de las redes sociales.

Documentación del motor: https://github.com/yt-dlp/yt-dlp

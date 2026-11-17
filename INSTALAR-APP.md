# Instalar Dressapp

Dressapp incluye una versión web instalable (PWA). Tiene icono propio, ventana independiente, diseño móvil y acceso offline a la interfaz. No es un APK ni un IPA y no incluye el motor yt-dlp dentro del teléfono.

## En esta computadora, sin pagar

1. Abre `iniciar.cmd` y entra en http://localhost:3847 con Chrome o Edge.
2. Pulsa **Instalar app**. Si el navegador aún no muestra el aviso, abre su menú y busca **Instalar Dressapp**.
3. Mantén el servidor abierto mientras reconoces enlaces o descargas. Cerrar la consola deja a la app sin el motor.

## Android, iPhone y iPad

Primero hace falta una dirección HTTPS del servidor, accesible desde el teléfono. No hay una URL pública desplegada en este proyecto. `localhost` desde el teléfono no apunta a tu computadora y abrir una IP local por HTTP no cumple los requisitos de instalación PWA entre dispositivos.

Con esa dirección disponible:

- **Android:** abre la dirección en Chrome y pulsa **Instalar app**, o utiliza el menú **Instalar aplicación / Añadir a pantalla de inicio**.
- **iPhone/iPad:** abre la dirección en Safari, pulsa **Compartir → Añadir a la pantalla de inicio** y confirma; activa **Abrir como app web** si aparece.
- **Windows/Linux:** usa la opción de instalar de Chrome o Edge.
- **macOS:** usa Chrome o Safari; en Safari utiliza **Archivo → Añadir al Dock**.

Los nombres y la disponibilidad de las opciones dependen del navegador y su versión. La publicación en Google Play o App Store es un proceso adicional, no realizado aquí. No se ha contratado alojamiento ni un plan de pago.

## Funcionamiento offline

La interfaz puede abrirse sin conexión después de su primera carga correcta. Reconocer enlaces, descargar y previsualizar archivos del servidor requiere conexión con ese servidor. No se almacenan los videos ni las respuestas de la API en el caché del service worker.

## Validación

`node --test pwa.test.mjs` comprueba el manifiesto, tamaños y tipos de los iconos, archivos del shell, exclusión de API y videos de la caché, y acceso offline al shell. No sustituye una prueba de instalación en un Android o iPhone físico: esa instalación no se pudo verificar en este entorno.

Referencias: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable y https://support.apple.com/guide/iphone/iphea86e5236/ios

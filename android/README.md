# Dressapp para Android

Copia `artifacts/Dressapp-Android.apk` al teléfono y abre el archivo para instalarlo. Requiere Android 10 o posterior. Pega un enlace HTTPS, elige MP4 o MP3 y toca **Descargar**. El teléfono procesa el enlace y guarda el archivo en **Descargas**. Se necesita internet para acceder a la plataforma del video.

## Compilar

Con JDK 17, SDK de Android 35 y Build Tools 34.0.0, ejecuta `.\gradlew.bat assembleDebug` desde esta carpeta. El APK de pruebas queda en `app/build/outputs/apk/debug/app-debug.apk`.

El APK incorpora [youtubedl-android 0.18.1](https://github.com/yausername/youtubedl-android/tree/0.18.1), con yt-dlp, QuickJS y FFmpeg.

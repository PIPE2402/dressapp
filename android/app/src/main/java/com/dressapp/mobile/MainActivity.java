package com.dressapp.mobile;

import android.app.Activity;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ClipboardManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.Collections;
import org.json.JSONObject;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import kotlin.Unit;

public class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static final String UI_HOST = "dressapp.local";
    private static String assetType(String path) {
        if (path == null) return null;
        switch (path) {
            case "/index.html": return "text/html";
            case "/style.css":
            case "/effects.css":
            case "/refined.css":
            case "/mobile.css": return "text/css";
            case "/controls.js":
            case "/native.js": return "text/javascript";
            case "/icon-192.png": return "image/png";
            default: return null;
        }
    }

    private WebView page;
    private boolean busy;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff02080e);
        getWindow().setNavigationBarColor(0xff02080e);
        page = new WebView(this);
        page.setBackgroundColor(0xff02080e);
        page.getSettings().setJavaScriptEnabled(true);
        page.getSettings().setAllowFileAccess(false);
        page.getSettings().setAllowContentAccess(false);
        page.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                String type = assetType(path);
                if ("https".equals(uri.getScheme()) && UI_HOST.equals(uri.getHost()) && type != null
                        && "GET".equals(request.getMethod())) {
                    try {
                        return new WebResourceResponse(type, "UTF-8", 200, "OK", Collections.singletonMap(
                                "Content-Security-Policy", "default-src 'none'; script-src 'self'; "
                                        + "style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'"
                        ), getAssets().open(path.substring(1)));
                    } catch (IOException error) {
                        android.util.Log.w("Dressapp", "Error al abrir la interfaz", error);
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, null);
            }
        });
        page.addJavascriptInterface(new NativeActions(), "DressappAndroid");
        setContentView(page);
        page.loadUrl("https://" + UI_HOST + "/index.html");
    }

    public final class NativeActions {
        @JavascriptInterface
        public String clipboardText() {
            ClipboardManager clipboard = getSystemService(ClipboardManager.class);
            android.content.ClipData clip = clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).getText();
            return text == null ? "" : text.toString();
        }

        @JavascriptInterface
        public void download(String url, String format, String quality) {
            runOnUiThread(() -> startDownload(url, format, quality));
        }
    }

    private void startDownload(String url, String format, String quality) {
        if (busy || isDestroyed()) return;
        if (url == null || !supported(url)) {
            updatePage("failed", "Pega un enlace HTTPS de YouTube, TikTok, Instagram o Facebook.", 0);
            return;
        }
        boolean audio = "mp3".equals(format);
        boolean limit720 = "720".equals(quality);
        busy = true;
        worker.execute(() -> {
            try {
                String name = downloadVideo(url, audio, limit720);
                runOnUiThread(() -> finishDownload("done", "Guardado en Descargas: " + name));
            } catch (Exception error) {
                android.util.Log.w("Dressapp", "Error de descarga", error);
                runOnUiThread(() -> finishDownload("failed",
                        "No se pudo descargar. Revisa tu conexión y que el video sea público."));
            }
        });
    }

    private void updatePage(String state, String message, int percent) {
        if (isDestroyed()) return;
        page.evaluateJavascript("window.updateDownload(" + JSONObject.quote(state) + ","
                + JSONObject.quote(message) + "," + percent + ")", null);
    }

    private boolean supported(String url) {
        try {
            URI link = URI.create(url);
            if (!"https".equalsIgnoreCase(link.getScheme()) || link.getHost() == null
                    || link.getRawUserInfo() != null || (link.getPort() != -1 && link.getPort() != 443)) return false;
            String host = link.getHost().toLowerCase(Locale.ROOT);
            return host.matches("(?:[a-z0-9-]+\\.)*(?:youtube\\.com|youtu\\.be|tiktok\\.com|instagram\\.com|facebook\\.com|fb\\.watch)");
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    private String downloadVideo(String url, boolean audio, boolean limit720) throws Exception {
        YoutubeDL.INSTANCE.init(getApplicationContext());
        FFmpeg.INSTANCE.init(getApplicationContext());
        prepareFfmpegRuntime();
        File folder = Files.createTempDirectory(getCacheDir().toPath(), "dressapp-").toFile();
        try {
            YoutubeDLRequest request = new YoutubeDLRequest(url)
                    .addOption("--no-playlist")
                    .addOption("--match-filters", "!is_live")
                    .addOption("--socket-timeout", 25)
                    .addOption("--retries", 2)
                    .addOption("--restrict-filenames")
                    .addOption("-o", new File(folder, "%(title).100B-%(id)s.%(ext)s").getAbsolutePath());
            if (audio) {
                request.addOption("-f", "ba/b")
                        .addOption("--extract-audio")
                        .addOption("--audio-format", "mp3")
                        .addOption("--audio-quality", "192K");
            } else {
                String height = limit720 ? "[height<=720]" : "";
                request.addOption("-f", "bv[ext=mp4]" + height + "+ba[ext=m4a]/b[ext=mp4]" + height
                                + "/bv" + height + "+ba/b" + height)
                        .addOption("--merge-output-format", "mp4")
                        .addOption("--recode-video", "mp4");
            }
            YoutubeDL.INSTANCE.execute(request, UUID.randomUUID().toString(), (percent, eta, line) -> {
                if (percent >= 0) runOnUiThread(() -> {
                    updatePage("working", percent >= 100 ? "Preparando el archivo…" : "Descargando…",
                            Math.round(percent));
                });
                return Unit.INSTANCE;
            });
            String extension = audio ? ".mp3" : ".mp4";
            File[] results = folder.listFiles(file -> file.isFile() && file.getName().endsWith(extension));
            if (results == null || results.length != 1) throw new IOException("Archivo de salida inesperado");
            return publish(results[0], audio ? "audio/mpeg" : "video/mp4");
        } finally {
            File[] files = folder.listFiles();
            if (files != null) for (File file : files) file.delete();
            folder.delete();
        }
    }

    private void prepareFfmpegRuntime() throws IOException {
        // The upstream FFmpeg payload needs this library in its subprocess search path.
        File bundled = new File(getApplicationInfo().nativeLibraryDir, "libc++_shared.so");
        File runtime = new File(getNoBackupFilesDir(), "youtubedl-android/packages/ffmpeg/usr/lib/libc++_shared.so");
        if (!runtime.isFile() || runtime.length() != bundled.length()) {
            Files.copy(bundled.toPath(), runtime.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private String publish(File file, String mime) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, file.getName());
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (item == null) throw new IOException("No se pudo crear el archivo");
        boolean published = false;
        try {
            try (OutputStream stream = getContentResolver().openOutputStream(item)) {
                if (stream == null) throw new IOException("No se pudo abrir el archivo");
                Files.copy(file.toPath(), stream);
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (getContentResolver().update(item, values, null, null) != 1) {
                throw new IOException("No se pudo publicar el archivo");
            }
            published = true;
            try (android.database.Cursor cursor = getContentResolver().query(item,
                    new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
            }
            return file.getName();
        } finally {
            if (!published) getContentResolver().delete(item, null, null);
        }
    }

    private void finishDownload(String state, String message) {
        busy = false;
        updatePage(state, message, 100);
    }

    @Override
    protected void onDestroy() {
        worker.shutdown();
        page.destroy();
        super.onDestroy();
    }
}

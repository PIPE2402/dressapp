import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

import imageio_ffmpeg
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI()
HOST = re.compile(r"(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)")
MAX_BYTES = 64 * 1024 * 1024


class DownloadRequest(BaseModel):
    url: str = Field(max_length=2048)
    format: str = "mp4"
    quality: str = "best"


def supported(url):
    try:
        link = urlsplit(url)
        return (link.scheme == "https" and link.username is None and link.port in (None, 443)
                and HOST.fullmatch(link.hostname or ""))
    except ValueError:
        return False


@app.post("/api/download")
def download(request: DownloadRequest):
    if not supported(request.url) or request.format not in ("mp4", "mp3"):
        raise HTTPException(400, "Usa un enlace HTTPS compatible y elige MP4 o MP3.")

    folder = TemporaryDirectory(prefix="dressapp-")
    work = Path(folder.name)
    try:
        ffmpeg = work / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        ffmpeg.symlink_to(Path(imageio_ffmpeg.get_ffmpeg_exe()).resolve())
        command = [
            sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist",
            "--match-filters", "!is_live", "--socket-timeout", "12", "--retries", "1",
            "--extractor-retries", "0", "--max-filesize", str(MAX_BYTES),
            "--ffmpeg-location", str(ffmpeg), "--no-progress", "-o", str(work / "video.%(ext)s"),
        ]
        if request.format == "mp3":
            command += ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "192K"]
        else:
            height = "[height<=?720]" if request.quality == "720" else ""
            command += ["-f", f"b[ext=mp4]{height}/bv*{height}+ba/b{height}",
                        "--merge-output-format", "mp4", "--recode-video", "mp4"]

        env = {**os.environ, "PYTHONPATH": os.pathsep.join(sys.path)}
        subprocess.run([*command, "--", request.url], check=True, capture_output=True, timeout=90, env=env)
        media = work / f"video.{request.format}"
        if not media.is_file() or not 0 < media.stat().st_size <= MAX_BYTES:
            raise HTTPException(422, "El archivo supera el límite de 64 MB o no está disponible.")
    except HTTPException:
        folder.cleanup()
        raise
    except subprocess.CalledProcessError as error:
        folder.cleanup()
        detail = (error.stderr or b"").decode("utf-8", errors="replace")
        logging.warning("Dressapp extractor failed: %s", detail[-1500:])
        if "No module named" in detail:
            raise HTTPException(503, "El motor de descarga no se pudo iniciar.") from error
        if re.search(r"HTTP Error (?:403|429)|blocked|captcha|impersonation", detail, re.I):
            raise HTTPException(422, "La plataforma rechazó la descarga desde el servidor.") from error
        if re.search(r"ffmpeg|ffprobe", detail, re.I):
            raise HTTPException(422, "El servidor no pudo convertir el archivo al formato elegido.") from error
        raise HTTPException(422, "La plataforma no entregó el archivo. Comprueba que el video sea público e inténtalo de nuevo.") from error
    except (subprocess.TimeoutExpired, OSError) as error:
        folder.cleanup()
        logging.warning("Dressapp download failed: %s", type(error).__name__)
        raise HTTPException(503, "El servidor no pudo preparar el archivo. Inténtalo otra vez.") from error

    def chunks():
        try:
            with media.open("rb") as stream:
                while block := stream.read(256 * 1024):
                    yield block
        finally:
            folder.cleanup()

    content_type = "audio/mpeg" if request.format == "mp3" else "video/mp4"
    return StreamingResponse(chunks(), media_type=content_type, headers={
        "Content-Disposition": f'attachment; filename="Dressapp.{request.format}"',
        "Cache-Control": "no-store",
    })

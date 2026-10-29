import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

from media_worker.errors import DurationExceededError, InvalidRequestError, SourceUnavailableError, TransientMediaError
from media_worker.ffmpeg_media import duration_ms_from_probe, probe_media
from media_worker.process_runner import run_command


def yt_dlp_command() -> list[str]:
    if importlib.util.find_spec("yt_dlp") is None:
        raise TransientMediaError("yt-dlp nao encontrado no ambiente")
    return [sys.executable, "-m", "yt_dlp"]


def acquire_local_file(source_path: Path, destination: Path) -> dict:
    if not source_path.is_file():
        raise SourceUnavailableError("Arquivo local autorizado nao encontrado")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_path, destination)
    return {"sourceKind": "local_file", "mediaPath": str(destination), "title": source_path.stem}


def acquire_youtube(canonical_url: str, destination: Path, timeout_seconds: int, max_duration_seconds: int) -> dict:
    if not re.fullmatch(r"https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}", canonical_url):
        raise InvalidRequestError("A URL recebida pelo adaptador nao e a URL canonica do video")
    yt_dlp_invocation = yt_dlp_command()
    metadata_result = run_command(
        [
            *yt_dlp_invocation,
            "--no-playlist",
            "--no-warnings",
            "--skip-download",
            "--dump-single-json",
            canonical_url,
        ],
        timeout_seconds=min(timeout_seconds, 120),
    )
    if metadata_result.returncode != 0:
        raise SourceUnavailableError("Nao foi possivel obter os metadados do video")
    try:
        metadata = json.loads(metadata_result.stdout)
    except json.JSONDecodeError as error:
        raise SourceUnavailableError("Metadados do video invalidos") from error
    duration_seconds = metadata.get("duration")
    if isinstance(duration_seconds, (int, float)) and duration_seconds > max_duration_seconds:
        raise DurationExceededError(
            f"O video dura mais do que o limite de {max_duration_seconds} segundos"
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    download_result = run_command(
        [
            *yt_dlp_invocation,
            "--no-playlist",
            "--no-warnings",
            "--restrict-filenames",
            "-f",
            "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b",
            "-o",
            str(destination),
            canonical_url,
        ],
        timeout_seconds=timeout_seconds,
    )
    if download_result.returncode != 0 or not destination.exists():
        raise SourceUnavailableError("Nao foi possivel obter a midia do video")
    return {
        "sourceKind": "youtube",
        "mediaPath": str(destination),
        "title": metadata.get("title") if isinstance(metadata.get("title"), str) else None,
        "durationMs": int(duration_seconds * 1000) if isinstance(duration_seconds, (int, float)) else None,
        "sourceVideoId": metadata.get("id") if isinstance(metadata.get("id"), str) else None,
    }


def read_duration_ms(media_path: Path, timeout_seconds: int) -> int:
    return duration_ms_from_probe(probe_media(media_path, timeout_seconds))

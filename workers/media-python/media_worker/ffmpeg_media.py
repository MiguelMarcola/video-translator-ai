import json
import shutil
from pathlib import Path

from media_worker.errors import DurationExceededError, TransientMediaError
from media_worker.process_runner import run_command


def resolve_ffmpeg(binary_name: str) -> str:
    resolved = shutil.which(binary_name)
    if not resolved:
        raise TransientMediaError(f"{binary_name} nao encontrado no ambiente")
    return resolved


def probe_media(media_path: Path, timeout_seconds: int) -> dict:
    ffprobe = resolve_ffmpeg("ffprobe")
    completed = run_command(
        [
            ffprobe,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(media_path),
        ],
        timeout_seconds=min(timeout_seconds, 60),
    )
    if completed.returncode != 0:
        raise TransientMediaError("ffprobe nao conseguiu inspecionar a midia")
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise TransientMediaError("Resposta do ffprobe invalida") from error


def duration_ms_from_probe(probe: dict) -> int:
    format_info = probe.get("format") or {}
    duration_text = format_info.get("duration")
    if duration_text is None:
        for stream in probe.get("streams") or []:
            if stream.get("duration"):
                duration_text = stream["duration"]
                break
    if duration_text is None:
        raise TransientMediaError("Duracao da midia indisponivel")
    return int(round(float(duration_text) * 1000))


def assert_duration_within_limit(duration_ms: int, max_duration_seconds: int) -> None:
    if duration_ms > max_duration_seconds * 1000:
        raise DurationExceededError(
            f"O video dura mais do que o limite de {max_duration_seconds} segundos"
        )


def prepare_media(
    source_path: Path,
    playback_path: Path,
    audio_path: Path,
    timeout_seconds: int,
) -> dict:
    ffmpeg = resolve_ffmpeg("ffmpeg")
    playback_path.parent.mkdir(parents=True, exist_ok=True)
    playback_command = [
        ffmpeg,
        "-y",
        "-i",
        str(source_path),
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        str(playback_path),
    ]
    playback_result = run_command(playback_command, timeout_seconds=timeout_seconds)
    if playback_result.returncode != 0:
        raise TransientMediaError("Falha ao preparar o MP4 de reproducao")
    audio_command = [
        ffmpeg,
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(audio_path),
    ]
    audio_result = run_command(audio_command, timeout_seconds=timeout_seconds)
    if audio_result.returncode != 0:
        raise TransientMediaError("Falha ao extrair o audio para transcricao")
    return probe_media(playback_path, timeout_seconds)


def render_burned_subtitles(
    playback_path: Path,
    subtitles_path: Path,
    fonts_directory: Path,
    destination: Path,
    timeout_seconds: int,
) -> None:
    ffmpeg = resolve_ffmpeg("ffmpeg")
    destination.parent.mkdir(parents=True, exist_ok=True)
    subtitles_filter = f"ass={subtitles_path.name}:fontsdir={fonts_directory.name}"
    completed = run_command(
        [
            ffmpeg,
            "-y",
            "-i",
            playback_path.name,
            "-vf",
            subtitles_filter,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            destination.name,
        ],
        timeout_seconds=timeout_seconds,
        cwd=playback_path.parent,
    )
    if completed.returncode != 0:
        raise TransientMediaError("Falha ao gravar legendas no MP4")

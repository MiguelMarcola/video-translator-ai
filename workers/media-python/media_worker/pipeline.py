import json
import platform
import resource
import shutil
import time
from pathlib import Path
from typing import Any

from media_worker.acquire import acquire_local_file, acquire_youtube
from media_worker.contract import assert_inside_directory
from media_worker.errors import InvalidRequestError, MediaWorkerError
from media_worker.ffmpeg_media import assert_duration_within_limit, duration_ms_from_probe, prepare_media, probe_media, render_burned_subtitles
from media_worker.progress import emit_log, emit_progress
from media_worker.subtitles import write_ass, write_srt, write_webvtt
from media_worker.transcribe import transcribe_audio
from media_worker.translate import install_language_pair, translate_segment_file


def execute_command(request: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    command = request["command"]
    work_directory = Path(request["workDirectory"]).resolve()
    cache_directory = Path(request["cacheDirectory"]).resolve()
    work_directory.mkdir(parents=True, exist_ok=True)
    cache_directory.mkdir(parents=True, exist_ok=True)
    _raise_if_cancelled(request)
    try:
        if command == "acquire":
            result = _acquire(request, work_directory)
        elif command == "prepare":
            result = _prepare(request, work_directory)
        elif command == "transcribe":
            result = _transcribe(request, work_directory, cache_directory)
        elif command == "translate":
            result = _translate(request, work_directory, cache_directory)
        elif command == "write_subtitles":
            result = _write_subtitles(request, work_directory)
        elif command == "render":
            result = _render(request, work_directory)
        else:
            raise InvalidRequestError("Comando nao permitido")
    except MediaWorkerError:
        raise
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    result["contractVersion"] = request["contractVersion"]
    result["command"] = command
    result["status"] = "succeeded"
    result["metadata"] = {
        **result.get("metadata", {}),
        "stageDurationMs": elapsed_ms,
        "maxRssKb": _max_rss_kb(),
        "platform": platform.platform(),
        "python": platform.python_version(),
    }
    emit_log("info", f"Etapa {command} concluida em {elapsed_ms} ms")
    return result


def install_models(cache_directory: Path, whisper_model: str) -> None:
    emit_progress("install_models", "Preparando cache de modelos")
    install_language_pair(cache_directory / "argos", "en", "pb")
    from faster_whisper import WhisperModel

    WhisperModel(whisper_model, device="cpu", compute_type="int8", download_root=str(cache_directory / "whisper"))
    emit_progress("install_models", "Modelos disponiveis no cache")


def _acquire(request: dict[str, Any], work_directory: Path) -> dict[str, Any]:
    emit_progress("acquire", "Obtendo a midia")
    inputs = request["inputs"]
    destination = work_directory / "source.mp4"
    parameters = request["parameters"]
    timeout_seconds = int(parameters.get("timeoutSeconds") or 1200)
    if inputs.get("youtubeUrl"):
        acquired = acquire_youtube(
            inputs["youtubeUrl"],
            destination,
            timeout_seconds,
            int(parameters.get("maxDurationSeconds") or 1800),
        )
    else:
        source = assert_inside_directory(work_directory, Path(inputs["mediaPath"]))
        acquired = acquire_local_file(source, destination)
    return {
        "artifacts": [_artifact("source_media", destination, "video/mp4")],
        "metadata": acquired,
    }


def _prepare(request: dict[str, Any], work_directory: Path) -> dict[str, Any]:
    emit_progress("prepare", "Preparando audio e video")
    source = assert_inside_directory(work_directory, Path(request["inputs"]["mediaPath"]))
    playback_path = work_directory / "playback.mp4"
    audio_path = work_directory / "audio.wav"
    timeout_seconds = int(request["parameters"].get("timeoutSeconds") or 1200)
    probe = probe_media(source, timeout_seconds)
    duration_ms = duration_ms_from_probe(probe)
    assert_duration_within_limit(duration_ms, int(request["parameters"].get("maxDurationSeconds") or 1800))
    prepare_media(source, playback_path, audio_path, timeout_seconds)
    return {
        "artifacts": [
            _artifact("playback_mp4", playback_path, "video/mp4"),
            _artifact("audio_wav", audio_path, "audio/wav"),
        ],
        "metadata": {"durationMs": duration_ms},
    }


def _transcribe(request: dict[str, Any], work_directory: Path, cache_directory: Path) -> dict[str, Any]:
    emit_progress("transcribe", "Transcrevendo o audio")
    _raise_if_cancelled(request)
    audio_path = assert_inside_directory(work_directory, Path(request["inputs"]["mediaPath"]))
    parameters = request["parameters"]
    transcription = transcribe_audio(
        audio_path,
        cache_directory / "whisper",
        str(parameters.get("whisperModel") or "base"),
        int(parameters.get("whisperBeamSize") or 5),
    )
    segments_path = work_directory / "segments.json"
    segments_path.write_text(
        json.dumps(
            {
                "detectedLanguage": transcription["detectedLanguage"],
                "languageProbability": transcription["languageProbability"],
                "segments": transcription["segments"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return {
        "artifacts": [_artifact("transcript_json", segments_path, "application/json")],
        "segments": transcription["segments"],
        "metadata": {
            "detectedLanguage": transcription["detectedLanguage"],
            "languageProbability": transcription["languageProbability"],
            "durationMs": transcription["durationMs"],
            "whisperModel": transcription["whisperModel"],
            "device": transcription["device"],
            "computeType": transcription["computeType"],
            "segmentCount": len(transcription["segments"]),
        },
    }


def _translate(request: dict[str, Any], work_directory: Path, cache_directory: Path) -> dict[str, Any]:
    emit_progress("translate", "Traduzindo os segmentos")
    _raise_if_cancelled(request)
    segments_path = assert_inside_directory(work_directory, Path(request["inputs"]["segmentsPath"]))
    document = json.loads(segments_path.read_text(encoding="utf-8"))
    translated = translate_segment_file(
        document["segments"],
        document.get("detectedLanguage") or request.get("sourceLanguage"),
        request["targetLanguage"],
        cache_directory / "argos",
    )
    document["segments"] = translated["segments"]
    document["translation"] = {
        "applied": translated["translationApplied"],
        "packageCode": translated.get("packageCode"),
        "sourceCode": translated.get("sourceCode"),
        "targetCode": translated.get("targetCode"),
    }
    segments_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "artifacts": [_artifact("transcript_json", segments_path, "application/json")],
        "segments": translated["segments"],
        "metadata": {
            "translationApplied": translated["translationApplied"],
            "packageCode": translated.get("packageCode"),
        },
    }


def _write_subtitles(request: dict[str, Any], work_directory: Path) -> dict[str, Any]:
    emit_progress("write_subtitles", "Gerando VTT, SRT e ASS")
    segments_path = assert_inside_directory(work_directory, Path(request["inputs"]["segmentsPath"]))
    document = json.loads(segments_path.read_text(encoding="utf-8"))
    segments = document["segments"]
    font_family = str(request["parameters"].get("fontFamily") or "Arial")
    vtt_path = work_directory / "subtitles.vtt"
    srt_path = work_directory / "subtitles.srt"
    ass_path = work_directory / "subtitles.ass"
    write_webvtt(segments, vtt_path)
    write_srt(segments, srt_path)
    write_ass(segments, ass_path, font_family)
    _assert_sample_points(segments, vtt_path)
    return {
        "artifacts": [
            _artifact("subtitles_vtt", vtt_path, "text/vtt"),
            _artifact("subtitles_srt", srt_path, "application/x-subrip"),
            _artifact("subtitles_ass", ass_path, "text/x-ssa"),
        ],
        "metadata": {"segmentCount": len(segments)},
    }


def _render(request: dict[str, Any], work_directory: Path) -> dict[str, Any]:
    emit_progress("render", "Gravando legendas no video")
    playback_path = assert_inside_directory(work_directory, Path(request["inputs"]["mediaPath"]))
    subtitles_path = assert_inside_directory(work_directory, Path(request["inputs"]["subtitlesAssPath"]))
    font_file = request["parameters"].get("fontFile")
    fonts_directory = work_directory / "fonts"
    fonts_directory.mkdir(parents=True, exist_ok=True)
    if isinstance(font_file, str) and Path(font_file).is_file():
        shutil.copyfile(font_file, fonts_directory / Path(font_file).name)
    burned_path = work_directory / "burned.mp4"
    render_burned_subtitles(
        playback_path,
        subtitles_path,
        fonts_directory,
        burned_path,
        int(request["parameters"].get("timeoutSeconds") or 1200),
    )
    return {
        "artifacts": [_artifact("burned_mp4", burned_path, "video/mp4")],
        "metadata": {},
    }


def _assert_sample_points(segments: list[dict], vtt_path: Path) -> None:
    if len(segments) < 1:
        return
    content = vtt_path.read_text(encoding="utf-8")
    for segment in (segments[0], segments[len(segments) // 2], segments[-1]):
        if str(segment["id"]) not in content:
            raise InvalidRequestError("Legenda nao preservou um ponto de sincronizacao")


def _artifact(kind: str, path: Path, content_type: str) -> dict[str, Any]:
    return {
        "kind": kind,
        "path": str(path),
        "contentType": content_type,
        "byteSize": path.stat().st_size,
    }


def _raise_if_cancelled(request: dict[str, Any]) -> None:
    cancel_file = request.get("cancelFile")
    if isinstance(cancel_file, str) and cancel_file and Path(cancel_file).exists():
        from media_worker.errors import CancelledError

        raise CancelledError()


def _max_rss_kb() -> int:
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if platform.system() == "Darwin":
        return int(usage / 1024)
    return int(usage)

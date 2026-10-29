import json
import sys
from pathlib import Path

import pytest

from media_worker.acquire import yt_dlp_command
from media_worker.contract import validate_request
from media_worker.errors import InvalidRequestError
from media_worker.segment_groups import distribute_translated_text, translate_segments
from media_worker.subtitles import format_srt_timestamp, format_vtt_timestamp, wrap_subtitle_text, write_srt, write_webvtt


def test_wrap_preserves_accents_and_limits_lines() -> None:
    wrapped = wrap_subtitle_text(
        "A tradução local preserva ação, coração e não altera o áudio original do vídeo.",
        max_characters_per_line=32,
        max_lines=2,
    )
    assert "ação" in wrapped
    assert "não" in wrapped
    assert "coração" in wrapped
    assert len(wrapped.split("\n")) == 2


def test_timestamps_cover_start_middle_and_end(tmp_path: Path) -> None:
    segments = [
        {"id": "seg-0000", "startMs": 0, "endMs": 1500, "translatedText": "Início com ação."},
        {"id": "seg-0001", "startMs": 10_000, "endMs": 11_200, "translatedText": "Meio da explicação."},
        {"id": "seg-0002", "startMs": 20_000, "endMs": 21_500, "translatedText": "Fim do vídeo."},
    ]
    vtt_path = tmp_path / "subtitles.vtt"
    srt_path = tmp_path / "subtitles.srt"
    write_webvtt(segments, vtt_path)
    write_srt(segments, srt_path)
    vtt = vtt_path.read_text(encoding="utf-8")
    srt = srt_path.read_text(encoding="utf-8")
    assert vtt.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:01.500" in vtt
    assert "00:00:10.000 --> 00:00:11.200" in vtt
    assert "00:00:20.000 --> 00:00:21.500" in vtt
    assert "ação" in vtt
    assert format_srt_timestamp(20_000) in srt
    assert "00:00:20,000 --> 00:00:21,500" in srt
    assert format_vtt_timestamp(0) == "00:00:00.000"


def test_translation_preserves_ids_and_timestamps() -> None:
    segments = [
        {"id": "seg-0000", "startMs": 0, "endMs": 1000, "text": "Hello there."},
        {"id": "seg-0001", "startMs": 1000, "endMs": 2200, "text": "This is a short authorized sample."},
    ]

    def fake_translate(text: str) -> str:
        return text.replace("Hello there.", "Olá.").replace(
            "This is a short authorized sample.",
            "Esta é uma amostra curta autorizada.",
        )

    translated = translate_segments(segments, fake_translate)
    assert [segment["id"] for segment in translated] == ["seg-0000", "seg-0001"]
    assert [segment["startMs"] for segment in translated] == [0, 1000]
    assert [segment["endMs"] for segment in translated] == [1000, 2200]
    assert translated[0]["text"] == "Hello there."
    assert "Olá" in translated[0]["translatedText"]
    assert "amostra" in translated[1]["translatedText"]


def test_distribution_keeps_every_word() -> None:
    group = [
        {"id": "seg-0000", "startMs": 0, "endMs": 1000, "text": "one two"},
        {"id": "seg-0001", "startMs": 1000, "endMs": 2000, "text": "three four five"},
    ]
    distributed = distribute_translated_text(group, "um dois três quatro cinco")
    assert " ".join(distributed.values()).split() == ["um", "dois", "três", "quatro", "cinco"]


def test_contract_rejects_relative_paths_and_unknown_commands(tmp_path: Path) -> None:
    payload = {
        "contractVersion": "1.0.0",
        "command": "transcribe",
        "jobId": "job",
        "videoId": "video",
        "workDirectory": str(tmp_path),
        "cacheDirectory": str(tmp_path / "cache"),
        "targetLanguage": "pt-BR",
        "inputs": {"mediaPath": "relative.wav"},
        "parameters": {},
    }
    with pytest.raises(InvalidRequestError):
        validate_request(payload)
    payload["command"] = "shell"
    payload["inputs"]["mediaPath"] = str(tmp_path / "audio.wav")
    with pytest.raises(InvalidRequestError):
        validate_request(payload)


def test_contract_rejects_path_outside_work_directory(tmp_path: Path) -> None:
    outside = tmp_path.parent / "outside.wav"
    payload = {
        "contractVersion": "1.0.0",
        "command": "transcribe",
        "jobId": "job",
        "videoId": "video",
        "workDirectory": str(tmp_path / "work"),
        "cacheDirectory": str(tmp_path / "cache"),
        "targetLanguage": "pt-BR",
        "inputs": {"mediaPath": str(outside)},
        "parameters": {},
    }
    (tmp_path / "work").mkdir()
    with pytest.raises(InvalidRequestError):
        validate_request(payload)


def test_yt_dlp_runs_with_the_current_interpreter() -> None:
    command = yt_dlp_command()
    assert command[:2] == [sys.executable, "-m"]
    assert command[2] == "yt_dlp"


def test_process_runner_keeps_arguments_separate() -> None:
    runner = (Path(__file__).parents[1] / "media_worker" / "process_runner.py").read_text(encoding="utf-8")
    acquire = (Path(__file__).parents[1] / "media_worker" / "acquire.py").read_text(encoding="utf-8")
    assert "shell=False" in runner
    assert "shell=True" not in runner
    assert "shell=True" not in acquire
    assert "os.system" not in runner
    assert "os.system" not in acquire

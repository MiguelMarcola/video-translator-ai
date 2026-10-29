import wave
from pathlib import Path

import numpy as np

from media_worker.errors import NoSpeechError, TransientMediaError


def load_prepared_wav(audio_path: Path) -> np.ndarray:
    with wave.open(str(audio_path), "rb") as wav_file:
        channel_count = wav_file.getnchannels()
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        frame_bytes = wav_file.readframes(wav_file.getnframes())
    if channel_count != 1 or sample_rate != 16000 or sample_width != 2:
        raise TransientMediaError("O audio preparado precisa ser PCM 16 bits, mono e 16 kHz")
    return np.frombuffer(frame_bytes, dtype=np.int16).astype(np.float32) / 32768.0


def transcribe_audio(
    audio_path: Path,
    cache_directory: Path,
    model_name: str,
    beam_size: int,
) -> dict:
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise TransientMediaError("faster-whisper nao esta instalado") from error
    cache_directory.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        download_root=str(cache_directory),
    )
    segments_iterator, info = model.transcribe(
        load_prepared_wav(audio_path),
        beam_size=beam_size,
        vad_filter=True,
        condition_on_previous_text=True,
    )
    segments: list[dict] = []
    for index, segment in enumerate(segments_iterator):
        text = " ".join(segment.text.split())
        start_ms = int(round(segment.start * 1000))
        end_ms = int(round(segment.end * 1000))
        if not text or end_ms <= start_ms:
            continue
        segments.append(
            {
                "id": f"seg-{index:04d}",
                "startMs": start_ms,
                "endMs": end_ms,
                "text": text,
            }
        )
    if not segments:
        raise NoSpeechError("Nao ha fala suficiente para gerar legendas, resumo e chat")
    return {
        "detectedLanguage": info.language,
        "languageProbability": float(info.language_probability),
        "durationMs": int(round(float(info.duration) * 1000)),
        "whisperModel": model_name,
        "device": "cpu",
        "computeType": "int8",
        "segments": segments,
    }

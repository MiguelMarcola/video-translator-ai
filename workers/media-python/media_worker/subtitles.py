from pathlib import Path


def wrap_subtitle_text(text: str, max_characters_per_line: int = 42, max_lines: int = 2) -> str:
    normalized = " ".join(text.replace("\n", " ").split())
    if not normalized:
        return ""
    words = normalized.split(" ")
    lines: list[str] = []
    current_line = ""
    for word in words:
        candidate = word if not current_line else f"{current_line} {word}"
        if len(candidate) <= max_characters_per_line or not current_line:
            current_line = candidate
            continue
        lines.append(current_line)
        current_line = word
    if current_line:
        lines.append(current_line)
    if len(lines) <= max_lines:
        return "\n".join(lines)
    merged = lines[: max_lines - 1]
    merged.append(" ".join(lines[max_lines - 1 :]))
    return "\n".join(merged)


def format_vtt_timestamp(time_ms: int) -> str:
    return _format_timestamp(time_ms, separator=".")


def format_srt_timestamp(time_ms: int) -> str:
    return _format_timestamp(time_ms, separator=",")


def format_ass_timestamp(time_ms: int) -> str:
    bounded = max(0, time_ms)
    hours, remainder = divmod(bounded, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    centiseconds = milliseconds // 10
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def _format_timestamp(time_ms: int, separator: str) -> str:
    bounded = max(0, time_ms)
    hours, remainder = divmod(bounded, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{separator}{milliseconds:03d}"


def _escape_subtitle_text(text: str) -> str:
    return text.replace("-->", "→")


def write_webvtt(segments: list[dict], destination: Path) -> None:
    blocks = ["WEBVTT", ""]
    for segment in segments:
        text = wrap_subtitle_text(str(segment.get("translatedText") or segment.get("text") or ""))
        if not text:
            continue
        blocks.append(str(segment["id"]))
        blocks.append(
            f"{format_vtt_timestamp(int(segment['startMs']))} --> {format_vtt_timestamp(int(segment['endMs']))}"
        )
        blocks.append(_escape_subtitle_text(text))
        blocks.append("")
    destination.write_text("\n".join(blocks), encoding="utf-8")


def write_srt(segments: list[dict], destination: Path) -> None:
    blocks: list[str] = []
    cue_number = 1
    for segment in segments:
        text = wrap_subtitle_text(str(segment.get("translatedText") or segment.get("text") or ""))
        if not text:
            continue
        blocks.append(str(cue_number))
        blocks.append(
            f"{format_srt_timestamp(int(segment['startMs']))} --> {format_srt_timestamp(int(segment['endMs']))}"
        )
        blocks.append(_escape_subtitle_text(text))
        blocks.append("")
        cue_number += 1
    destination.write_text("\n".join(blocks), encoding="utf-8")


def write_ass(segments: list[dict], destination: Path, font_family: str) -> None:
    header = "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            "WrapStyle: 0",
            "ScaledBorderAndShadow: yes",
            "YCbCr Matrix: TV.709",
            "PlayResX: 1280",
            "PlayResY: 720",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            f"Style: Default,{font_family},42,&H00FFFFFF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,3,3,0,2,40,40,36,1",
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]
    )
    events: list[str] = []
    for segment in segments:
        text = wrap_subtitle_text(str(segment.get("translatedText") or segment.get("text") or ""))
        if not text:
            continue
        escaped = _escape_subtitle_text(text).replace("\n", "\\N").replace("{", "(").replace("}", ")")
        events.append(
            "Dialogue: 0,"
            f"{format_ass_timestamp(int(segment['startMs']))},"
            f"{format_ass_timestamp(int(segment['endMs']))},"
            f"Default,,0,0,0,,{escaped}"
        )
    destination.write_text(header + "\n" + "\n".join(events) + "\n", encoding="utf-8")

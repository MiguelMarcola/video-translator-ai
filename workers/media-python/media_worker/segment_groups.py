from collections.abc import Callable


def group_segments_for_translation(segments: list[dict]) -> list[list[dict]]:
    groups: list[list[dict]] = []
    current_group: list[dict] = []
    current_characters = 0
    for segment in segments:
        text = " ".join(str(segment.get("text") or "").split())
        if not text:
            continue
        current_group.append(segment)
        current_characters += len(text)
        ends_sentence = text.endswith((".", "?", "!", "…"))
        if ends_sentence or len(current_group) >= 3 or current_characters >= 180:
            groups.append(current_group)
            current_group = []
            current_characters = 0
    if current_group:
        groups.append(current_group)
    return groups


def distribute_translated_text(group: list[dict], translated_text: str) -> dict[str, str]:
    words = translated_text.split()
    if not words:
        raise ValueError("Traducao vazia")
    if len(words) < len(group):
        longest_segment = max(group, key=lambda segment: int(segment["endMs"]) - int(segment["startMs"]))
        return {
            str(segment["id"]): translated_text if segment["id"] == longest_segment["id"] else ""
            for segment in group
        }
    weights = [max(len(str(segment.get("text") or "").split()), 1) for segment in group]
    total_weight = sum(weights)
    remaining_words = len(words)
    word_counts: list[int] = []
    for index, weight in enumerate(weights):
        segments_left = len(group) - index
        if index == len(group) - 1:
            word_counts.append(remaining_words)
            break
        share = max(1, round(len(words) * weight / total_weight))
        share = min(share, remaining_words - (segments_left - 1))
        word_counts.append(share)
        remaining_words -= share
    cursor = 0
    translations: dict[str, str] = {}
    for segment, count in zip(group, word_counts, strict=True):
        translations[str(segment["id"])] = " ".join(words[cursor : cursor + count])
        cursor += count
    return translations


def translate_segments(
    segments: list[dict],
    translate_text: Callable[[str], str],
) -> list[dict]:
    translated_by_id: dict[str, str] = {}
    for group in group_segments_for_translation(segments):
        source_text = " ".join(" ".join(str(segment.get("text") or "").split()) for segment in group)
        translated_text = " ".join(translate_text(source_text).split())
        if not translated_text:
            raise ValueError("Traducao vazia")
        translated_by_id.update(distribute_translated_text(group, translated_text))
    result: list[dict] = []
    for segment in segments:
        copied = dict(segment)
        copied["translatedText"] = translated_by_id.get(str(segment["id"]), "")
        result.append(copied)
    return result

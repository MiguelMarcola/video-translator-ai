import os
from pathlib import Path

from media_worker.errors import LanguagePairUnavailableError, TransientMediaError
from media_worker.segment_groups import translate_segments

ARGOS_TARGET_CODES = {"pt-BR": "pb"}
WHISPER_LANGUAGE_TO_ARGOS = {"en": "en", "pt": "pt", "pb": "pb"}


def configure_argos_cache(cache_directory: Path) -> None:
    cache_directory.mkdir(parents=True, exist_ok=True)
    os.environ["XDG_DATA_HOME"] = str(cache_directory)


def install_language_pair(cache_directory: Path, from_code: str, to_code: str) -> str:
    configure_argos_cache(cache_directory)
    try:
        import argostranslate.package
    except ImportError as error:
        raise TransientMediaError("Argos Translate nao esta instalado") from error
    installed_packages = argostranslate.package.get_installed_packages()
    already_installed = next(
        (package for package in installed_packages if package.from_code == from_code and package.to_code == to_code),
        None,
    )
    if already_installed is not None:
        return package_identity(already_installed)
    argostranslate.package.update_package_index()
    available_packages = argostranslate.package.get_available_packages()
    selected = next(
        (package for package in available_packages if package.from_code == from_code and package.to_code == to_code),
        None,
    )
    if selected is None:
        raise LanguagePairUnavailableError(f"Pacote Argos {from_code} -> {to_code} indisponivel")
    argostranslate.package.install_from_path(selected.download())
    return package_identity(selected)


def package_identity(package: object) -> str:
    explicit_code = getattr(package, "code", None)
    if isinstance(explicit_code, str) and explicit_code.strip():
        return explicit_code
    from_code = getattr(package, "from_code", "unknown")
    to_code = getattr(package, "to_code", "unknown")
    version = getattr(package, "package_version", None)
    if isinstance(version, str) and version.strip():
        return f"translate-{from_code}_{to_code}-{version}"
    return f"translate-{from_code}_{to_code}"


def languages_match(detected_language: str | None, target_language: str) -> bool:
    if detected_language is None:
        return False
    if detected_language == "en" and target_language == "en":
        return True
    if detected_language in {"pt", "pb"} and target_language == "pt-BR":
        return True
    return False


def translate_segment_file(
    segments: list[dict],
    detected_language: str | None,
    target_language: str,
    cache_directory: Path,
) -> dict:
    if languages_match(detected_language, target_language):
        copied = []
        for segment in segments:
            updated = dict(segment)
            updated["translatedText"] = segment["text"]
            copied.append(updated)
        return {"segments": copied, "translationApplied": False, "packageCode": None}
    source_code = WHISPER_LANGUAGE_TO_ARGOS.get(detected_language or "")
    target_code = ARGOS_TARGET_CODES.get(target_language)
    if not source_code or not target_code:
        raise LanguagePairUnavailableError("Nao ha pacote local para este par de idiomas")
    package_code = install_language_pair(cache_directory, source_code, target_code)
    try:
        import argostranslate.translate
    except ImportError as error:
        raise TransientMediaError("Argos Translate nao esta instalado") from error

    def translate_text(text: str) -> str:
        return argostranslate.translate.translate(text, source_code, target_code)

    translated = translate_segments(segments, translate_text)
    return {
        "segments": translated,
        "translationApplied": True,
        "packageCode": package_code,
        "sourceCode": source_code,
        "targetCode": target_code,
    }

import json
from pathlib import Path
from typing import Any

from media_worker.errors import InvalidRequestError

CONTRACT_VERSION = "1.0.0"
ALLOWED_COMMANDS = {
    "acquire",
    "prepare",
    "transcribe",
    "translate",
    "write_subtitles",
    "render",
}
ALLOWED_TARGET_LANGUAGES = {"pt-BR"}


def load_request(request_path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(request_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise InvalidRequestError("Nao foi possivel ler o contrato de entrada") from error
    validate_request(payload)
    return payload


def validate_request(payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise InvalidRequestError("Contrato de entrada invalido")
    if payload.get("contractVersion") != CONTRACT_VERSION:
        raise InvalidRequestError("Versao de contrato nao suportada")
    command = payload.get("command")
    if command not in ALLOWED_COMMANDS:
        raise InvalidRequestError("Comando nao permitido")
    for field_name in ("jobId", "videoId", "workDirectory", "cacheDirectory", "targetLanguage"):
        value = payload.get(field_name)
        if not isinstance(value, str) or not value.strip():
            raise InvalidRequestError(f"Campo obrigatorio ausente: {field_name}")
    if payload["targetLanguage"] not in ALLOWED_TARGET_LANGUAGES:
        raise InvalidRequestError("Idioma de destino ainda nao esta habilitado")
    work_directory = Path(payload["workDirectory"]).resolve()
    cache_directory = Path(payload["cacheDirectory"]).resolve()
    if not work_directory.is_absolute() or not cache_directory.is_absolute():
        raise InvalidRequestError("Diretorios de trabalho precisam ser absolutos")
    inputs = payload.get("inputs")
    if not isinstance(inputs, dict):
        raise InvalidRequestError("Entradas do comando invalidas")
    parameters = payload.get("parameters")
    if not isinstance(parameters, dict):
        raise InvalidRequestError("Parametros do comando invalidos")
    _require_path_inside(
        work_directory,
        inputs.get("mediaPath"),
        allow_missing=command in {"acquire", "translate", "write_subtitles"},
    )
    _require_path_inside(work_directory, inputs.get("segmentsPath"), allow_missing=True)
    _require_path_inside(work_directory, inputs.get("subtitlesAssPath"), allow_missing=True)
    font_file = parameters.get("fontFile")
    if font_file is not None and not isinstance(font_file, str):
        raise InvalidRequestError("Arquivo de fonte invalido")
    youtube_url = inputs.get("youtubeUrl")
    if youtube_url is not None and not isinstance(youtube_url, str):
        raise InvalidRequestError("URL de origem invalida")
    if command == "acquire" and not inputs.get("mediaPath") and not youtube_url:
        raise InvalidRequestError("Aquisicao exige arquivo local ou URL canonica")
    if command == "acquire" and inputs.get("mediaPath") and youtube_url:
        raise InvalidRequestError("Aquisicao aceita apenas uma origem")
    if command in {"prepare", "transcribe", "render"} and not inputs.get("mediaPath"):
        raise InvalidRequestError("Comando exige caminho de midia interno")
    if command in {"translate", "write_subtitles"} and not inputs.get("segmentsPath"):
        raise InvalidRequestError("Comando exige caminho interno dos segmentos")
    if command == "render" and not inputs.get("subtitlesAssPath"):
        raise InvalidRequestError("Renderizacao exige arquivo ASS interno")


def assert_inside_directory(root: Path, candidate: Path) -> Path:
    resolved_root = root.resolve()
    resolved_candidate = candidate.resolve()
    if resolved_candidate != resolved_root and resolved_root not in resolved_candidate.parents:
        raise InvalidRequestError("Caminho fora do diretorio autorizado")
    return resolved_candidate


def _require_path_inside(root: Path, value: Any, allow_missing: bool) -> None:
    if value is None:
        if allow_missing:
            return
        raise InvalidRequestError("Caminho interno ausente")
    if not isinstance(value, str) or not value.strip():
        raise InvalidRequestError("Caminho interno invalido")
    candidate = Path(value)
    if not candidate.is_absolute():
        raise InvalidRequestError("Caminhos internos precisam ser absolutos")
    assert_inside_directory(root, candidate)


def write_result(result_path: Path, payload: dict[str, Any]) -> None:
    result_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = result_path.with_suffix(result_path.suffix + ".partial")
    temporary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary_path.replace(result_path)

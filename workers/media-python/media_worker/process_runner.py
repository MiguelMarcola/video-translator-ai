import subprocess
from pathlib import Path

from media_worker.errors import TransientMediaError


def run_command(command: list[str], timeout_seconds: int, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    if not command or any(not isinstance(part, str) or part == "" for part in command):
        raise TransientMediaError("Comando interno vazio")
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd) if cwd else None,
            shell=False,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as error:
        raise TransientMediaError("Tempo esgotado ao executar ferramenta de midia", "timeout") from error
    except OSError as error:
        raise TransientMediaError("Falha ao iniciar ferramenta de midia") from error
    return completed

import json
import sys


def emit_progress(stage: str, message: str) -> None:
    payload = {"stream": "progress", "stage": stage, "message": message}
    print(json.dumps(payload, ensure_ascii=False), file=sys.stderr, flush=True)


def emit_log(level: str, message: str) -> None:
    payload = {"stream": "log", "level": level, "message": message}
    print(json.dumps(payload, ensure_ascii=False), file=sys.stderr, flush=True)

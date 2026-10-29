import argparse
import json
import sys
import time
from pathlib import Path

from media_worker.network import prefer_ipv4_when_requested

prefer_ipv4_when_requested()

from media_worker.contract import load_request, write_result
from media_worker.errors import MediaWorkerError
from media_worker.pipeline import execute_command, install_models
from media_worker.progress import emit_log


def main() -> int:
    parser = argparse.ArgumentParser(prog="media_worker")
    subcommands = parser.add_subparsers(dest="subcommand", required=True)
    run_parser = subcommands.add_parser("run")
    run_parser.add_argument("--request", required=True)
    run_parser.add_argument("--result", required=True)
    install_parser = subcommands.add_parser("install-models")
    install_parser.add_argument("--cache", required=True)
    install_parser.add_argument("--whisper-model", default="base")
    prove_parser = subcommands.add_parser("prove")
    prove_parser.add_argument("--input", required=True)
    prove_parser.add_argument("--work", required=True)
    prove_parser.add_argument("--cache", required=True)
    prove_parser.add_argument("--target-language", default="pt-BR")
    prove_parser.add_argument("--whisper-model", default="base")
    prove_parser.add_argument("--font-file", default="/System/Library/Fonts/Supplemental/Arial.ttf")
    prove_parser.add_argument("--font-family", default="Arial")
    arguments = parser.parse_args()
    if arguments.subcommand == "install-models":
        install_models(Path(arguments.cache).resolve(), arguments.whisper_model)
        return 0
    if arguments.subcommand == "prove":
        return _prove(arguments)
    return _run(Path(arguments.request), Path(arguments.result))


def _run(request_path: Path, result_path: Path) -> int:
    command_name = "unknown"
    try:
        request = load_request(request_path)
        command_name = str(request["command"])
        result = execute_command(request)
        write_result(result_path, result)
        return 0
    except MediaWorkerError as error:
        write_result(
            result_path,
            {
                "contractVersion": "1.0.0",
                "command": command_name,
                "status": "failed",
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "failureClass": error.failure_class,
                },
            },
        )
        emit_log("error", error.code)
        return error.exit_code


def _prove(arguments: argparse.Namespace) -> int:
    work_directory = Path(arguments.work).resolve()
    cache_directory = Path(arguments.cache).resolve()
    source_input = Path(arguments.input).resolve()
    work_directory.mkdir(parents=True, exist_ok=True)
    staged_input = work_directory / "input.mp4"
    if source_input != staged_input:
        staged_input.write_bytes(source_input.read_bytes())
    commands = [
        ("acquire", {"mediaPath": str(staged_input), "youtubeUrl": None, "segmentsPath": None, "subtitlesAssPath": None}),
        ("prepare", {"mediaPath": str(work_directory / "source.mp4"), "youtubeUrl": None, "segmentsPath": None, "subtitlesAssPath": None}),
        ("transcribe", {"mediaPath": str(work_directory / "audio.wav"), "youtubeUrl": None, "segmentsPath": None, "subtitlesAssPath": None}),
        ("translate", {"mediaPath": None, "youtubeUrl": None, "segmentsPath": str(work_directory / "segments.json"), "subtitlesAssPath": None}),
        ("write_subtitles", {"mediaPath": None, "youtubeUrl": None, "segmentsPath": str(work_directory / "segments.json"), "subtitlesAssPath": None}),
        ("render", {"mediaPath": str(work_directory / "playback.mp4"), "youtubeUrl": None, "segmentsPath": None, "subtitlesAssPath": str(work_directory / "subtitles.ass")}),
    ]
    report: dict = {"stages": []}
    started = time.perf_counter()
    for command, inputs in commands:
        request = {
            "contractVersion": "1.0.0",
            "command": command,
            "jobId": "prove",
            "videoId": "prove",
            "workDirectory": str(work_directory),
            "cacheDirectory": str(cache_directory),
            "targetLanguage": arguments.target_language,
            "inputs": inputs,
            "parameters": {
                "whisperModel": arguments.whisper_model,
                "whisperBeamSize": 5,
                "maxDurationSeconds": 1800,
                "fontFile": str(Path(arguments.font_file).resolve()) if arguments.font_file else None,
                "fontFamily": arguments.font_family,
                "timeoutSeconds": 1800,
                "localMediaRoot": str(work_directory),
            },
        }
        result_path = work_directory / f"{command}.result.json"
        request_path = work_directory / f"{command}.request.json"
        request_path.write_text(json.dumps(request), encoding="utf-8")
        exit_code = _run(request_path, result_path)
        result = json.loads(result_path.read_text(encoding="utf-8"))
        report["stages"].append(
            {
                "command": command,
                "exitCode": exit_code,
                "stageDurationMs": result.get("metadata", {}).get("stageDurationMs"),
                "maxRssKb": result.get("metadata", {}).get("maxRssKb"),
                "status": result.get("status"),
                "error": result.get("error"),
            }
        )
        if exit_code != 0:
            report["status"] = "failed"
            report["totalDurationMs"] = int((time.perf_counter() - started) * 1000)
            (work_directory / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            return exit_code
    report["status"] = "succeeded"
    report["totalDurationMs"] = int((time.perf_counter() - started) * 1000)
    (work_directory / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

class MediaWorkerError(Exception):
    def __init__(self, code: str, message: str, exit_code: int, failure_class: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = exit_code
        self.failure_class = failure_class


class InvalidRequestError(MediaWorkerError):
    def __init__(self, message: str) -> None:
        super().__init__("invalid_request", message, 2, "permanent")


class SourceUnavailableError(MediaWorkerError):
    def __init__(self, message: str) -> None:
        super().__init__("source_unavailable", message, 3, "permanent")


class NoSpeechError(MediaWorkerError):
    def __init__(self, message: str) -> None:
        super().__init__("no_speech", message, 4, "permanent")


class DurationExceededError(MediaWorkerError):
    def __init__(self, message: str) -> None:
        super().__init__("duration_exceeded", message, 5, "permanent")


class LanguagePairUnavailableError(MediaWorkerError):
    def __init__(self, message: str) -> None:
        super().__init__("language_pair_unavailable", message, 6, "permanent")


class TransientMediaError(MediaWorkerError):
    def __init__(self, message: str, code: str = "transient_failure") -> None:
        super().__init__(code, message, 10, "transient")


class CancelledError(MediaWorkerError):
    def __init__(self, message: str = "Processamento cancelado") -> None:
        super().__init__("cancelled", message, 130, "permanent")

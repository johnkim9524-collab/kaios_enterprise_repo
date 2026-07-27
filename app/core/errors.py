from __future__ import annotations


class KAIOSRuntimeError(RuntimeError):
    pass


class LiveModeUnavailableError(KAIOSRuntimeError):
    def __init__(self) -> None:
        super().__init__(
            "Live runtime mode is unavailable until verified external "
            "source adapters are configured."
        )


class StageExecutionError(KAIOSRuntimeError):
    def __init__(self, stage: str, cause: Exception) -> None:
        self.stage = stage
        self.cause = cause
        super().__init__(f"KAIOS stage failed: {stage}: {cause}")
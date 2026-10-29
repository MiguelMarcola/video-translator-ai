import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { rm } from "node:fs/promises";
import { buildPythonArguments, pythonResultSchema } from "@video-translate/contracts";
import { logger } from "./logger.js";

export class StageExecutionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly exitCode: number,
    readonly failureClass: "permanent" | "transient",
  ) {
    super(message);
    this.name = "StageExecutionError";
  }
}

export async function runPythonStage(input: {
  pythonBin: string;
  pythonModulePath: string;
  request: unknown;
  requestPath: string;
  resultPath: string;
  workDirectory: string;
  timeoutMs: number;
  shouldCancel: () => Promise<boolean>;
  onPid: (pid: number) => Promise<void>;
  writeRequest: () => Promise<void>;
}): Promise<ReturnType<typeof pythonResultSchema.parse>> {
  await rm(input.resultPath, { force: true });
  await input.writeRequest();
  const [executable, ...args] = buildPythonArguments(input.pythonBin, input.requestPath, input.resultPath);
  if (!executable) {
    throw new StageExecutionError("Interpretador Python ausente", "python_missing", 10, "transient");
  }
  const child = spawn(executable, args, {
    shell: false,
    detached: true,
    cwd: input.workDirectory,
    env: {
      ...process.env,
      PYTHONPATH: input.pythonModulePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid) {
    await input.onPid(child.pid);
  }
  const stderrLines = createInterface({ input: child.stderr });
  stderrLines.on("line", (line) => {
    if (line.length > 400) {
      return;
    }
    try {
      const payload = JSON.parse(line) as { stream?: string; message?: string; stage?: string };
      if (payload.stream === "progress" || payload.stream === "log") {
        logger.info({ stage: payload.stage, message: payload.message }, "python");
      }
    } catch {
      logger.info({ message: line }, "python");
    }
  });
  let timedOut = false;
  let cancelled = false;
  const exitCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child);
    }, input.timeoutMs);
    const cancelTimer = setInterval(() => {
      void input.shouldCancel().then((cancel) => {
        if (cancel) {
          cancelled = true;
          killProcessGroup(child);
        }
      });
    }, 2000);
    child.on("error", (error) => {
      clearTimeout(timer);
      clearInterval(cancelTimer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(cancelTimer);
      resolve(code ?? 1);
    });
  });
  if (cancelled) {
    throw new StageExecutionError("Processamento cancelado", "cancelled", 130, "permanent");
  }
  if (timedOut) {
    throw new StageExecutionError("Tempo da etapa esgotado", "timeout", 10, "transient");
  }
  const { readFile } = await import("node:fs/promises");
  let raw: string;
  try {
    raw = await readFile(input.resultPath, "utf8");
  } catch {
    throw new StageExecutionError("Resultado da etapa ausente", "missing_result", exitCode === 0 ? 10 : exitCode, "transient");
  }
  const parsed = pythonResultSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new StageExecutionError("Resultado da etapa invalido", "invalid_result", 10, "transient");
  }
  if (exitCode !== 0 || parsed.data.status === "failed") {
    const failureClass = parsed.data.error?.failureClass ?? (exitCode === 10 ? "transient" : "permanent");
    throw new StageExecutionError(
      parsed.data.error?.message ?? "Etapa de midia falhou",
      parsed.data.error?.code ?? "media_failed",
      exitCode || 1,
      failureClass,
    );
  }
  return parsed.data;
}

function killProcessGroup(child: { pid?: number; kill: (signal?: NodeJS.Signals) => boolean }): void {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // O processo ja encerrou.
    }
  }
}

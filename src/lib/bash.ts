import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ResultAsync } from "neverthrow";
import { AppError } from "./error";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ExecError extends AppError {
  tag = "ExecError";
}

export class BashSession {
  private readonly bash: ChildProcessWithoutNullStreams;

  private queue: Promise<unknown> = Promise.resolve();

  constructor(cwd = process.cwd()) {
    this.bash = spawn("bash", ["--noprofile", "--norc"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.bash.stdout.setEncoding("utf8");
    this.bash.stderr.setEncoding("utf8");
  }

  run(command: string): ResultAsync<ExecResult, ExecError> {
    const task = this.queue.then(() => this.execute(command));

    // Don't let a failed command break the queue.
    this.queue = task.catch(() => undefined);

    return ResultAsync.fromPromise(task, (e) => {
      if (e instanceof ExecError) {
        return e;
      }

      return new ExecError("Failed to execute command", e, {
        command,
      });
    });
  }

  private execute(command: string): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();

      const doneMarker = `__EXEC_DONE_${id}__`;
      const exitMarker = `__EXEC_EXIT_${id}_`;

      let stdout = "";
      let stderr = "";

      const onStdout = (data: string) => {
        stdout += data;

        const doneIndex = stdout.indexOf(doneMarker);

        if (doneIndex === -1) {
          return;
        }

        const output = stdout.slice(0, doneIndex);

        const match = output.match(
          new RegExp(`__EXEC_EXIT_${id}_(-?\\d+)__\\n?$`),
        );

        if (!match) {
          return;
        }

        const exitCode = Number(match[1]);

        const cleanStdout = output.slice(0, -match[0].length).trimEnd();

        cleanup();

        if (exitCode === 0) {
          resolve({
            stdout: cleanStdout,
            stderr: stderr.trimEnd(),
            exitCode,
          });

          return;
        }

        reject(
          new ExecError(`Command exited with code ${exitCode}`, undefined, {
            command,
            exitCode,
            signal: null,
            stdout: cleanStdout,
            stderr: stderr.trimEnd(),
          }),
        );
      };

      const onStderr = (data: string) => {
        stderr += data;
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();

        reject(
          new ExecError(
            signal ? `Bash terminated by ${signal}` : "Bash process terminated",
            undefined,
            {
              command,
              exitCode: code,
              signal,
              stdout,
              stderr,
            },
          ),
        );
      };

      const cleanup = () => {
        this.bash.stdout.off("data", onStdout);
        this.bash.stderr.off("data", onStderr);
        this.bash.off("exit", onExit);
      };

      this.bash.stdout.on("data", onStdout);
      this.bash.stderr.on("data", onStderr);
      this.bash.once("exit", onExit);

      this.bash.stdin.write(
        `${command}\n` +
          `__exec_status=$?\n` +
          `printf '${exitMarker}%s__\\n' "$__exec_status"\n` +
          `printf '${doneMarker}\\n'\n`,
      );
    });
  }

  kill(): void {
    this.bash.kill();
  }
}

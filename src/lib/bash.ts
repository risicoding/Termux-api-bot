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

  private stdoutBuffer = "";
  private stderrBuffer = "";

  private queue: Promise<unknown> = Promise.resolve();

  constructor(cwd = process.cwd()) {
    this.bash = spawn("bash", ["--noprofile", "--norc", "-i"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.bash.stdout.setEncoding("utf8");
    this.bash.stderr.setEncoding("utf8");

    this.bash.stdout.on("data", (data: string) => {
      this.stdoutBuffer += data;
    });

    this.bash.stderr.on("data", (data: string) => {
      this.stderrBuffer += data;
    });
  }

  run(command: string): ResultAsync<ExecResult, ExecError> {
    const task = this.queue.then(() => this.execute(command));

    // Keep the queue alive even when a command fails.
    this.queue = task.catch(() => undefined);

    return ResultAsync.fromPromise(
      task,
      (e) => new ExecError("Failed to execute command", e),
    );
  }

  private execute(command: string): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const marker = `__EXEC_DONE_${id}__`;

      let stdout = "";
      let stderr = "";

      const onStdout = (data: string) => {
        stdout += data;

        const markerIndex = stdout.indexOf(marker);

        if (markerIndex === -1) {
          return;
        }

        const beforeMarker = stdout.slice(0, markerIndex);

        const match = beforeMarker.match(/__EXEC_EXIT_(-?\d+)__$/);

        const exitCode = match ? Number(match[1]) : 0;

        const cleanStdout = beforeMarker
          .replace(/__EXEC_EXIT_-?\d+__$/, "")
          .trimEnd();

        cleanup();

        if (exitCode === 0) {
          resolve({
            stdout: cleanStdout,
            stderr: stderr.trimEnd(),
            exitCode,
          });
        } else {
          reject(
            new ExecError(`Command exited with code ${exitCode}`, {
              exitCode,
              signal: null,
              stdout: cleanStdout,
              stderr: stderr.trimEnd(),
            }),
          );
        }
      };

      const onStderr = (data: string) => {
        stderr += data;
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(
          new ExecError(
            signal ? `Bash terminated by ${signal}` : "Bash process terminated",
            {
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
          `printf '\\n${marker}\\n'\n` +
          `printf '__EXEC_EXIT_%s__\\n' "$?"\n`,
      );
    });
  }

  kill(): void {
    this.bash.kill();
  }
}
//
// Usage:
//
// const bash = new BashSession();
//
// const result = await bash.run("pwd");
//
// result.match(
//   (result) => {
//     console.log(result.stdout);
//   },
//   (error) => {
//     console.error(error);
//   },
// );
//
// Now state persists:
//
// await bash.run("cd /tmp");
//
// const result = await bash.run("pwd");
//
// result.match(
//   (result) => console.log(result.stdout),
//   (error) => console.error(error),
// );
//
// Output:
//
// /tmp
//
// And shell state persists too:
//
// await bash.run("export FOO=hello");
//
// const result = await bash.run("echo $FOO");
//
// Output:
//
// hello
//
// Globbing works naturally:
//
// await bash.run("ls *.zip");
//
// Pipes work:
//
// await bash.run("ps aux | grep node");
//
// And commands such as:
//
// await bash.run("cd ~/projects && pnpm install");
//
// work exactly as they would in a terminal.
//
// Why the queue matters
//
// You should not do this:
//
// bash.run("sleep 5");
// bash.run("pwd");
//
// simultaneously against the same Bash process.
//
// Both commands would be written into the same stdin stream, and their output would become ambiguous.
//
// The queue makes it:
//
// command 1
//    ↓
// wait for marker
//    ↓
// command 2
//    ↓
// wait for marker
//    ↓
// command 3
//
// That's especially important for Telegram, where multiple messages can arrive almost simultaneously.
//
// For Telegram
//
// I'd then maintain one "BashSession" per chat:
//
// const sessions = new Map<number, BashSession>();
//
// function getSession(chatId: number): BashSession {
//   let session = sessions.get(chatId);
//
//   if (!session) {
//     session = new BashSession();
//     sessions.set(chatId, session);
//   }
//
//   return session;
// }
//
// Then:
//
// const session = getSession(ctx.chat.id);
//
// const result = await session.run(command);
//
// result.match(
//   async ({ stdout, stderr, exitCode }) => {
//     await ctx.reply(
//       stdout || stderr || `Exit code: ${exitCode}`,
//     );
//   },
//
//   async (error) => {
//     await ctx.reply(
//       `❌ ${error.tag}\n\n` +
//       `${error.message}\n\n` +
//       `${error.stderr}`,
//     );
//   },
// );

import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { stat } from "node:fs/promises";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { AppError } from "./error";

const execFile = promisify(nodeExecFile);

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  cwd: string;
}

export class ExecError extends AppError {
  tag = "ExecError";
}
export class DirectoryError extends AppError {
  tag = "DirectoryError";
}

export class ShellExecutor {
  private cwd: string;

  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
  }

  get currentDirectory(): string {
    return this.cwd;
  }

  private execute(
    command: string,
    args: string[] = [],
    options: ExecOptions = {},
  ): ResultAsync<ExecResult, ExecError> {
    const cwd = options.cwd ?? this.cwd;

    return ResultAsync.fromPromise(
      execFile(command, args, {
        cwd,
        env: options.env ?? process.env,
        timeout: options.timeout,
        maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
      }),
      (err) => new ExecError("Failed to execute command", err),
    ).map(({ stdout, stderr }) => ({
      stdout,
      stderr,
      cwd,
    }));
  }

  private cd(directory?: string): ResultAsync<string, DirectoryError> {
    const target = directory || process.env.HOME || process.cwd();

    const newCwd = path.isAbsolute(target)
      ? target
      : path.resolve(this.cwd, target);

    return ResultAsync.fromPromise(
      stat(newCwd),
      (err) => new DirectoryError(`Cannot access directory: ${newCwd}`, err),
    ).andThen((info) => {
      if (!info.isDirectory()) {
        return errAsync(new DirectoryError(`Not a directory: ${newCwd}`));
      }

      this.cwd = newCwd;

      return okAsync(newCwd);
    });
  }

  run(
    command: string,
    args: string[] = [],
    options: ExecOptions = {},
  ): ResultAsync<ExecResult, ExecError> {
    if (command === "cd") {
      return this.cd(args[0]).map((cwd) => ({
        stdout: "",
        stderr: "",
        cwd,
      }));
    }

    return this.execute(command, args, options);
  }
}

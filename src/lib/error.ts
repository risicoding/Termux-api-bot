export class AppError {
  tag?: string;
  error?: Error;
  meta?: any;
  constructor(
    public readonly message?: string,
    err?: unknown,
    meta?: unknown,
  ) {
    if (err && err instanceof Error) {
      this.error = err;
    }

    if (meta) this.meta = meta;
  }

  public log = () => `${this.tag} ${this.message}`;
}

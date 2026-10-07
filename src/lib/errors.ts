export class AppError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}
export type ActionResult = {
  ok: boolean;
  message: string;
  id?: string;
  fieldErrors?: Record<string, string>;
};

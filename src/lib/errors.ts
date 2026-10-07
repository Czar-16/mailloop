export class AppError extends Error {}
export type ActionResult = { ok: boolean; message: string; id?: string };

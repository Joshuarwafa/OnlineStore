import type { NextFunction, Request, Response } from "express";

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  // Malformed JSON body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ message: "The request body isn't valid JSON." });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server." });
}

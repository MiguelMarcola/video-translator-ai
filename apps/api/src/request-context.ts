import type { Request } from "express";

export type RequestWithContext = Request & {
  requestId?: string;
  userId?: string;
};

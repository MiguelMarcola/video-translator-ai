import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { RequestWithContext } from "./request-context.js";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const incoming = request.header("x-request-id");
    const requestId = incoming && /^[A-Za-z0-9-]{8,80}$/.test(incoming) ? incoming : randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  }
}

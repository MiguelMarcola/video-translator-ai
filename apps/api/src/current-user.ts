import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequestWithContext } from "./request-context.js";

export const CurrentUserId = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<RequestWithContext>().userId ?? "";
});

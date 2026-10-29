import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { AccessDeniedError } from "@video-translate/contracts";
import { ApiError } from "./api-error.js";
import { logger } from "./logger.js";
import type { RequestWithContext } from "./request-context.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithContext>();
    const requestId = request.requestId ?? "unknown";
    const mapped = mapException(exception);
    if (mapped.statusCode >= 500) {
      logger.error({ requestId, code: mapped.code, videoId: request.params?.id }, mapped.message);
    }
    response.status(mapped.statusCode).json({
      code: mapped.code,
      message: mapped.message,
      requestId,
    });
  }
}

function mapException(exception: unknown): { statusCode: number; code: string; message: string } {
  if (exception instanceof ApiError) {
    return { statusCode: exception.statusCode, code: exception.code, message: exception.message };
  }
  if (exception instanceof AccessDeniedError) {
    return { statusCode: 404, code: "not_found", message: "Video nao encontrado." };
  }
  if (exception instanceof ZodError) {
    return { statusCode: 400, code: "invalid_body", message: exception.issues[0]?.message ?? "Dados invalidos." };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();
    const message = typeof payload === "string" ? payload : "Requisicao recusada.";
    return { statusCode, code: "http_error", message };
  }
  return { statusCode: 500, code: "internal_error", message: "Falha interna ao processar a requisicao." };
}

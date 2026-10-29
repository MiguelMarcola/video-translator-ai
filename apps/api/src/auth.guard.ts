import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { parseDevUserId } from "@video-translate/contracts";
import { ApiError } from "./api-error.js";
import { PrismaService } from "./prisma.service.js";
import type { RequestWithContext } from "./request-context.js";
import { authConfiguration } from "./runtime.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (authConfiguration.mode !== "development") {
      throw new ApiError(503, "auth_unconfigured", "A autenticacao ainda nao foi configurada para este ambiente.");
    }
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const devUserId = parseDevUserId(request.header("x-dev-user-id"));
    if (!devUserId) {
      throw new ApiError(401, "unauthenticated", "Informe a identidade local no cabecalho X-Dev-User-Id.");
    }
    const user = await this.prisma.user.upsert({
      where: { externalId: devUserId },
      update: {},
      create: { externalId: devUserId, displayName: devUserId },
    });
    request.userId = user.id;
    return true;
  }
}

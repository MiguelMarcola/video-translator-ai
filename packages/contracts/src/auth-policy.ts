export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export type AuthConfiguration =
  | { mode: "development" }
  | { mode: "unconfigured" };

export function assertAuthConfiguration(input: {
  nodeEnv: string | undefined;
  authMode: string | undefined;
  allowDevIdentity: string | undefined;
}): AuthConfiguration {
  const nodeEnv = input.nodeEnv ?? "development";
  const authMode = input.authMode ?? "unconfigured";
  const developmentRequested = authMode === "development" || input.allowDevIdentity === "true";
  if (nodeEnv === "production" && developmentRequested) {
    throw new AuthConfigurationError(
      "Identidade de desenvolvimento recusada em producao. Escolha um provedor de identidade antes do lancamento.",
    );
  }
  if (nodeEnv === "production") {
    throw new AuthConfigurationError(
      "Provedor de identidade ainda nao foi escolhido. A API nao inicia em producao.",
    );
  }
  if (authMode === "development") {
    if (input.allowDevIdentity !== "true") {
      throw new AuthConfigurationError(
        "AUTH_MODE=development exige ALLOW_DEV_IDENTITY=true e fica restrito ao ambiente local.",
      );
    }
    return { mode: "development" };
  }
  return { mode: "unconfigured" };
}

const devUserIdPattern = /^[a-z0-9-]{3,64}$/;

export function parseDevUserId(headerValue: string | undefined): string | null {
  if (!headerValue || !devUserIdPattern.test(headerValue)) {
    return null;
  }
  return headerValue;
}

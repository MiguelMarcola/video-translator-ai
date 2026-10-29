import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  live(): { status: string } {
    return { status: "ok" };
  }
}

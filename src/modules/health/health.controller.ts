import { Controller, Get } from '@nestjs/common';
import { HealthCheck, type HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get()
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.checkDatabase();
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.checkDatabase();
  }

  private checkDatabase(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return { database: { status: 'up' } };
      },
    ]);
  }
}

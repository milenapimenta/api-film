import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();

    return next.handle().pipe(
      finalize(() => {
        this.logger.log({
          message: 'Requisição concluída.',
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
          requestId: request.id,
        });
      }),
    );
  }
}

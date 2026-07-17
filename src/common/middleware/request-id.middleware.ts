import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const providedId = request.header('x-request-id');
    request.id = providedId?.trim() || randomUUID();
    response.setHeader('x-request-id', request.id);
    next();
  }
}

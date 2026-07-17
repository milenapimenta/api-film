import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ApiErrorBody {
  erro?: string;
  erros?: string[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const { status, body } = this.toHttpError(exception);

    if (status >= 500) {
      this.logger.error({
        message: 'Erro inesperado durante a requisição.',
        method: request.method,
        path: request.originalUrl,
        requestId: request.id,
        error: exception instanceof Error ? exception.message : 'Erro desconhecido',
        stack:
          process.env.NODE_ENV === 'production' || !(exception instanceof Error)
            ? undefined
            : exception.stack,
      });
    }

    response.status(status).json(body);
  }

  private toHttpError(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const apiBody = exceptionResponse as ApiErrorBody;
        if (apiBody.erro || apiBody.erros) {
          return { status, body: apiBody };
        }
      }

      if (status === 404) {
        return { status, body: { erro: 'Rota não encontrada.' } };
      }

      return { status, body: { erro: exception.message } };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { erro: 'Erro interno do servidor.' },
    };
  }

  private fromPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ApiErrorBody;
  } {
    switch (exception.code) {
      case 'P2002':
        return { status: HttpStatus.CONFLICT, body: { erro: 'Registro já existente.' } };
      case 'P2003':
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          body: { erro: 'O registro está relacionado a outro recurso.' },
        };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, body: { erro: 'Filme não encontrado.' } };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: { erro: 'Erro interno do servidor.' },
        };
    }
  }
}

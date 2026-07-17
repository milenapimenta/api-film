import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root(): { mensagem: string } {
    return { mensagem: 'API de filmes funcionando!' };
  }
}

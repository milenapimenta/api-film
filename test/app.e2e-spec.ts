import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApplication } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';

jest.setTimeout(120_000);

interface FilmeBody {
  id: number;
  titulo: string;
  diretor: string;
  ano: number;
  genero: string;
}

interface ValidationErrorBody {
  erros: string[];
}

interface ReadinessBody {
  status: string;
  info: { database: { status: string } };
}

describe('API de filmes (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('api_filmes_test')
      .withUsername('api_filmes_test')
      .withPassword('api_filmes_test')
      .start();

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.RATE_LIMIT_MAX = '1000';

    const { AppModule } = await import('../src/app.module');

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '..'),
      env: process.env,
      stdio: 'pipe',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const nestApp = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApplication(nestApp, false);
    await nestApp.init();

    app = nestApp;
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.filme.deleteMany();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (container) {
      await container.stop();
    }
  });

  it('preserva a raiz e o ciclo CRUD', async () => {
    await request(server).get('/').expect(200).expect({ mensagem: 'API de filmes funcionando!' });

    const created = await request(server)
      .post('/filmes')
      .send({
        titulo: '  Cidade de Deus  ',
        diretor: ' Fernando Meirelles ',
        ano: 2002,
        genero: ' Drama ',
      })
      .expect(201);

    const createdBody = created.body as FilmeBody;
    expect(typeof createdBody.id).toBe('number');
    expect(createdBody).toMatchObject({
      titulo: 'Cidade de Deus',
      diretor: 'Fernando Meirelles',
      ano: 2002,
      genero: 'Drama',
    });

    const id = createdBody.id;
    await request(server).get(`/filmes/${id}`).expect(200).expect(createdBody);

    const listed = await request(server).get('/filmes').expect(200);
    expect(listed.body as FilmeBody[]).toEqual([createdBody]);
    expect(listed.headers['x-total-count']).toBe('1');

    await request(server)
      .put(`/filmes/${id}`)
      .send({
        titulo: 'Cidade de Deus',
        diretor: 'Fernando Meirelles e Kátia Lund',
        ano: 2002,
        genero: 'Drama',
      })
      .expect(200)
      .expect({
        id,
        titulo: 'Cidade de Deus',
        diretor: 'Fernando Meirelles e Kátia Lund',
        ano: 2002,
        genero: 'Drama',
      });

    await request(server).delete(`/filmes/${id}`).expect(204).expect('');
    await request(server)
      .get(`/filmes/${id}`)
      .expect(404)
      .expect({ erro: 'Filme não encontrado.' });
  });

  it('agrega as quatro mensagens de validação legadas', async () => {
    const response = await request(server)
      .post('/filmes')
      .send({ titulo: '', diretor: '', ano: 1500 })
      .expect(400);

    expect(response.body as ValidationErrorBody).toEqual({
      erros: [
        'O título é obrigatório.',
        'O diretor é obrigatório.',
        'O ano deve ser um número inteiro entre 1888 e 2100.',
        'O gênero é obrigatório.',
      ],
    });
  });

  it('rejeita propriedades desconhecidas para impedir mass assignment', async () => {
    const response = await request(server)
      .post('/filmes')
      .send({
        titulo: 'Bacurau',
        diretor: 'Kleber Mendonça Filho e Juliano Dornelles',
        ano: 2019,
        genero: 'Drama',
        ownerId: 123,
      })
      .expect(400);

    expect((response.body as ValidationErrorBody).erros).toContain(
      'property ownerId should not exist',
    );
  });

  it('pagina de forma determinística sem mudar o formato de array', async () => {
    await prisma.filme.createMany({
      data: [
        { titulo: 'Filme A', diretor: 'Diretor A', ano: 2000, genero: 'Drama' },
        { titulo: 'Filme B', diretor: 'Diretor B', ano: 2001, genero: 'Drama' },
        { titulo: 'Filme C', diretor: 'Diretor C', ano: 2002, genero: 'Drama' },
      ],
    });

    const response = await request(server).get('/filmes?page=2&limit=2').expect(200);
    const body = response.body as FilmeBody[];
    expect(body).toHaveLength(1);
    expect(body[0]?.titulo).toBe('Filme C');
    expect(response.headers['x-total-count']).toBe('3');
    expect(response.headers['x-page']).toBe('2');
    expect(response.headers['x-limit']).toBe('2');
  });

  it('expõe liveness, readiness e o erro de rota compatível', async () => {
    await request(server).get('/health/live').expect(200).expect({ status: 'ok' });

    const readiness = await request(server).get('/health/ready').expect(200);
    const readinessBody = readiness.body as ReadinessBody;
    expect(readinessBody.status).toBe('ok');
    expect(readinessBody.info.database.status).toBe('up');

    await request(server)
      .get('/rota-inexistente')
      .expect(404)
      .expect({ erro: 'Rota não encontrada.' });
    await request(server).get('/filmes/abc').expect(404).expect({ erro: 'Filme não encontrado.' });
  });
});

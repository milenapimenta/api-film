# API de filmes

API REST para cadastro de filmes, implementada com NestJS, TypeScript, Prisma e
PostgreSQL. O contrato HTTP do CRUD Express original foi mantido: as mesmas URLs,
métodos, campos, status e mensagens de domínio continuam disponíveis.

## Arquitetura

```text
src/
├── main.ts                         # bootstrap e logs JSON
├── app.module.ts                   # composição dos módulos
├── app.setup.ts                    # CORS, Helmet, pipes, filter e shutdown
├── common/
│   ├── decorators/                 # validações reutilizáveis
│   ├── filters/                    # erros HTTP e Prisma padronizados
│   ├── interceptors/               # log e duração de requests
│   ├── middleware/                 # x-request-id
│   └── pipes/                      # validação do ID de filme
├── config/                         # configuração e validação do ambiente
├── database/                       # PrismaModule global e PrismaService
└── modules/
    ├── filmes/                     # DTOs, entidade, controller e service
    └── health/                     # liveness e readiness
```

O controller trata somente o contrato HTTP. O `FilmesService` concentra as regras
e consultas, sempre por meio da única instância de `PrismaService`. A API seleciona
e mapeia explicitamente os campos públicos, portanto `createdAt` e `updatedAt` não
são expostos.

Redis, autenticação e SSE não foram adicionados porque não existiam na aplicação
original. Não há polling nem WebSockets.

## Requisitos

- Node.js 22 ou superior;
- npm 10 ou superior;
- PostgreSQL 14 ou superior;
- Docker com Compose, para a execução completa e para testes e2e.

## Variáveis de ambiente

Copie o exemplo antes da execução local:

```bash
cp .env.example .env
```

| Variável            | Obrigatória | Padrão                  | Descrição                                                 |
| ------------------- | ----------: | ----------------------- | --------------------------------------------------------- |
| `DATABASE_URL`      |         sim | —                       | URL PostgreSQL usada pelo Prisma                          |
| `NODE_ENV`          |         não | `development`           | `development`, `test` ou `production`                     |
| `PORT`              |         não | `3000`                  | porta HTTP                                                |
| `CORS_ORIGIN`       |         não | `http://localhost:3000` | origens separadas por vírgula; `*` desabilita credentials |
| `TRUST_PROXY`       |         não | `false`                 | habilita confiança no proxy reverso                       |
| `BODY_LIMIT`        |         não | `100kb`                 | limite do JSON recebido                                   |
| `RATE_LIMIT_TTL_MS` |         não | `60000`                 | janela do rate limit em milissegundos                     |
| `RATE_LIMIT_MAX`    |         não | `100`                   | máximo de requests por IP na janela                       |

A inicialização falha imediatamente se `DATABASE_URL` estiver ausente ou se uma
variável validada tiver formato inválido. Nunca versione o arquivo `.env`.

## Execução local

Suba somente o PostgreSQL, instale as dependências, aplique as migrations e inicie
o NestJS em watch mode:

```bash
docker compose up -d postgres
npm ci
npm run prisma:migrate:deploy
npm run start:dev
```

A API estará disponível em `http://localhost:3000`; o Compose publica o PostgreSQL
local em `localhost:5433` para não colidir com instalações locais na porta padrão.

Comandos úteis:

```bash
npm run build
npm run start:prod
npm run prisma:studio
npm run prisma:seed
```

## Execução com Docker Compose

O Compose sobe o PostgreSQL, executa `prisma migrate deploy` uma única vez e só
depois inicia a API:

```bash
docker compose up --build -d
docker compose ps
curl http://localhost:3000/health/ready
```

Para encerrar sem apagar os dados:

```bash
docker compose down
```

Para apagar também o volume local, use `docker compose down -v`. Esse comando é
destrutivo e nunca deve ser usado contra dados que precisem ser preservados.

## Rotas

| Método   | Rota            |      Status | Ação                                |
| -------- | --------------- | ----------: | ----------------------------------- |
| `GET`    | `/`             |         200 | confirma que a API está respondendo |
| `GET`    | `/filmes`       |         200 | lista filmes                        |
| `GET`    | `/filmes/:id`   |     200/404 | consulta um filme                   |
| `POST`   | `/filmes`       |     201/400 | cadastra um filme                   |
| `PUT`    | `/filmes/:id`   | 200/400/404 | substitui os dados de um filme      |
| `DELETE` | `/filmes/:id`   |     204/404 | exclui um filme                     |
| `GET`    | `/health`       |     200/503 | readiness com PostgreSQL            |
| `GET`    | `/health/live`  |         200 | liveness sem dependências externas  |
| `GET`    | `/health/ready` |     200/503 | readiness com PostgreSQL            |

Exemplo de cadastro:

```bash
curl -X POST http://localhost:3000/filmes \
  -H 'Content-Type: application/json' \
  -d '{
    "titulo": "Cidade de Deus",
    "diretor": "Fernando Meirelles",
    "ano": 2002,
    "genero": "Drama"
  }'
```

Resposta:

```json
{
  "id": 1,
  "titulo": "Cidade de Deus",
  "diretor": "Fernando Meirelles",
  "ano": 2002,
  "genero": "Drama"
}
```

### Paginação

`GET /filmes` aceita `page` e `limit`. Os padrões são `1` e `100`; o limite
máximo é 100. Para preservar o contrato anterior, o corpo continua sendo um array.
Os metadados são enviados nos headers `X-Total-Count`, `X-Page` e `X-Limit`.

```bash
curl -i 'http://localhost:3000/filmes?page=2&limit=20'
```

### Validação e erros

Os campos `titulo`, `diretor`, `ano` e `genero` continuam obrigatórios. O ano deve
ser inteiro entre 1888 e 2100. Erros de domínio preservam os formatos legados:

```json
{ "erro": "Filme não encontrado." }
```

```json
{ "erros": ["O título é obrigatório."] }
```

Como endurecimento de segurança, propriedades desconhecidas agora recebem 400 em
vez de serem silenciosamente ignoradas. A listagem também passou a ter limite de
100 itens por página para evitar respostas ilimitadas; o formato do corpo não mudou.

## Prisma e migrations

O schema está em `prisma/schema.prisma`. A migration inicial cria somente a tabela
`filmes`, os campos encontrados no domínio, os timestamps internos, dois índices de
consulta e a restrição de ano já exigida pela API.

Desenvolvimento, depois de alterar o schema:

```bash
npm run prisma:migrate:dev -- --name descreva_a_mudanca
npm run prisma:generate
```

Produção:

```bash
npm ci
npm run prisma:migrate:deploy
npm run build
npm run start:prod
```

Nunca use `prisma migrate reset` em produção. Como o projeto anterior armazenava
somente em memória, não existe tabela legada a ser introspectada nem dado persistido
a converter. Ambientes que já tenham uma base externa devem executar `prisma db
pull` e comparar o resultado antes de aplicar a migration inicial.

## Testes e qualidade

Os unitários usam Jest. Os e2e usam Supertest, sobem um PostgreSQL 17 descartável
com Testcontainers e aplicam as migrations reais antes dos testes.

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:cov
```

O Docker precisa estar ativo para `npm run test:e2e`.

## Segurança e observabilidade

- Helmet e CORS configurável;
- payload JSON limitado e propriedades extras rejeitadas;
- rate limit global;
- `X-Request-Id` propagado ou criado por request;
- logs JSON em produção, sem body, token ou credenciais;
- erros internos e códigos Prisma não são expostos;
- graceful shutdown fecha o servidor e o Prisma;
- imagem multi-stage executada como usuário não root.

## Deploy na AWS

O workflow testa, valida o Prisma, compila, executa e2e, constrói a imagem, publica
no ECR, aplica migrations e atualiza a EC2 por Systems Manager. O PostgreSQL de
produção deve ser externo ao contêiner e persistente, como Amazon RDS.

Consulte [DEPLOY_AWS.md](DEPLOY_AWS.md) para a configuração necessária.

## Troubleshooting

- `Configuração de ambiente inválida`: confira `DATABASE_URL` e `.env`.
- `P1001` do Prisma: confirme host, porta, security group e saúde do PostgreSQL.
- `port is already allocated`: altere `PORT` ou `POSTGRES_PORT` no `.env`.
- e2e sem conectar ao Docker: valide `docker info` e as permissões do usuário.
- readiness 503: consulte os logs com `docker compose logs api postgres`.

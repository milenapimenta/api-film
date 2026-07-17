# API de filmes

API REST simples em Node.js e Express para cadastrar filmes. Os dados ficam em
memória e são apagados sempre que o servidor reinicia.

## Como executar

Requer Node.js 18 ou superior.

```bash
npm install
npm start
```

A API ficará disponível em `http://localhost:3000`.

Para executar em modo de desenvolvimento, com reinício automático:

```bash
npm run dev
```

## Rotas

| Método | Rota          | Ação                  |
|--------|---------------|-----------------------|
| GET    | `/filmes`     | Lista todos os filmes |
| GET    | `/filmes/:id` | Consulta um filme     |
| POST   | `/filmes`     | Cadastra um filme     |
| PUT    | `/filmes/:id` | Atualiza um filme     |
| DELETE | `/filmes/:id` | Exclui um filme       |

Exemplo de cadastro:

```bash
curl -X POST http://localhost:3000/filmes \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Cidade de Deus",
    "diretor": "Fernando Meirelles",
    "ano": 2002,
    "genero": "Drama"
  }'
```

Exemplo de resposta:

```json
{
  "id": 1,
  "titulo": "Cidade de Deus",
  "diretor": "Fernando Meirelles",
  "ano": 2002,
  "genero": "Drama"
}
```

## Testes

```bash
npm test
```

## Deploy na AWS

O projeto inclui Dockerfile e um workflow de CI/CD para deploy em uma instância
EC2 usando GitHub Actions, Amazon ECR e AWS Systems Manager.

Consulte o passo a passo completo em [DEPLOY_AWS.md](DEPLOY_AWS.md).

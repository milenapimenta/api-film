# Deploy da API na AWS EC2 com GitHub Actions

Este guia descreve o fluxo mantido pelo repositório: GitHub Actions cria a imagem,
publica no Amazon ECR e atualiza uma instância EC2 por AWS Systems Manager. A versão
NestJS exige PostgreSQL persistente; use uma instância gerenciada, como Amazon RDS,
e não execute o banco dentro do mesmo contêiner da API em produção.

## Fluxo de entrega

Em pull requests para `main`, o workflow executa:

1. `npm ci`;
2. validação e geração do Prisma Client;
3. lint e build;
4. testes unitários;
5. testes e2e com PostgreSQL descartável;
6. validação e build do Docker Compose.

Em push para `main`, depois dessas verificações:

1. publica no ECR as tags do SHA e `latest`;
2. busca a `DATABASE_URL` no Parameter Store;
3. executa `prisma migrate deploy` em um contêiner efêmero;
4. substitui o contêiner da API;
5. aguarda o health check;
6. se a aplicação não ficar saudável, restaura a imagem anterior.

Migrations aplicadas não sofrem rollback automático. Toda migration de produção
deve ser compatível com a versão anterior da aplicação durante a janela de deploy.

## Recursos necessários

- repositório ECR privado, por exemplo `api-filmes`;
- instância EC2 com Docker, AWS CLI v2 e SSM Agent;
- PostgreSQL/RDS acessível pela EC2;
- IAM role da EC2 para SSM, ECR e leitura do parâmetro seguro;
- identidade do GitHub Actions com acesso mínimo a ECR e `ssm:SendCommand`;
- Environment `production` no GitHub.

A EC2 deve aceitar HTTP/80 do público ou, preferencialmente, tráfego somente de um
load balancer. O PostgreSQL deve aceitar 5432 apenas do security group da EC2. Não
exponha a porta do banco à internet.

## 1. Validar localmente

```bash
cp .env.example .env
npm ci
npm run lint
npm run build
npm test
npm run test:e2e
docker compose config
docker compose up --build -d
docker compose ps
curl http://localhost:3000/health/ready
docker compose down
```

## 2. Criar o PostgreSQL

Crie a instância PostgreSQL e uma base/usuário exclusivos da aplicação. Exija TLS
quando suportado pela configuração escolhida e mantenha backups automáticos. A URL
tem o formato:

```text
postgresql://USUARIO:SENHA@HOST:5432/BANCO?schema=public&sslmode=require
```

Não coloque essa URL no repositório, em GitHub Variables ou no comando SSM.

## 3. Armazenar a URL no Parameter Store

No Systems Manager Parameter Store, crie um parâmetro `SecureString`, por exemplo:

```text
/api-filmes/production/database-url
```

O valor é a URL completa do PostgreSQL. Use uma chave KMS gerenciada ou uma chave
própria. Se usar uma chave própria, conceda também `kms:Decrypt` à role da EC2.

Exemplo de permissão mínima adicional para a role da EC2:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadDatabaseUrl",
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:REGION:ACCOUNT_ID:parameter/api-filmes/production/database-url"
    },
    {
      "Sid": "PullApiImage",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    }
  ]
}
```

A role também precisa de `AmazonSSMManagedInstanceCore` para receber comandos.

## 4. Preparar a EC2

Associe a role à instância e instale os serviços:

```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo systemctl enable --now amazon-ssm-agent
sudo usermod -aG docker ec2-user
```

No Ubuntu, use `apt` para instalar Docker e confirme o nome correto do usuário. Em
ambos os casos, valide:

```bash
sudo systemctl status docker --no-pager
sudo systemctl status amazon-ssm-agent --no-pager
aws --version
docker --version
```

O security group deve liberar saída HTTPS para ECR/SSM e conexão com o RDS. Não é
necessário abrir SSH quando a administração é feita somente pelo Session Manager.

## 5. Configurar o GitHub Environment

Crie o Environment `production` e cadastre:

Secrets:

| Nome                    | Conteúdo                           |
| ----------------------- | ---------------------------------- |
| `AWS_ACCESS_KEY_ID`     | access key da identidade de deploy |
| `AWS_SECRET_ACCESS_KEY` | secret correspondente              |

Variables:

| Nome                     | Exemplo                               |
| ------------------------ | ------------------------------------- |
| `AWS_REGION`             | `us-east-1`                           |
| `ECR_REPOSITORY`         | `api-filmes`                          |
| `EC2_INSTANCE_ID`        | `i-0123456789abcdef0`                 |
| `DATABASE_URL_PARAMETER` | `/api-filmes/production/database-url` |
| `CORS_ORIGIN`            | `https://app.exemplo.com`             |

Proteja o Environment com aprovação e restrinja deploys à branch `main`. Para uma
configuração nova, prefira GitHub OIDC a access keys de longa duração; o workflow
atual mantém as chaves somente por compatibilidade com o deploy existente.

## 6. Permissões da identidade de deploy

A identidade usada pelo GitHub precisa de:

- `ecr:GetAuthorizationToken`;
- ações de upload apenas no repositório ECR da API;
- `ssm:SendCommand` apenas para `AWS-RunShellScript` e para a EC2 de produção;
- `ssm:GetCommandInvocation` para consultar o resultado.

Ela não precisa ler `DATABASE_URL`: quem lê o parâmetro é a role da EC2. Isso evita
transportar a credencial do banco pelo GitHub Actions.

## 7. Primeiro deploy

Envie a branch `main` e acompanhe o workflow. Depois valide:

```bash
curl http://IP_OU_DOMINIO/health/live
curl http://IP_OU_DOMINIO/health/ready
curl http://IP_OU_DOMINIO/filmes
```

Na EC2, pelo Session Manager:

```bash
sudo docker ps
sudo docker inspect --format='{{.State.Health.Status}}' api-filmes
sudo docker logs --tail 100 api-filmes
```

O endpoint de liveness só verifica o processo. O endpoint de readiness também
consulta o PostgreSQL e deve retornar 503 quando a dependência estiver indisponível.

## 8. Migrations em produção

O workflow executa, antes de trocar o processo da API:

```bash
docker run --rm \
  -e NODE_ENV=production \
  -e DATABASE_URL \
  IMAGEM npm run prisma:migrate:deploy
```

Não use `prisma migrate dev` nem `prisma migrate reset` em produção. Revise o SQL
de cada migration e faça backup antes de alterações destrutivas. Para bases que já
existiam fora deste repositório, faça introspecção e baseline antes do primeiro
`migrate deploy`.

## 9. Rollback

O workflow tenta restaurar automaticamente a imagem anterior se o health check
falhar. Para rollback manual, obtenha uma tag SHA no ECR e execute:

```bash
DATABASE_URL_PARAMETER=/api-filmes/production/database-url
DATABASE_URL=$(aws ssm get-parameter \
  --name "$DATABASE_URL_PARAMETER" \
  --with-decryption \
  --query Parameter.Value \
  --output text)
export DATABASE_URL

sudo docker pull IMAGEM:SHA
sudo docker rm -f api-filmes || true
sudo docker run -d \
  --name api-filmes \
  --restart unless-stopped \
  -p 80:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL \
  -e CORS_ORIGIN=https://app.exemplo.com \
  -e TRUST_PROXY=true \
  IMAGEM:SHA
```

O código antigo precisa ser compatível com o schema já migrado. Se não for, use
uma migration corretiva revisada; não tente desfazer DDL automaticamente durante o
incidente.

## 10. Diagnóstico

### Migration falha

```bash
sudo docker logs api-filmes
aws ssm get-parameter --name /api-filmes/production/database-url --with-decryption
```

Confirme DNS, security groups, TLS, usuário, senha e permissões no schema.

### `TargetNotConnected`

Confirme a role `AmazonSSMManagedInstanceCore`, o SSM Agent ativo e saída HTTPS.

### Imagem não baixa

Confira região, repositório e permissões ECR da role da EC2 e da identidade do
GitHub Actions.

### API inicia, mas readiness retorna 503

Verifique os logs, teste a resolução do endpoint PostgreSQL a partir da EC2 e
confirme que a migration terminou com sucesso.

### CORS bloqueia o frontend

Defina `CORS_ORIGIN` com a origem completa, incluindo esquema e porta. Para várias
origens, separe-as por vírgula.

## Segurança operacional

- não registre ou imprima `DATABASE_URL`;
- rotacione as credenciais do banco e as access keys;
- prefira OIDC, HTTPS com load balancer e Secrets Manager/Parameter Store;
- restrinja RDS e EC2 por security groups;
- mantenha backup, monitoração e alertas de custo;
- teste migrations e rollback em staging antes de produção.

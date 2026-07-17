# Integração da API de filmes com Amazon RDS PostgreSQL

Este guia parte do estado atual do repositório e descreve a integração do banco
PostgreSQL gerenciado pelo Amazon RDS com a API executada em Docker na EC2. Os
exemplos usam a região `us-east-1` e o nome `api-filmes-production`.

> O RDS pode gerar custos de instância, armazenamento, backup e tráfego. Antes de
> criar o banco, confira a estimativa apresentada pelo Console e a elegibilidade
> da sua conta ao Free Tier. Não presuma que um recurso será gratuito apenas por
> usar uma classe pequena.

## 1. O que já foi implementado no código

A integração da aplicação com PostgreSQL já existe. Não é necessário criar outro
repository, controller ou endpoint específico para o RDS: para a aplicação, o RDS
é um servidor PostgreSQL acessado pela variável `DATABASE_URL`.

As mudanças encontradas foram:

- a aplicação Express em `src/app.js` e `src/server.js` foi substituída por NestJS
  e TypeScript; o ponto de entrada atual é `src/main.ts`;
- `prisma/schema.prisma` configura o provider `postgresql` e o model `Filme`;
- `prisma/migrations/20260716000000_init/migration.sql` cria a tabela `filmes`, os
  índices de título e ano e a restrição do ano;
- `src/database/prisma.service.ts` abre a conexão na inicialização e a encerra no
  graceful shutdown;
- `src/modules/filmes/filmes.service.ts` executa todo o CRUD pelo Prisma;
- `src/config/environment.ts` torna `DATABASE_URL` obrigatória e valida o formato;
- `GET /health/ready` executa `SELECT 1` e só retorna sucesso quando o PostgreSQL
  está acessível;
- o `Dockerfile` contém Prisma Client, schema e migrations na imagem final;
- o workflow foi preparado para executar `prisma migrate deploy` antes de iniciar
  a nova versão da API.
- o workflow executa um seed idempotente com 12 filmes mockados depois das
  migrations e antes de iniciar a API.

A migration inicial cria:

```text
RDS PostgreSQL
└── banco api_filmes
    └── schema public
        ├── _prisma_migrations
        └── filmes
            ├── id
            ├── titulo
            ├── diretor
            ├── ano
            ├── genero
            ├── created_at
            └── updated_at
```

## 2. Arquitetura final

```text
GitHub Actions
  ├── executa CI, testes e build
  ├── publica a imagem no ECR
  └── envia o comando de deploy pelo SSM
                         │
                         ▼
EC2 Ubuntu + Docker + IAM Role
  ├── lê DATABASE_URL no Parameter Store
  ├── executa prisma migrate deploy
  └── inicia o contêiner api-filmes
                         │
                         │ TCP 5432 + TLS
                         ▼
Amazon RDS PostgreSQL privado
```

O GitHub Actions não deve conhecer a senha do banco. A chamada
`aws ssm get-parameter` é executada dentro da EC2 e usa as credenciais temporárias
da IAM Role associada à instância.

## 3. Valores que você deverá anotar

Preencha esta lista durante a configuração:

| Item                  | Valor esperado                                            |
| --------------------- | --------------------------------------------------------- |
| Região                | `us-east-1`                                               |
| ID da conta AWS       | `ACCOUNT_ID`                                              |
| VPC da EC2            | `vpc-...`                                                 |
| Security group da EC2 | `sg-...`                                                  |
| Security group do RDS | `sg-...`                                                  |
| Identificador do RDS  | `api-filmes-production`                                   |
| Banco PostgreSQL      | `api_filmes`                                              |
| Usuário administrador | `api_filmes_admin`                                        |
| Usuário da aplicação  | `api_filmes_app`                                          |
| Endpoint do RDS       | `api-filmes-production.xxxxx.us-east-1.rds.amazonaws.com` |
| Parâmetro seguro      | `/api-filmes/production/database-url`                     |
| IAM Role da EC2       | por exemplo `EC2ApiFilmesRole`                            |

Use sempre a mesma região da EC2, do RDS, do ECR e do Parameter Store.

## 4. Identificar a rede da EC2

1. Abra o Console AWS e selecione `us-east-1` no canto superior direito.
2. Abra **EC2 > Instances**.
3. Selecione a instância da API.
4. Na aba **Networking**, anote o campo **VPC ID**.
5. Na aba **Security**, anote o ID do security group da EC2.
6. Confirme que a instância está no estado **Running**.

O RDS e a EC2 devem estar na mesma VPC para esta configuração. Não use o IP
público da EC2 como origem da regra do banco.

## 5. Criar o security group do RDS

1. Abra **EC2 > Network & Security > Security Groups**.
2. Clique em **Create security group**.
3. Use o nome `api-filmes-rds-sg`.
4. Selecione exatamente a mesma VPC da EC2.
5. Em **Inbound rules**, adicione:

| Type       | Protocol | Port | Source                           |
| ---------- | -------- | ---: | -------------------------------- |
| PostgreSQL | TCP      | 5432 | security group da EC2 (`sg-...`) |

6. Não use `0.0.0.0/0`, `::/0` nem o seu IP residencial na porta 5432.
7. Mantenha a saída padrão e crie o security group.

Security groups são stateful. A resposta do RDS para uma conexão permitida não
exige uma regra de entrada adicional na EC2. Se você restringiu manualmente as
regras de saída da EC2, permita TCP/5432 da EC2 para o security group do RDS.

## 6. Conferir ou criar o DB subnet group

O RDS precisa de subnets em pelo menos duas Availability Zones, mesmo quando a
instância criada é Single-AZ.

1. Abra **RDS > Subnet groups**.
2. Se já existir um DB subnet group da VPC da EC2, ele pode ser reutilizado.
3. Caso não exista, clique em **Create DB subnet group**.
4. Nomeie como `api-filmes-db-subnet-group`.
5. Selecione a VPC da EC2.
6. Selecione pelo menos duas Availability Zones.
7. Em cada zona, selecione uma subnet, preferencialmente privada.
8. Crie o grupo.

Se estiver usando a VPC padrão, o Console pode disponibilizar o grupo
`default`. Ainda assim, confirme que ele pertence à mesma VPC da EC2.

## 7. Criar a instância RDS PostgreSQL

1. Abra **RDS > Databases**.
2. Clique em **Create database**.
3. Em **Database creation method**, escolha **Standard create**.
4. Em **Engine options**, escolha **PostgreSQL**.
5. Escolha PostgreSQL 17 para manter proximidade com o ambiente local definido no
   `docker-compose.yml`. Uma versão 14 ou superior também atende ao projeto, mas a
   versão exata disponível no Console pode mudar.
6. Em **Templates**, para estudo escolha **Free tier**, se essa opção aparecer como
   elegível para a sua conta; caso contrário, use **Dev/Test** e confira o custo.
7. Escolha uma implantação **Single DB instance/Single-AZ** para estudo. Produção
   crítica normalmente deve avaliar Multi-AZ.
8. Use o identificador `api-filmes-production`.
9. Em gerenciamento de credenciais, escolha **Self managed** para seguir o fluxo
   deste repositório com Parameter Store.
10. Use `api_filmes_admin` como master username.
11. Gere uma senha forte e exclusiva. Guarde-a temporariamente em um gerenciador
    de senhas; ela será usada para criar o usuário limitado da aplicação.
12. Em **DB instance class**, escolha uma classe pequena mostrada pelo Console,
    como `db.t4g.micro` ou `db.t3.micro`, somente se fizer sentido para sua conta.
13. Em armazenamento, mantenha `gp3` e o mínimo permitido pelo Console para este
    estudo. Ative storage autoscaling apenas depois de entender o limite e o custo.

Em **Connectivity**:

1. Escolha **Don't connect to an EC2 compute resource**, pois a rede será
   configurada explicitamente pelo security group criado neste guia.
2. Em **Virtual private cloud**, escolha a mesma VPC da EC2.
3. Em **DB subnet group**, escolha `api-filmes-db-subnet-group` ou o grupo válido
   que você conferiu.
4. Em **Public access**, marque **No**.
5. Em **VPC security group**, escolha **Choose existing**.
6. Remova o security group `default`, se não for necessário.
7. Selecione `api-filmes-rds-sg`.
8. Mantenha a porta `5432`.
9. Use autenticação por senha. IAM Database Authentication não é utilizada pelo
   código atual.

Em **Additional configuration**:

1. Em **Initial database name**, informe `api_filmes`. Esse campo é diferente do
   identificador da instância RDS.
2. Mantenha a criptografia de armazenamento habilitada.
3. Para um ambiente persistente, configure backups automáticos e retenção de pelo
   menos 7 dias. Para um estudo descartável, escolha conscientemente considerando
   o custo e a necessidade de recuperação.
4. Escolha uma janela de manutenção adequada.
5. Habilite **Deletion protection** se os dados não puderem ser apagados por erro.
6. Revise a estimativa de custo exibida pelo Console.
7. Clique em **Create database**.

Aguarde o status mudar para **Available**. A criação pode levar vários minutos.

## 8. Copiar o endpoint do RDS

1. Abra **RDS > Databases > api-filmes-production**.
2. Abra **Connectivity & security**.
3. Copie somente o valor de **Endpoint**.
4. Confirme que **Port** é `5432`.
5. Confirme que **Publicly accessible** está como **No**.
6. Confirme que `api-filmes-rds-sg` está associado.

Use o endpoint DNS, nunca um endereço IP. O endereço resolvido pode mudar em
manutenções e failovers.

## 9. Criar o usuário da aplicação

Não execute a API permanentemente com o master user. Crie um usuário dedicado que
será proprietário dos objetos criados pelas migrations.

### 9.1 Instalar o cliente PostgreSQL na EC2 Ubuntu

Abra **EC2 > Instances > sua instância > Connect > Session Manager > Connect** e
execute:

```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
psql --version
```

### 9.2 Testar DNS e porta

Substitua `ENDPOINT_RDS`:

```bash
getent hosts ENDPOINT_RDS
pg_isready -h ENDPOINT_RDS -p 5432 -d api_filmes
```

O `pg_isready` deve informar `accepting connections`. Se houver timeout, revise a
VPC e os security groups antes de continuar.

### 9.3 Entrar com o master user

```bash
psql "host=ENDPOINT_RDS port=5432 dbname=api_filmes user=api_filmes_admin sslmode=require"
```

Digite a senha do master user quando o `psql` solicitar. Não coloque a senha no
comando, pois ela ficaria no histórico do shell.

### 9.4 Criar o usuário

Dentro do prompt do `psql`, execute e substitua a senha de exemplo:

```sql
CREATE ROLE api_filmes_app
  WITH LOGIN
  PASSWORD 'SUBSTITUA_POR_UMA_SENHA_FORTE_E_EXCLUSIVA';

GRANT CONNECT ON DATABASE api_filmes TO api_filmes_app;
GRANT USAGE, CREATE ON SCHEMA public TO api_filmes_app;
```

A migration será executada como `api_filmes_app`; por isso, esse usuário criará e
será proprietário de `filmes` e `_prisma_migrations`. O fluxo simples atual usa o
mesmo usuário para migration e runtime. Separar esses usuários é um endurecimento
futuro que também exige separar as URLs no workflow.

Confira o usuário e saia:

```sql
\du api_filmes_app
\q
```

Se a senha contiver caracteres especiais, eles deverão ser percent-encoded na URL.
Por exemplo, `@` vira `%40`, `$` vira `%24` e `#` vira `%23`. Não altere a senha
real apenas por substituição manual sem conferir todos os caracteres.

## 10. Montar a `DATABASE_URL`

Use este formato em uma área segura e substitua os valores:

```text
postgresql://api_filmes_app:SENHA_URL_ENCODED@ENDPOINT_RDS:5432/api_filmes?schema=public&sslmode=require&connection_limit=5&connect_timeout=10&pool_timeout=10&application_name=api-filmes
```

Significado dos parâmetros:

| Parâmetro                     | Finalidade                              |
| ----------------------------- | --------------------------------------- |
| `schema=public`               | schema utilizado pelo Prisma            |
| `sslmode=require`             | recusa conexão sem TLS                  |
| `connection_limit=5`          | limita o pool do Prisma 6 por processo  |
| `connect_timeout=10`          | limita a espera para abrir uma conexão  |
| `pool_timeout=10`             | limita a espera por uma conexão do pool |
| `application_name=api-filmes` | identifica a aplicação no PostgreSQL    |

Cinco conexões é um ponto inicial conservador para uma única API em uma instância
RDS pequena. Ao criar mais contêineres, some os pools de todos os processos e ajuste
com base nas métricas do RDS.

O RDS PostgreSQL aceita TLS. Nas versões 15 ou superiores, `rds.force_ssl` é
habilitado por padrão. A URL usa `sslmode=require` explicitamente para que o Prisma
não faça fallback para uma conexão sem TLS.

## 11. Armazenar a URL no Parameter Store

Não coloque a `DATABASE_URL` no Git, em GitHub Variables ou diretamente no YAML.

1. Abra **Systems Manager > Application Management > Parameter Store**.
2. Clique em **Create parameter**.
3. Em **Name**, informe `/api-filmes/production/database-url`.
4. Em **Tier**, escolha **Standard**.
5. Em **Type**, escolha **SecureString**.
6. Em **KMS key source**, para o fluxo inicial use **My current account** e a chave
   AWS gerenciada `alias/aws/ssm`.
7. Em **Value**, cole a `DATABASE_URL` completa.
8. Não coloque a URL na descrição nem em tags.
9. Clique em **Create parameter**.

Para controle de acesso mais rígido, use futuramente uma customer managed KMS key.
Nesse caso, a IAM Role da EC2 precisará também de `kms:Decrypt` nessa chave e a key
policy deverá permitir a role.

## 12. Permitir que a EC2 leia o parâmetro

A permissão deve ser adicionada à IAM Role da EC2, não ao usuário IAM do GitHub.

1. Na página da EC2, abra a aba **Security** e clique no nome de **IAM Role**.
2. Em **Permissions**, clique em **Add permissions > Create inline policy**.
3. Abra a aba **JSON**.
4. Cole a política abaixo.
5. Substitua `ACCOUNT_ID` pelo ID da conta, sem hífens.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadApiFilmesDatabaseUrl",
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/api-filmes/production/database-url"
    }
  ]
}
```

Nomeie como `ReadApiFilmesDatabaseUrl` e salve.

Observe que o nome do parâmetro começa com `/`, mas no ARN aparece como:

```text
parameter/api-filmes/production/database-url
```

Se você escolheu uma customer managed KMS key, adicione outra declaração:

```json
{
  "Sid": "DecryptApiFilmesDatabaseUrl",
  "Effect": "Allow",
  "Action": "kms:Decrypt",
  "Resource": "ARN_DA_CHAVE_KMS",
  "Condition": {
    "StringEquals": {
      "kms:ViaService": "ssm.us-east-1.amazonaws.com"
    }
  }
}
```

Não remova `AmazonSSMManagedInstanceCore` nem as permissões ECR que já estão na
role.

## 13. Validar o Parameter Store a partir da EC2

Na sessão do Session Manager, valide primeiro apenas os metadados, sem imprimir a
senha:

```bash
aws ssm get-parameter \
  --region us-east-1 \
  --name /api-filmes/production/database-url \
  --query '{Name:Parameter.Name,Type:Parameter.Type,Version:Parameter.Version}' \
  --output table
```

Depois confirme que a descriptografia retorna um valor, novamente sem mostrá-lo:

```bash
DATABASE_URL="$(aws ssm get-parameter \
  --region us-east-1 \
  --name /api-filmes/production/database-url \
  --with-decryption \
  --query Parameter.Value \
  --output text)"

if [ "${#DATABASE_URL}" -gt 30 ]; then
  echo "DATABASE_URL recuperada com sucesso"
else
  echo "DATABASE_URL ausente ou inválida"
fi

unset DATABASE_URL
```

Não execute `echo "$DATABASE_URL"` e não ative `set -x` nesse fluxo.

## 14. Configurar o GitHub Environment

Abra o repositório no GitHub e acesse:

**Settings > Environments > production**

Mantenha os Secrets já usados para o deploy:

| Secret                  | Conteúdo                                          |
| ----------------------- | ------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | access key do usuário `github-actions-api-filmes` |
| `AWS_SECRET_ACCESS_KEY` | secret access key correspondente                  |

Crie ou confira estas Variables:

| Variable                 | Valor                                 |
| ------------------------ | ------------------------------------- |
| `AWS_REGION`             | `us-east-1`                           |
| `ECR_REPOSITORY`         | `api-filmes`                          |
| `EC2_INSTANCE_ID`        | ID da EC2 da API                      |
| `DATABASE_URL_PARAMETER` | `/api-filmes/production/database-url` |
| `CORS_ORIGIN`            | origem exata do frontend              |

`CORS_ORIGIN` é o endereço do frontend que chama a API pelo navegador, não o
endpoint do RDS. Se houver mais de uma origem, o código aceita valores separados
por vírgula.

### 14.1 Escopo das variáveis no workflow

O workflow mantém `DATABASE_URL_PARAMETER` e `CORS_ORIGIN` no `env` do passo
**Atualizar o contêiner na EC2 pelo Systems Manager**, que é onde elas são usadas.
Variáveis definidas no `env` de um step não são herdadas por outro step, por isso
esse escopo deve ser preservado.

Em `.github/workflows/deploy.yml`, o passo **Atualizar o contêiner na EC2 pelo
Systems Manager** deve conter:

```yaml
- name: Atualizar o contêiner na EC2 pelo Systems Manager
  env:
    AWS_REGION: ${{ vars.AWS_REGION }}
    EC2_INSTANCE_ID: ${{ vars.EC2_INSTANCE_ID }}
    REGISTRY: ${{ steps.login-ecr.outputs.registry }}
    ECR_REPOSITORY: ${{ vars.ECR_REPOSITORY }}
    IMAGE_TAG: ${{ github.sha }}
    DATABASE_URL_PARAMETER: ${{ vars.DATABASE_URL_PARAMETER }}
    CORS_ORIGIN: ${{ vars.CORS_ORIGIN }}
```

As duas variáveis não ficam no `env` do passo de build da imagem, pois não são
usadas nele. A senha e a URL completa não devem ser adicionadas ao GitHub.

## 15. Executar o primeiro deploy

Antes do deploy, confira:

- RDS com status **Available**;
- RDS e EC2 na mesma VPC;
- porta 5432 liberada no RDS somente a partir do security group da EC2;
- parâmetro `SecureString` criado;
- IAM Role da EC2 com `ssm:GetParameter`;
- Variables do GitHub preenchidas;
- ajuste de escopo das variáveis no workflow realizado;
- migrations presentes dentro de `prisma/migrations`.

Faça commit e push das alterações para `main`. O fluxo esperado é:

1. o job de CI instala dependências;
2. valida o schema e gera o Prisma Client;
3. executa lint, build, testes unitários e e2e;
4. constrói a imagem e publica no ECR;
5. envia um comando pelo Systems Manager;
6. a EC2 recupera e descriptografa a `DATABASE_URL`;
7. a EC2 baixa a imagem;
8. um contêiner efêmero executa `npm run prisma:migrate:deploy`;
9. a migration cria `_prisma_migrations` e `filmes`;
10. outro contêiner efêmero executa `npm run prisma:seed`;
11. o seed cria somente os filmes mockados ainda ausentes;
12. o contêiner da API inicia com `DATABASE_URL`;
13. o Docker consulta `/health/ready` até PostgreSQL e API estarem saudáveis.

O comando correto para produção já está no projeto:

```bash
npm run prisma:migrate:deploy
```

Não use em produção:

```bash
npx prisma migrate dev
npx prisma migrate reset
npx prisma db push
```

`migrate reset` apaga dados. `migrate dev` é voltado a desenvolvimento e pode
exigir shadow database. `migrate deploy` aplica somente as migrations pendentes.

## 16. Validar a aplicação após o deploy

Substitua `ENDERECO_API` pelo IP ou domínio público da API:

```bash
curl -i http://ENDERECO_API/health/live
curl -i http://ENDERECO_API/health/ready
curl -i http://ENDERECO_API/filmes
```

Cadastre um filme:

```bash
curl -i -X POST http://ENDERECO_API/filmes \
  -H 'Content-Type: application/json' \
  -d '{
    "titulo": "Central do Brasil",
    "diretor": "Walter Salles",
    "ano": 1998,
    "genero": "Drama"
  }'
```

Liste novamente e confirme que o registro continua existindo depois de um novo
deploy:

```bash
curl -i http://ENDERECO_API/filmes
```

Na EC2, confira o contêiner:

```bash
sudo docker ps
sudo docker inspect --format='{{.State.Health.Status}}' api-filmes
sudo docker logs --tail 100 api-filmes
```

Você deve encontrar no log a mensagem de conexão com PostgreSQL estabelecida, mas
nunca a URL nem a senha.

## 17. Conferir as migrations sem expor a senha

Na EC2, recupere a URL e use a própria imagem para consultar o status do Prisma:

```bash
DATABASE_URL="$(aws ssm get-parameter \
  --region us-east-1 \
  --name /api-filmes/production/database-url \
  --with-decryption \
  --query Parameter.Value \
  --output text)"

IMAGE="$(sudo docker inspect --format='{{.Config.Image}}' api-filmes)"

sudo docker run --rm \
  -e NODE_ENV=production \
  -e DATABASE_URL="$DATABASE_URL" \
  "$IMAGE" \
  npx prisma migrate status

unset DATABASE_URL
```

O resultado esperado informa que o schema está atualizado.

## 18. Como criar novas migrations

Faça alterações de schema somente no ambiente de desenvolvimento:

1. inicie o PostgreSQL local;
2. altere `prisma/schema.prisma`;
3. gere uma migration nomeada;
4. revise cuidadosamente o SQL criado;
5. execute testes;
6. faça commit do schema e da pasta da migration.

```bash
docker compose up -d postgres
npm run prisma:migrate:dev -- --name nome_da_alteracao
npm run prisma:generate
npm run lint
npm run build
npm test
npm run test:e2e
```

No deploy, o workflow executará `prisma migrate deploy` e, depois, o seed
idempotente. Migrations destrutivas devem ser precedidas de backup e desenhadas
para compatibilidade entre a versão antiga e a nova da API. O rollback da imagem
não desfaz o schema do banco.

## 19. Troubleshooting

### `DATABASE_URL_PARAMETER: unbound variable`

As Variables estão no step errado do GitHub Actions. Faça o ajuste da seção 14.1
e gere um novo commit. Reexecutar um run antigo utiliza o workflow daquele commit.

### `AccessDeniedException` em `ssm:GetParameter`

- confirme que a permissão foi adicionada à IAM Role da EC2;
- confira região, conta e ARN do parâmetro;
- confirme que o parâmetro existe em `us-east-1`;
- se usa KMS própria, confira `kms:Decrypt` e a key policy.

### Timeout, `P1001` ou `Can't reach database server`

- confirme que EC2 e RDS estão na mesma VPC;
- confirme que o RDS está **Available**;
- confira o endpoint e a porta;
- no RDS SG, use como source o SG da EC2;
- confira regras de saída restritivas da EC2;
- execute `pg_isready` a partir da EC2.

### Erro de autenticação ou `P1000`

- confira usuário e senha;
- confirme que a senha foi percent-encoded na URL;
- confirme o nome do banco `api_filmes`;
- atualize o valor do SecureString depois de corrigir;
- não gere uma nova access key da AWS: ela não é a credencial PostgreSQL.

### `permission denied for schema public`

Entre como master user e execute novamente:

```sql
GRANT CONNECT ON DATABASE api_filmes TO api_filmes_app;
GRANT USAGE, CREATE ON SCHEMA public TO api_filmes_app;
```

### `no pg_hba.conf entry ... SSL off`

Confirme que a URL contém `sslmode=require`. No RDS você não edita diretamente o
arquivo `pg_hba.conf`.

### Migration falha porque o schema não está vazio

Não execute `migrate reset`. Se o banco já possuía tabelas, pare o deploy, faça
backup, introspecção e baseline da migration antes de continuar.

### API fica `unhealthy`

```bash
sudo docker logs --tail 200 api-filmes
sudo docker inspect --format='{{json .State.Health}}' api-filmes
```

Como o health check consulta `/health/ready`, indisponibilidade ou credenciais
inválidas do RDS também deixam o contêiner unhealthy.

## 20. Backup, rotação e custos

- mantenha backups automáticos e teste uma restauração;
- antes de migration destrutiva, gere um snapshot manual;
- monitore `DatabaseConnections`, CPU, armazenamento e latência no CloudWatch;
- configure AWS Budgets e alertas de cobrança;
- rotacione separadamente a senha PostgreSQL e as access keys do GitHub;
- ao trocar a senha, atualize o `SecureString` e faça novo deploy;
- pare o RDS apenas temporariamente: a AWS reinicia automaticamente uma instância
  parada depois de 7 dias e continua cobrando armazenamento e backups;
- para excluir definitivamente o RDS, desative deletion protection, avalie criar
  um snapshot final e depois remova também snapshots manuais que não serão usados;
- remova o Parameter Store e o security group apenas depois de confirmar que não
  há outro consumidor.

## 21. Checklist final

- [ ] PostgreSQL RDS criado em `us-east-1`.
- [ ] RDS e EC2 estão na mesma VPC.
- [ ] RDS não possui acesso público.
- [ ] Porta 5432 aceita somente o security group da EC2.
- [ ] Banco `api_filmes` foi criado.
- [ ] Usuário `api_filmes_app` foi criado e recebeu acesso ao schema.
- [ ] `DATABASE_URL` usa endpoint DNS, TLS e senha percent-encoded.
- [ ] URL foi salva como `SecureString`.
- [ ] IAM Role da EC2 possui `ssm:GetParameter`.
- [ ] `DATABASE_URL_PARAMETER` foi cadastrada no Environment `production`.
- [ ] Variáveis foram movidas para o step SSM do workflow.
- [ ] `prisma migrate deploy` terminou com sucesso.
- [ ] `prisma:seed` terminou com sucesso e criou os 12 filmes mockados.
- [ ] `/health/ready` responde 200.
- [ ] CRUD persiste dados depois de redeploy.
- [ ] Backups e alertas de custo foram configurados.

## Referências oficiais

- [Criar uma instância RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html)
- [Criar e conectar ao RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html)
- [Controlar acesso ao RDS com security groups](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-groups.html)
- [Usar RDS dentro de uma VPC](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html)
- [Usar SSL com RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)
- [Criptografia de SecureString no Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html)
- [Prisma PostgreSQL e parâmetros da URL](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql)
- [Aplicar migrations em produção com Prisma](https://docs.prisma.io/docs/cli/migrate/deploy)
- [Parar temporariamente uma instância RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html)
- [Excluir uma instância RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_DeleteInstance.html)

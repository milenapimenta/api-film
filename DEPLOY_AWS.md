# Deploy da API na AWS EC2 com GitHub Actions

Este guia configura CI/CD para o repositório `milenapimenta/api-film` usando:

- GitHub Actions para testar, construir e implantar;
- Docker para empacotar a API;
- Amazon ECR para armazenar as imagens Docker;
- Amazon EC2 com Amazon Linux 2023 para executar o contêiner;
- AWS Systems Manager Run Command para executar o deploy sem SSH;
- `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` nos GitHub Secrets.

> **Importante:** a API atual guarda os filmes apenas na memória. Todo reinício ou
> deploy apaga os registros cadastrados. Para dados permanentes, será necessário
> adicionar um banco como PostgreSQL/RDS ou DynamoDB.

## 1. Entenda o fluxo

Em pull requests para `main`, o GitHub Actions instala as dependências e executa
os testes. Em cada push na `main`, depois dos testes:

1. o GitHub Actions cria uma imagem Docker;
2. publica a imagem no ECR com as tags do SHA do commit e `latest`;
3. envia um comando para a EC2 pelo Systems Manager;
4. a EC2 baixa a imagem identificada pelo SHA;
5. substitui o contêiner e aguarda o health check;
6. se o health check falhar, tenta iniciar a imagem anterior e marca o workflow
   como falho.

Nenhuma chave SSH é usada pelo workflow. As chaves AWS de longa duração são
usadas somente pelo job de deploy e devem pertencer a um usuário IAM exclusivo.

## 2. Pré-requisitos e nomes usados

Você precisa de:

- uma conta AWS;
- permissão para criar ECR, IAM, EC2 e security groups;
- o projeto enviado ao GitHub;
- a branch principal chamada `main`.

Escolha uma única região e use-a em todos os recursos. Os exemplos consideram:

| Item | Valor de exemplo |
|---|---|
| Região | `us-east-1` |
| Repositório ECR | `api-filmes` |
| Role da EC2 | `EC2ApiFilmesRole` |
| Usuário do GitHub Actions | `github-actions-api-filmes` |
| Nome do contêiner | `api-filmes` |
| Porta pública | `80` |
| Porta da aplicação | `3000` |

Anote estes valores:

- `REGION`: `us-east-1`;
- `ACCOUNT_ID`: `xxxxxxxxxxx`;
- `INSTANCE_ID`: `x-xxxxxxxx`.

## 3. Valide a imagem localmente

O projeto contém:

- `Dockerfile`: gera uma imagem Node.js de produção e define o health check;
- `.dockerignore`: evita enviar arquivos desnecessários ao build;
- `.github/workflows/deploy.yml`: executa CI e CD.

Execute:

```bash
npm ci
npm test
docker build -t api-filmes:local .
docker run --rm -d --name api-filmes-local -p 3000:3000 api-filmes:local

until [ "$(docker inspect --format='{{.State.Health.Status}}' api-filmes-local)" = "healthy" ]; do
  sleep 1
done

curl http://localhost:3000/
docker rm -f api-filmes-local
```

A resposta esperada é:

```json
{"mensagem":"API de filmes funcionando!"}
```

Se o contêiner não ficar saudável, abra outro terminal:

```bash
docker inspect --format='{{.State.Health.Status}}' api-filmes-local
docker logs api-filmes-local
```

O aviso `The legacy builder is deprecated` não representa falha. No Ubuntu 22.04
desta máquina, instale o Buildx com:

```bash
sudo apt update
sudo apt install -y docker-buildx
docker buildx version
```

## 4. Crie o repositório no Amazon ECR

1. Abra o Console AWS e pesquise por **Elastic Container Registry**.
2. Entre em **Private registry > Repositories**.
3. Clique em **Create repository**.
4. Em **Repository name**, informe `api-filmes`.
5. Mantenha o repositório privado.
6. Ative **Scan on push**, se essa opção estiver disponível.
7. Em **Image tag mutability**, mantenha `Mutable`, pois o workflow atualiza a
   tag `latest`. Cada deploy também cria uma tag com o SHA do commit.
8. Clique em **Create repository**.

Copie o URI apresentado, semelhante a:

```text
123456789012.dkr.ecr.us-east-1.amazonaws.com/api-filmes
```
881424867073.dkr.ecr.us-east-1.amazonaws.com/api-filmes

### Limpeza opcional de imagens antigas

Para limitar o armazenamento:

1. abra o repositório `api-filmes`;
2. entre em **Lifecycle policy**;
3. crie uma regra para expirar imagens quando a quantidade for maior que 10 ou 20;
4. revise a prévia e salve.

Não apague imediatamente a imagem anterior, pois ela pode ser usada durante um
rollback de falha.

## 5. Crie a role da EC2

A EC2 não recebe as access keys do GitHub. Ela usa uma IAM Role própria e
credenciais temporárias fornecidas automaticamente pela AWS.

### 5.1 Crie a role

1. Abra **IAM > Roles**.
2. Clique em **Create role**.
3. Escolha **AWS service**.
4. Em **Use case**, escolha **EC2**.
5. Pesquise e marque `AmazonSSMManagedInstanceCore`.
6. Nomeie a role como `EC2ApiFilmesRole`.
7. Conclua a criação.

Essa política permite que a instância apareça como um nó gerenciado no Systems
Manager e receba comandos.

### 5.2 Permita que a EC2 baixe imagens do ECR

1. Abra a role `EC2ApiFilmesRole`.
2. Entre em **Permissions > Add permissions > Create inline policy**.
3. Selecione **JSON**.
4. Cole a política, substituindo `REGION` e `ACCOUNT_ID`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PullApiFilmesImage",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "arn:aws:ecr:REGION:ACCOUNT_ID:repository/api-filmes"
    }
  ]
}
```

5. Nomeie a política como `ECRPullApiFilmes` e salve.

## 6. Crie a instância EC2

1. Abra **EC2 > Instances** e clique em **Launch instances**.
2. Nomeie como `api-filmes-production`.
3. Escolha a AMI **Amazon Linux 2023**, arquitetura `64-bit (x86)`.
4. Escolha um tipo como `t3.micro`. Confira no Console se existe elegibilidade à
   modalidade gratuita para a sua conta e região.
5. Como a administração será pelo Systems Manager, não é obrigatório selecionar
   um key pair. Uma chave de emergência é opcional e não será usada pelo workflow.
6. Use uma subnet pública com atribuição de IP público.
7. Crie o security group `api-filmes-sg` com esta entrada:

| Tipo | Protocolo | Porta | Origem |
|---|---|---:|---|
| HTTP | TCP | 80 | `0.0.0.0/0` |

Não abra a porta 3000. O Docker mapeará a porta 80 da EC2 para a porta 3000 do
contêiner. Não abra a porta 22 se for administrar somente pelo Systems Manager.

8. Mantenha a saída liberada. A instância precisa acessar HTTPS/443 para falar
   com SSM, ECR e baixar as camadas da imagem.
9. Em armazenamento, 8 GiB `gp3` são suficientes para este estudo.
10. Abra **Advanced details**.
11. Em **IAM instance profile**, selecione `EC2ApiFilmesRole`.
12. Em **User data**, cole:

```bash
#!/bin/bash
set -Eeuo pipefail

dnf update -y
dnf install -y docker
systemctl enable --now docker
systemctl enable --now amazon-ssm-agent
usermod -aG docker ec2-user
```

13. Clique em **Launch instance**.

O Amazon Linux 2023 fornece AWS CLI v2 e normalmente traz o SSM Agent. O user
data instala Docker e inicia os serviços necessários.

### 6.1 Use um IP estático

O IP público automático pode mudar quando a instância é parada e iniciada.

1. Abra **EC2 > Network & Security > Elastic IP addresses**.
2. Clique em **Allocate Elastic IP address**.
3. Selecione o endereço criado.
4. Clique em **Actions > Associate Elastic IP**.
5. Escolha a instância `api-filmes-production`.

Anote o endereço. A AWS cobra por endereços IPv4 públicos, inclusive Elastic IPs.
Libere-o quando encerrar o estudo.

### 6.2 Confirme o Systems Manager e o Docker

Aguarde alguns minutos após o primeiro boot.

1. Na instância, abra **Connect > Session Manager**.
2. Confirme que o botão **Connect** está disponível.
3. Abra a sessão e execute:

```bash
sudo systemctl status amazon-ssm-agent --no-pager
sudo systemctl status docker --no-pager
aws --version
docker --version
```

Os serviços devem aparecer como `active (running)`. Anote o `INSTANCE_ID` na
página da instância.

Se a instância não aparecer no Systems Manager, confira a role, a saída HTTPS da
rede e o status do SSM Agent.

## 7. Crie o usuário IAM do GitHub Actions

> Não use credenciais da conta root nem reutilize uma chave de administrador.
> Crie um usuário exclusivo, sem senha de Console.

### 7.1 Crie o usuário

1. Abra **IAM > Users > Create user**.
2. Use o nome `github-actions-api-filmes`.
3. Não habilite acesso ao AWS Management Console.
4. Conclua a criação.

### 7.2 Adicione a política mínima de deploy

1. Abra o usuário criado.
2. Entre em **Permissions > Add permissions > Create inline policy**.
3. Selecione **JSON**.
4. Cole a política abaixo e substitua todos os placeholders:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PushApiFilmesImage",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
        "ecr:BatchGetImage"
      ],
      "Resource": "arn:aws:ecr:REGION:ACCOUNT_ID:repository/api-filmes"
    },
    {
      "Sid": "SendDeployCommand",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:REGION::document/AWS-RunShellScript",
        "arn:aws:ec2:REGION:ACCOUNT_ID:instance/INSTANCE_ID"
      ]
    },
    {
      "Sid": "ReadDeployCommandResult",
      "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation",
      "Resource": "*"
    }
  ]
}
```

Exemplo de substituição:

```text
REGION      -> us-east-1
ACCOUNT_ID  -> 123456789012
INSTANCE_ID -> i-0123456789abcdef0
```

5. Nomeie a política como `GitHubActionsDeployApiFilmes` e salve.

### 7.3 Gere a access key

1. Abra **Security credentials** no usuário.
2. Em **Access keys**, clique em **Create access key**.
3. Escolha o caso de uso para aplicação executada fora da AWS.
4. Confirme o aviso exibido pela AWS.
5. Use a descrição `GitHub Actions api-film`.
6. Crie e copie imediatamente:
   - **Access key ID**;
   - **Secret access key**.

A secret é exibida apenas nessa criação. Não coloque esses valores no código,
`.env`, commits, issues, logs ou mensagens. Se houver exposição, desative e
substitua a chave.

## 8. Configure o GitHub

Abra:

```text
https://github.com/milenapimenta/api-film
```

### 8.1 Crie o Environment `production`

1. Entre em **Settings > Environments**.
2. Clique em **New environment**.
3. Use exatamente `production`.
4. Opcionalmente, configure aprovação manual e restrinja o deploy à `main`.

O workflow declara `environment: production`, por isso o nome deve coincidir.

### 8.2 Cadastre os Secrets

Dentro de `production`, crie:

| Nome | Conteúdo |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access key ID do usuário `github-actions-api-filmes` |
| `AWS_SECRET_ACCESS_KEY` | Secret access key correspondente |

### 8.3 Cadastre as Variables

Dentro do mesmo Environment, crie:

| Nome | Exemplo | Descrição |
|---|---|---|
| `AWS_REGION` | `us-east-1` | Mesma região de ECR e EC2 |
| `ECR_REPOSITORY` | `api-filmes` | Apenas o nome, não o URI completo |
| `EC2_INSTANCE_ID` | `i-0123456789abcdef0` | ID da EC2 de produção |

Valores não sensíveis ficam em Variables; as credenciais ficam somente em
Secrets.

## 9. Envie os arquivos para o GitHub

Confira antes de enviar:

```bash
git status
git diff -- Dockerfile .dockerignore .github/workflows/deploy.yml DEPLOY_AWS.md README.md
```

Depois faça commit e push:

```bash
git add Dockerfile .dockerignore .github/workflows/deploy.yml DEPLOY_AWS.md README.md
git commit -m "configura deploy da API na AWS EC2"
git push origin main
```

Não adicione nenhum arquivo contendo as chaves AWS.

## 10. Acompanhe o primeiro deploy

1. No GitHub, abra **Actions**.
2. Entre em **CI/CD - API de filmes**.
3. O job **Testes** executará primeiro.
4. Depois, o job **Deploy em produção** irá:
   - autenticar na AWS;
   - entrar no ECR;
   - fazer build e push das tags SHA e `latest`;
   - enviar o comando SSM;
   - aguardar o health check da API.
5. Se configurou aprovação no Environment, aprove o job quando solicitado.

Ao concluir, teste usando o Elastic IP ou o IP público atual:

```bash
curl http://SEU_IP_PUBLICO/
curl http://SEU_IP_PUBLICO/filmes
```

Cadastre um filme:

```bash
curl -X POST http://SEU_IP_PUBLICO/filmes \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Cidade de Deus",
    "diretor": "Fernando Meirelles",
    "ano": 2002,
    "genero": "Drama"
  }'
```

## 11. Confirme o deploy na EC2

Abra uma sessão pelo Session Manager e execute:

```bash
sudo docker ps
sudo docker inspect --format='{{.State.Health.Status}}' api-filmes
sudo docker logs --tail 100 api-filmes
curl http://127.0.0.1/
```

O contêiner deve aparecer como `Up` e o health status como `healthy`.

Para ver a imagem em execução:

```bash
sudo docker inspect --format='{{.Config.Image}}' api-filmes
```

A tag deve ser o SHA do commit mostrado no workflow.

## 12. Como funciona um novo deploy

Altere o projeto e envie um commit para `main`:

```bash
npm test
git add .
git commit -m "descreva a alteração"
git push origin main
```

O workflow executará novamente. O `concurrency` impede dois deploys de produção
simultâneos. A tag SHA identifica exatamente a versão em execução.

## 13. Deploy manual e rollback

Para disparar manualmente:

1. abra **Actions > CI/CD - API de filmes**;
2. clique em **Run workflow**;
3. selecione `main` e confirme.

Para voltar a uma imagem antiga, encontre no ECR a tag SHA desejada e execute na
EC2 pelo Session Manager, substituindo os valores:

```bash
AWS_REGION=us-east-1
ACCOUNT_ID=123456789012
IMAGE_TAG=SHA_DO_COMMIT
REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE="$REGISTRY/api-filmes:$IMAGE_TAG"

aws ecr get-login-password --region "$AWS_REGION" \
  | sudo docker login --username AWS --password-stdin "$REGISTRY"

sudo docker pull "$IMAGE"
sudo docker rm -f api-filmes || true
sudo docker run -d \
  --name api-filmes \
  --restart unless-stopped \
  -p 80:3000 \
  -e NODE_ENV=production \
  "$IMAGE"
```

Valide:

```bash
sudo docker inspect --format='{{.State.Health.Status}}' api-filmes
curl http://127.0.0.1/
```

## 14. Erros comuns

### `InvalidClientTokenId` ou `SignatureDoesNotMatch`

- confira os nomes dos GitHub Secrets;
- verifique se o ID e a secret pertencem ao mesmo par;
- confirme que a chave está ativa no IAM;
- se a secret foi copiada incorretamente, crie uma nova chave.

### `AccessDeniedException` no ECR

- confira `REGION`, `ACCOUNT_ID` e o repositório na política IAM;
- confirme que `ECR_REPOSITORY` contém somente `api-filmes`;
- verifique se ECR e workflow estão na mesma região;
- confirme as ações de upload e `ecr:GetAuthorizationToken`.

### `AccessDeniedException` no `ssm:SendCommand`

- confira o ARN da instância e o ARN do documento na política;
- confirme que `EC2_INSTANCE_ID` é a instância autorizada;
- verifique se a região é a mesma da EC2.

### `TargetNotConnected`

- confirme que `EC2ApiFilmesRole` está associada à EC2;
- confirme a política `AmazonSSMManagedInstanceCore`;
- verifique `systemctl status amazon-ssm-agent`;
- confirme que a instância consegue sair pela porta 443.

### `Cannot connect to the Docker daemon`

Na EC2:

```bash
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager
```

### O comando SSM retorna `Failed`

O workflow imprime `STDOUT` e `STDERR`. Também é possível abrir:

```text
AWS Console > Systems Manager > Run Command > Command history
```

### A API funciona na EC2, mas não pelo IP público

- confirme `docker ps` e o mapeamento `0.0.0.0:80->3000/tcp`;
- confira HTTP/80 no security group;
- confirme que a subnet possui rota para Internet Gateway;
- verifique o IP público ou Elastic IP utilizado.

## 15. Segurança e próximos passos

Uma API pública real ainda precisa de:

- banco de dados persistente;
- autenticação e autorização;
- HTTPS com domínio, certificado e ALB ou proxy reverso;
- proteção da branch `main` e revisão de pull requests;
- aprovação no Environment `production`;
- logs e alertas no CloudWatch;
- rotação periódica da access key;
- orçamento e alertas de custo;
- atualização das Actions e da imagem base Node.js.

Como este fluxo usa credenciais de longa duração, mantenha a política IAM restrita
e rotacione as chaves. Ao encerrar o estudo, exclua ou desative a access key e
remova ECR, EC2, volumes e Elastic IP para evitar custos.

## Referências oficiais

- [Gerenciar access keys de usuários IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
- [Permissões para publicar imagens no ECR](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push-iam.html)
- [Instalar Docker no Amazon Linux 2023](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-container-image.html)
- [Configurar permissões da instância para Systems Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-permissions.html)
- [Usar `SendCommand` com AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/example_ssm_SendCommand_section.html)
- [Secrets no GitHub Actions](https://docs.github.com/en/actions/reference/security/secrets)
- [Environments e proteções de deploy](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Action oficial para credenciais AWS](https://github.com/aws-actions/configure-aws-credentials)
- [Action oficial para login no ECR](https://github.com/aws-actions/amazon-ecr-login)

# Lok’nite Class System

Painel interno para organizar as classes, skills, cartas e keywords do Lok’nite. A versão web preserva o Dashboard, a Class Matrix, a Database, a Card Gallery e a Keyword List. As mudanças são salvas num workspace compartilhado.

## Rodar localmente

Com Docker Compose e Node.js 22 ou superior no terminal:

```sh
docker compose up --build --wait
node scripts/import-vault.mjs ../lokniteclasssystem/LCS_VAULT http://127.0.0.1:8788
```

Abra [127.0.0.1:8788](http://127.0.0.1:8788). Importe o Vault uma vez. O volume `loknite-data` preserva o banco entre reinícios. A porta do Compose fica disponível somente na máquina local, com identidade de desenvolvimento.

Para desenvolvimento sem Docker:

```sh
npm ci
npm run build
npm run dev -- --ip 127.0.0.1 --port 8788
```

Execute a importação em outro terminal. A pasta de origem deve conter o par `vault.json` e `cardvault.json` da mesma revisão e o diretório `media_vault`. O importador lê a origem e envia os dados ao site. Use o Vault mais recente da equipe na migração definitiva.

## Publicar no Cloudflare

O projeto usa **Cloudflare Workers com Static Assets e Durable Objects SQLite**. O endereço `.workers.dev` dispensa a compra de domínio. Workers, SQLite e Access podem operar no plano Free dentro dos limites de uso. [Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Cloudflare Access](https://www.cloudflare.com/sase/products/access/)

Em **Workers Builds**, conecte o repositório privado `Runic-Wolf/loknite-class-system-website` ao Worker `loknite-class-system-website`. Configure a branch de produção e o build:

| Campo | Valor |
| --- | --- |
| Diretório raiz | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:cloudflare` |

O build gera `dist/`. O Wrangler usa `wrangler.jsonc` para publicar os arquivos, o backend e o Durable Object no mesmo Worker. A migração inicial do SQLite roda na primeira utilização. Para um deploy manual a partir de um checkout do repositório privado, use `npm ci`, `npm run build`, `npx wrangler login` e `npm run deploy:cloudflare`. [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

### Login da equipe

1. Ative Cloudflare Zero Trust no plano Free. No Worker, abra **Access** e proteja a produção. No Zero Trust, limite a política **Allow** aos e-mails da equipe. É possível usar PIN por e-mail como método de login.
2. Em **Settings → Variables and Secrets**, preencha os valores abaixo. O gateway valida o token antes de entregar a interface, as imagens e a API.

| Variável | Valor |
| --- | --- |
| `ACCESS_TEAM` | Prefixo do domínio Zero Trust `<equipe>.cloudflareaccess.com` |
| `ACCESS_AUDIENCE` | Application Audience (AUD) do app Access |
| `LCS_TEAM_EMAILS` | E-mails com acesso, separados por vírgula |
| `VAULT_ADMIN_EMAILS` | E-mails administradores, separados por vírgula e presentes na lista da equipe |

3. Confira no navegador o login de um e-mail autorizado e o bloqueio de um visitante sem sessão. A conta de desenvolvimento é ativada pelo comando local e funciona em loopback. [Configuração de Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

### Importação inicial em produção

A importação requer uma sessão do Access com e-mail administrador. No PowerShell, obtenha o token pelo `cloudflared` e passe-o ao processo por variável de ambiente:

```powershell
$lokniteUrl = 'https://loknite-class-system-website.SEUSUBDOMINIO.workers.dev'
$env:LCS_ACCESS_TOKEN = cloudflared access token -app=$lokniteUrl
try {
  node scripts/import-vault.mjs C:/caminho/LCS_VAULT $lokniteUrl
} finally {
  Remove-Item Env:LCS_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
```

A importação inicial valida o par, as referências e os arquivos antes de aceitar o workspace. Para migrar a equipe, compare as contagens de classes e cartas, faça uma edição de teste e reabra o site. [Autenticação CLI do Access](https://developers.cloudflare.com/cloudflare-one/tutorials/cli/)

## Arquitetura

- `app/` contém o renderer reaproveitado do desktop, os assets oficiais e o bridge HTTP do navegador.
- `server/api.js` recebe alterações por coleção e ações explícitas para exclusão, confirmação e restauração. O serviço de domínio preserva os 315 slots, a criação de uma carta rascunho por skill e o bloqueio de gameplay confirmado.
- `server/repository.js` grava as linhas alteradas e a revisão na mesma transação SQLite. As escritas verificam a revisão de origem e retornam HTTP 409 em caso de conflito.
- `migrations/` contém as tabelas de classes, skills, cartas, keywords, tags, vínculos, consultas, preferências, revisões e mídia. Campos extensíveis ficam junto ao registro correspondente. Imagens importadas são guardadas como binários em blocos SQLite.
- `GET /api/v1/exports` baixa o par JSON da mesma revisão. `/exports/vault` e `/exports/cardvault` servem os formatos do desktop separadamente. Backups administráveis pelo app guardam o par e referenciam a mídia persistida no banco.

A migração é unidirecional. Após passar para a web, a equipe edita o workspace do site e exporta JSON quando precisar.

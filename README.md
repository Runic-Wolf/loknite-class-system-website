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

O projeto usa **Cloudflare Workers com Static Assets e Durable Objects SQLite**. O endereço `.workers.dev` dispensa a compra de domínio. Workers e SQLite podem operar no plano Free dentro dos limites de uso. O login por chave é gerenciado pelo próprio site. [Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Para publicar direto do checkout, use `npm ci`, `npm run build`, `npx wrangler login` e `npm run deploy:cloudflare`. Se usar **Workers Builds** depois, conecte o Worker `loknite-class-system-website` a um repositório privado e use estes campos:

| Campo | Valor |
| --- | --- |
| Diretório raiz | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:cloudflare` |

O build gera `dist/`. O Wrangler usa `wrangler.jsonc` para publicar os arquivos, o backend e o Durable Object no mesmo Worker. A migração inicial do SQLite roda na primeira utilização. [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

### Login da equipe

Cada pessoa entra com seu e-mail e uma chave individual. No checkout usado para publicar, execute:

```sh
npm run team:access -- add administrador@equipe.example --admin
npm run team:access -- add pessoa@equipe.example
```

O comando envia os hashes das chaves ao Worker como secrets e informa o caminho de um arquivo local com a chave individual. Entregue cada chave em particular à pessoa cadastrada. O registro de administração fica em `%LOCALAPPDATA%/Loknite Class System/team-access` no Windows e `~/.config/loknite-team-access` em outros sistemas. O registro é necessário para administrar a lista e deve ficar fora do checkout. A sessão dura até 12 horas.

Use `npm run team:access -- rotate <email>` para trocar uma chave ou `npm run team:access -- revoke <email>` para cancelar o acesso. As duas operações também invalidam as sessões daquela conta.

Cloudflare Access continua disponível como opção. Para usá-lo, configure uma aplicação Access para o Worker e defina `ACCESS_TEAM`, `ACCESS_AUDIENCE`, `LCS_TEAM_EMAILS` e `VAULT_ADMIN_EMAILS` nas variáveis do Worker. [Configuração do Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

### Importação inicial em produção

Use uma chave administrativa no último argumento:

```powershell
node scripts/import-vault.mjs C:/caminho/LCS_VAULT https://loknite-class-system-website.SEUSUBDOMINIO.workers.dev C:/caminho/chave-admin.json
```

A importação valida o par, as referências e os arquivos antes de aceitar o workspace. Para migrar a equipe, compare as contagens de classes e cartas, faça uma edição de teste e reabra o site.

## Arquitetura

- `app/` contém o renderer reaproveitado do desktop, os assets oficiais e o bridge HTTP do navegador.
- `server/api.js` recebe alterações por coleção e ações explícitas para exclusão, confirmação e restauração. O serviço de domínio preserva os 315 slots, a criação de uma carta rascunho por skill e o bloqueio de gameplay confirmado.
- `server/repository.js` grava as linhas alteradas e a revisão na mesma transação SQLite. As escritas verificam a revisão de origem e retornam HTTP 409 em caso de conflito.
- `migrations/` contém as tabelas de classes, skills, cartas, keywords, tags, vínculos, consultas, preferências, revisões e mídia. Campos extensíveis ficam junto ao registro correspondente. Imagens importadas são guardadas como binários em blocos SQLite.
- `GET /api/v1/exports` baixa o par JSON da mesma revisão. `/exports/vault` e `/exports/cardvault` servem os formatos do desktop separadamente. Backups administráveis pelo app guardam o par e referenciam a mídia persistida no banco.

A migração é unidirecional. Após passar para a web, a equipe edita o workspace do site e exporta JSON quando precisar.

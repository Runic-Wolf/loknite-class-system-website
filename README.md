# Lok’nite Class System

Painel interno para organizar as classes, skills, cartas e keywords do Lok’nite. A versão web preserva o Dashboard, a Class Matrix, a Database, a Card Gallery e a Keyword List. As mudanças são salvas num workspace compartilhado.

## Rodar localmente

Com Docker Compose e Node.js 22 ou superior no terminal:

```sh
docker compose up --build --wait
node scripts/import-vault.mjs ./seed http://127.0.0.1:8788
```

Abra [127.0.0.1:8788](http://127.0.0.1:8788). O primeiro import cria o workspace de demonstração da revisão 2008; o importador recusa substituir um Vault existente. Para iniciar com o conteúdo atual da equipe, use a pasta `LCS_VAULT` do checkout desktop no lugar de `./seed`.

O banco é **SQLite no Durable Object `LokniteVault`**, persistido no volume Docker `loknite-data` em `/app/.wrangler`; não há um serviço separado de PostgreSQL. O arquivo JSON é só o formato de importação/exportação. O health check consulta a versão de schema no SQLite, além de confirmar que o Worker respondeu. O volume local é separado do banco do Worker publicado, então edições em localhost não alteram os dados compartilhados da equipe. O Compose usa `restart: unless-stopped`; o volume sobrevive a reinícios/recriações do container. Evite `docker compose down -v` se quiser manter esse banco. A porta fica disponível somente na máquina local, com identidade de desenvolvimento.

Para rodar uma cópia de QA sem ocupar a porta padrão, defina `LOKNITE_LOCAL_PORT` (por exemplo, `8797`) antes de executar o Compose. Um nome de projeto distinto cria volumes Docker separados.

Para desenvolvimento sem Docker:

```sh
npm ci
npm run build
npm run dev -- --host 127.0.0.1 --port 8788
```

Execute a importação em outro terminal. A pasta de origem deve conter o par `vault.json` e `cardvault.json` da mesma revisão e o diretório `media_vault`. O importador lê a origem e envia os dados ao site. Use o Vault mais recente da equipe na migração definitiva.

## Publicar no Cloudflare

O projeto usa **Cloudflare Workers com Static Assets e Durable Objects SQLite**. O endereço `.workers.dev` dispensa a compra de domínio. Workers e SQLite podem operar no plano Free dentro dos limites de uso. O login por chave é gerenciado pelo próprio site. [Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Para publicar direto do checkout, use `npm ci`, `npm run build`, `npx wrangler login` e `npx wrangler deploy`. O build gera uma SPA React com seu Worker Hono e o Durable Object. Se usar **Workers Builds**, mantenha estes valores:

| Campo | Valor |
| --- | --- |
| Diretório raiz | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

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

- `src/` contém a SPA React + TypeScript, dividida por módulos, rotas, consultas e CSS Modules. O shell inclui menu responsivo, temas e estados de carregamento.
- `app/` contém o renderer clássico preservado, os assets oficiais e o bridge HTTP necessário à compatibilidade.
- `server/worker.ts` define a entrada Cloudflare e o Durable Object; `server/gateway.ts` protege a SPA, os assets e a API; Hono organiza o roteamento HTTP. Módulos existentes de autenticação e domínio são reaproveitados durante a migração gradual.
- `server/catalog-read.js` e `server/catalog-write.js` oferecem consultas e mutações por registro. O domínio preserva os 315 slots, a criação de uma carta rascunho por skill e o bloqueio de gameplay confirmado.
- `server/repository.js` grava as linhas alteradas e a revisão na mesma transação SQLite. As escritas verificam a revisão de origem e retornam HTTP 409 em caso de conflito.
- `migrations/` contém as tabelas de classes, skills, cartas, keywords, tags, vínculos, consultas, preferências, revisões e mídia. Campos extensíveis ficam junto ao registro correspondente. Imagens importadas são guardadas como binários em blocos SQLite.
- `GET /api/v1/exports` baixa o par JSON da mesma revisão. `/exports/vault` e `/exports/cardvault` servem os formatos do desktop separadamente. Backups administráveis pelo app guardam o par e referenciam a mídia persistida no banco.

A migração de cada tela é gradual e ainda está em andamento. Durante o refactor, os módulos clássicos continuam acessíveis em `/classic/`. Produção só será substituída após preview e validação separados. O desktop e a web mantêm Vaults distintos; a sincronização contínua fica para um roadmap futuro.

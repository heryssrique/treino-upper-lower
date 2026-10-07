# Treino Upper/Lower

App web do plano de hipertrofia Upper/Lower de 4 dias (60 min de musculação + 15–20 min de esteira).

- Divisão semanal: Upper A (seg), Lower A (ter), Upper B (qui), Lower B (sex)
- Séries, repetições e descanso de cada exercício
- Cronômetro de descanso automático ao marcar cada série, com notificação no celular
- Registro de carga e repetições, com histórico
- Técnica de cada exercício (montagem, execução, erro comum) e link direto para o vídeo no [MuscleWiki](https://musclewiki.com/pt-br/)
- Instalável no Android (PWA) e funciona offline
- Sincronização opcional com MongoDB

## Estrutura

```
index.html            app (HTML, CSS e JS num arquivo só)
sw.js                 service worker: offline e aviso de fim do descanso
manifest.webmanifest  dados para instalar como app
api/                  funções serverless da Vercel
  state.js            GET/PUT  /api/state     estado atual + histórico
  sessions.js         POST/DELETE /api/sessions  treinos concluídos
  health.js           GET /api/health         API e banco no ar?
  _lib/               conexão com o MongoDB e autenticação
scripts/dev.mjs       servidor local (app + API)
scripts/test-api.mjs  testes da API
```

## Banco de dados (MongoDB)

Os dados ficam sempre no aparelho primeiro, então o app funciona sem internet. Com a chave configurada, ele envia as mudanças para o MongoDB e, ao abrir, busca o que estiver mais novo. Assim o histórico aparece em qualquer aparelho.

Coleções no banco `treino`:

| Coleção    | Conteúdo |
|------------|----------|
| `state`    | um documento (`_id: "me"`) com séries marcadas, rascunhos de carga e últimas cargas por exercício |
| `sessions` | um documento por treino concluído: `id`, `wid` (UA/LA/UB/LB), `date`, `finishedAt`, `entries[]` |

A API é protegida por uma chave pessoal (`APP_KEY`), enviada pelo app no cabeçalho `Authorization: Bearer <chave>`.

### Configurar (uma vez)

1. **MongoDB Atlas** — crie um cluster gratuito (M0) em <https://cloud.mongodb.com>. Em *Database Access*, crie um usuário com senha. Em *Network Access*, libere `0.0.0.0/0`, porque a Vercel não tem IP fixo. Copie a string de conexão em *Connect → Drivers*.
2. **Chave pessoal** — gere uma com:
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```
3. **Vercel** — em <https://vercel.com/new>, importe este repositório do GitHub (sem framework, sem comando de build). Em *Settings → Environment Variables*, cadastre `MONGODB_URI`, `MONGODB_DB` (opcional) e `APP_KEY`. Depois faça o deploy.
4. Abra `https://<seu-projeto>.vercel.app/api/health`. Deve aparecer `{"ok":true,"db":true}`.
5. No app (endereço da Vercel), vá em **Histórico → Banco de dados**, digite a chave e toque em **Conectar**.

> A sincronização só funciona no endereço da Vercel, porque o GitHub Pages não executa a API. Para usar no celular, instale o app a partir do endereço da Vercel.

### Desenvolvimento local

```
npm install
npm run dev        # http://localhost:3000 — sem .env, usa um MongoDB temporário em memória
npm run test:api   # testa as rotas da API
```

Para usar o Atlas localmente, copie `.env.example` para `.env` e preencha.

> Material informativo, não é prescrição médica.

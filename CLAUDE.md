# ARIZN Receptionist — Contexto para Claude Code

Produto **"AI Receptionist (Instagram DM)"** do catálogo da ARIZN: responde DMs do Instagram 24/7 em nome de negócios locais, qualifica leads e alerta o dono. Multi-tenant — um deploy atende todos os clientes.

## Regras deste projeto

- **LLM: Groq (`llama-3.1-8b-instant`). NÃO usar Claude/Anthropic aqui.**
- Nunca hardcodar API keys — tudo via env vars (`.env.local` / Vercel).
- Deploy: Vercel (projeto `arizn-receptionist`). Repo deve migrar de `aritasaas/` para a org `ARIZN-CO` (ver README).
- Versão da Graph API vem de `GRAPH_API_VERSION` (default `v23.0`) — não hardcodar em outros lugares.

## Arquitetura

```
pages/api/webhook.js        Meta webhook: verifica assinatura (META_APP_SECRET),
                            roteia entry.id → clients table, aguarda processamento antes do 200
pages/api/reply.js          Endpoint de teste (gated por REPLY_TEST_SECRET)
pages/api/cron/health.js    Health check diário (Groq/Supabase/tokens IG) → alerta Resend
pages/api/cron/refresh-token.js  Renova tokens IG de 60 dias (mensal)
lib/reply.js                Orquestração: dedup por mid, lead, pausa humana, IA, hot lead
lib/groq.js                 System prompt por cliente + 1 call retorna {reply, hot_lead, booking_intent} (JSON mode)
lib/supabase.js             Todo o acesso a dados (schema no comentário do topo)
lib/instagram.js            sendDM (retorna mid), getUserProfile, refreshAccessToken, checkToken
lib/alert.js                Email de hot lead (HTML escapado) + alertas operacionais
lib/brain.js                Eventos lead.created / lead.hot pro ARIZN Brain (opcional, timeout 2s)
lib/log.js                  vlog() gated por LOG_VERBOSE
```

## Fluxo de uma DM

webhook → assinatura OK → client por `entry.id` → dedup por `mid` → upsert lead (novo: busca @username + Brain `lead.created`) → pausado? só salva → Groq (JSON: reply + flags) → sendDM (guarda mid) → hot? (keywords do cliente OU flag da IA OU booking_intent) → status `hot` + email + Brain `lead.hot`.

**Human takeover:** echo com `mid` desconhecido = dono respondeu manualmente → `leads.ai_paused_until = now()+2h`; a IA volta sozinha depois. Echos com `mid` conhecido são as próprias respostas da IA (ignorados).

**Calendly (Tier 3):** `clients.calendly_url` preenchido → o prompt instrui a IA a mandar o link quando detectar intenção de agendar. NULL → IA diz que alguém entra em contato e o lead vira hot.

## Tabelas Supabase

- `clients` — config por cliente: `instagram_page_id` (roteamento), `business_name/type`, `services text[]`, `hours`, `tone_of_voice`, `system_prompt` (NULL = auto-gerado), `hot_lead_keywords text[]` (vazio = detecção por IA), `alert_email`, `calendly_url`, `access_token` (NULL = default), `active`
- `leads` — UNIQUE `(instagram_user_id, client_id)`; `status` new/hot; `ai_paused_until`; `username`/`name` via Graph API
- `conversations` — histórico; `mid` UNIQUE (dedup + detecção de echo humano)
- `config` — key/value; `default_access_token` mantido pelo cron

SQL completo: comentário no topo de `lib/supabase.js` e README.

## Env vars

Obrigatórias: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `RESEND_API_KEY`.
Recomendadas: `ALERT_EMAIL` (default `pedro@arizn.co`), `RESEND_FROM`, `CRON_SECRET`.
Opcionais: `LOG_VERBOSE`, `REPLY_TEST_SECRET`, `BRAIN_API_URL`, `BRAIN_AUTH_TOKEN`, `GRAPH_API_VERSION`.
Lista anotada em `.env.example`.

## Tiers comerciais

- **Tier 1 ($59/mo — Missed Call Text-Back):** OUTRO produto (Twilio + Make), não é este projeto.
- **Tier 2 ($129/mo):** este projeto sem `calendly_url` — IA 24/7 + hot lead + alertas.
- **Tier 3 ($179/mo):** este projeto com `calendly_url` preenchido.

## Como adicionar um cliente novo

1. `INSERT INTO clients (...)` — exemplo pronto no README (§ "Add a client").
2. Conectar o Instagram do cliente ao app Meta e gerar o token long-lived → coluna `access_token`.
3. Assinar o webhook pros eventos `messages` + `message_echoes` da conta.
4. Testar via `POST /api/reply` com o `pageId` do cliente.

Sem deploy novo — é só uma linha no banco.

# cnpjscrap — Design Spec

**Data:** 2026-05-24
**Autor:** Vitor (sprintjvs@gmail.com)
**Status:** Design aprovado, aguardando spec review

## Visão

Plataforma de prospecção B2B que extrai CNPJs ativos com contato (email/telefone) a partir de fontes públicas e enrichment automático, permitindo filtros (CNAE, UF, município, porte, data abertura), exportação CSV/XLSX e gestão leve de status de contato. Suporta tier gratuito e estrutura pronta pra assinaturas pagas (Stripe stub no MVP).

## Princípios

1. **Providers plugáveis com fallback chain** — adicionar novas fontes (Speedio, Google Maps, Hunter, etc.) não exige refactor; só implementar interface `LeadProvider` e registrar.
2. **Free first** — MVP roda 100% em fontes gratuitas (Receita Federal + scraping de site oficial). Providers pagos são extensão opcional.
3. **Nunca repetir lead** — dedup por usuário garantido em SQL na query principal.
4. **MVP fechado em sub-projetos** — billing real e provider extras ficam fora do MVP, mas a arquitetura já comporta sem refactor.

## Escopo MVP

| # | Subsistema | Status MVP |
|---|------------|------------|
| 1 | Engine de extração (providers + dedup + DB) | ✅ incluído |
| 2 | Filtros & busca UI | ✅ incluído |
| 3 | Conta + histórico (auth, quota) | ✅ incluído |
| 4 | Export + CRM leve (status de contato) | ✅ incluído |
| 5 | Billing (Stripe) | ⏸ stub (só estrutura) |
| 6 | Admin/observability | ❌ pós-MVP |

## Stack

- **Next.js 15** (App Router) — UI + API routes + Server Actions
- **PostgreSQL 16** — Receita Federal + app (schemas separados)
- **Prisma** — ORM (app schema apenas; queries da RF via SQL raw pra performance)
- **BullMQ + Redis** — fila de import RF (mensal) e enrichment (por busca)
- **Worker Node separado** — container próprio (Docker), consome BullMQ
- **NextAuth (magic link via Resend)** — auth sem senha
- **Cheerio + Playwright** — scraping (Cheerio padrão, Playwright fallback pra HTML dinâmico)
- **Tailwind + shadcn/ui** — UI
- **exceljs** — XLSX export
- **Vitest + Playwright** — testes
- **pnpm workspaces** — monorepo (sem turborepo no MVP)

## Estrutura do repo

```
cnpjscrap/
├── apps/
│   ├── web/                  # Next.js (UI + API)
│   └── worker/               # Node worker (BullMQ consumer)
├── packages/
│   ├── db/                   # Prisma schema + client
│   ├── providers/            # Interface + implementações
│   │   ├── receita-federal/  # importer + query
│   │   ├── rf-self-contact/  # enricher: contato do próprio dump
│   │   ├── site-scraper/     # enricher: scraping de website
│   │   └── types.ts          # LeadProvider interface
│   └── shared/               # tipos, utils
├── docker-compose.yml        # postgres + redis + worker (dev)
├── scripts/
│   └── import-rf.ts          # job de import mensal
└── docs/superpowers/specs/
```

## Schema do banco

### Schema `rf` (Receita Federal — append-only, refresh mensal por swap atômico)

```
empresas (
  cnpj_base         text PK,
  razao_social      text,
  natureza_juridica text,
  qualif_responsavel text,
  capital_social    numeric,
  porte             text   -- '01' MEI | '03' ME | '05' EPP | '00' não informado
)

estabelecimentos (
  cnpj_full              text PK,
  cnpj_base              text REFERENCES empresas,
  matriz_filial          text,    -- '1' matriz | '2' filial
  nome_fantasia          text,
  situacao               text,    -- '01' nula | '02' ativa | '03' suspensa | '04' inapta | '08' baixada
  data_inicio_atividade  date,
  cnae_principal         text,
  cnaes_secundarios      text[],
  uf                     text,
  municipio_codigo       text,
  bairro                 text,
  cep                    text,
  ddd1                   text,
  telefone1              text,
  ddd2                   text,
  telefone2              text,
  email                  text
)

socios (cnpj_base, nome_socio, qualificacao, ...)

cnaes      (codigo PK, descricao)
municipios (codigo PK, nome, uf)

-- Indexes críticos pra query principal
CREATE INDEX idx_estab_filtros
  ON rf.estabelecimentos (uf, cnae_principal, data_inicio_atividade DESC)
  WHERE situacao = '02';
CREATE INDEX idx_estab_municipio
  ON rf.estabelecimentos (municipio_codigo)
  WHERE situacao = '02';
```

### Schema `app` (usuários e estado)

```
users (
  id                 uuid PK,
  email              text UNIQUE,
  name               text,
  plan_id            text REFERENCES plans,
  quota_used_month   int DEFAULT 0,
  quota_reset_at     timestamptz,
  created_at         timestamptz
)

plans (
  id                 text PK,    -- 'free' | 'pro' | 'agency'
  name               text,
  quota_monthly      int,
  price_cents        int,
  stripe_price_id    text NULL
)

-- seed: free(50, 0), pro(1000, 9700), agency(5000, 29700)

seen_leads (
  user_id   uuid REFERENCES users,
  cnpj_full text,
  seen_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, cnpj_full)
)

leads_contact (
  id            uuid PK,
  user_id       uuid REFERENCES users,
  cnpj_full     text,
  status        text,   -- novo | em_contato | sem_resposta | fechado | descartado
  notes         text,
  contacted_at  timestamptz NULL,
  created_at    timestamptz,
  updated_at    timestamptz,
  UNIQUE (user_id, cnpj_full)
)

searches (
  id              uuid PK,
  user_id         uuid REFERENCES users,
  filters_json    jsonb,
  qty_requested   int,
  qty_returned    int,
  created_at      timestamptz
)

enrichments (
  cnpj_full   text,
  source      text,         -- 'rf-self' | 'site-scraper' | 'google-maps' | ...
  email       text NULL,
  telefone    text NULL,
  website     text NULL,
  success     boolean,
  scraped_at  timestamptz,
  PRIMARY KEY (cnpj_full, source)
)
```

## Interface LeadProvider

```typescript
// packages/providers/types.ts
export interface LeadProvider {
  name: string;
  kind: 'source' | 'enricher';
  priority: number;          // menor = primeiro no chain
  enabled: boolean;
  cost: 'free' | 'paid';

  search?(filters: SearchFilters, qty: number): Promise<LeadSeed[]>;
  enrich?(seed: LeadSeed): Promise<EnrichmentResult>;
  health?(): Promise<{ ok: boolean; latencyMs?: number; quota?: number }>;
}

export type LeadSeed = {
  cnpjFull: string;
  razaoSocial: string;
  nomeFantasia?: string;
  email?: string;
  telefone?: string;
  website?: string;
};

export type EnrichmentResult = {
  cnpjFull: string;
  email?: string;
  telefone?: string;
  website?: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
};

export type SearchFilters = {
  cnaes?: string[];          // códigos CNAE (5611-2/01 → '5611201')
  ufs?: string[];
  municipios?: string[];     // códigos IBGE
  portes?: string[];         // ['01', '03', '05']
  abertoHaMeses: number;     // 1..6 (cap rígido em 6)
  comEmail?: boolean;
  comTelefone?: boolean;
};
```

## Registry + chain executor

```typescript
// packages/providers/registry.ts
class ProviderRegistry {
  private providers: LeadProvider[] = [];
  register(p: LeadProvider) { this.providers.push(p); }
  sources()   { return this.providers.filter(p => p.kind === 'source'   && p.enabled).sort(byPriority); }
  enrichers() { return this.providers.filter(p => p.kind === 'enricher' && p.enabled).sort(byPriority); }
}

// packages/providers/enrich-chain.ts
export async function runEnrichmentChain(seed: LeadSeed, registry: ProviderRegistry): Promise<LeadSeed> {
  for (const enricher of registry.enrichers()) {
    if (seed.email && seed.telefone) break;
    try {
      const r = await enricher.enrich!(seed);
      seed.email    ??= r.email;
      seed.telefone ??= r.telefone;
      seed.website  ??= r.website;
      // persiste em `enrichments` mesmo se vazio (cache negativo)
    } catch (_) { /* log e continua */ }
  }
  return seed;
}
```

## Providers do MVP

| Provider | Kind | Priority | Cost | Função |
|----------|------|----------|------|--------|
| `receita-federal` | source | 1 | free | Query principal no DB |
| `rf-self-contact` | enricher | 1 | free | Email/tel já presentes no dump RF |
| `site-scraper` | enricher | 2 | free | Scraping de `/contato`, `/sobre` do `website` |

**Pós-MVP** (interface já comporta): `google-maps`, `hunter-io`, `speedio`, `econodata`, `casa-dos-dados`.

## Fluxo "buscar leads"

```
[user clica Buscar]
   ↓
Server Action valida filtros + quota
   ↓
Query principal (SQL raw):
  SELECT e.*
  FROM rf.estabelecimentos e
  LEFT JOIN app.seen_leads s ON s.cnpj_full = e.cnpj_full AND s.user_id = $1
  WHERE s.cnpj_full IS NULL
    AND e.situacao = '02'
    AND e.data_inicio_atividade >= now() - ($abertoHaMeses || ' months')::interval
    AND ($ufs        IS NULL OR e.uf = ANY($ufs))
    AND ($cnaes      IS NULL OR e.cnae_principal = ANY($cnaes))
    AND ($municipios IS NULL OR e.municipio_codigo = ANY($municipios))
  ORDER BY e.data_inicio_atividade DESC
  LIMIT $qty * 3   -- buffer pra perdas de enrichment
   ↓
Pra cada CNPJ → enfileira EnrichJob em BullMQ
   ↓
Worker (concurrency=10):
   - consulta cache em `enrichments`
   - se hit, usa
   - se miss, roda chain: rf-self-contact → site-scraper
   - grava em `enrichments` (mesmo se falhou)
   ↓
UI usa SSE pra mostrar leads conforme enrichments resolvem
   ↓
Se filtros incluem comEmail/comTelefone, lead sem o campo é dropado
   ↓
Para quando atingir qty pedida, ou esgotar buffer
   ↓
Se resultado final < qty pedida (universo elegível pequeno OU muitos dropados por comEmail/comTelefone),
UI mostra warning: "Encontramos X de Y pedidos. Afrouxe filtros pra ver mais."
   ↓
User clica "Salvar como leads":
   - INSERT em `seen_leads` (dedup futuro)
   - INSERT em `leads_contact` status='novo'
   - consumeQuota(user, count)
```

## UI/UX — telas do MVP

```
/login          → magic link (NextAuth)
/               → dashboard (quota usada, últimas buscas)
/buscar         → filtros + resultado streaming
/leads          → CRM leve (lista, status, export)
/conta          → plano, quota, faturas stub
```

### `/buscar`

Layout 2 colunas: filtros sticky à esquerda (CNAE multi-select com busca por texto sobre `cnaes.descricao`, UF→município cascata, porte, aberto há N meses [cap 6], qtd cap pela quota, toggles `comEmail`/`comTelefone`); resultado streaming via SSE à direita.

- "Custa N" mostra o gasto **só ao salvar**, não ao buscar (user pode descartar previews sem cobrar).
- Loading skeleton por linha enquanto enrichment não resolve.

### `/leads`

Tabela filtrável (status, categoria, período) com status inline editável (`novo | em_contato | sem_resposta | fechado | descartado`), notas, bulk select. Botões export CSV (UTF-8 BOM, abre certo no Excel BR) e XLSX (exceljs).

### `/conta`

Plano atual, barra de quota, dia de reset, histórico de buscas. Botão "Upgrade pra Pro" disabled com "🚧 Em breve".

## Quota & billing stub

- **Plano free** (único ativo no MVP): 50 leads salvos/mês, reset no dia da assinatura (não dia 1º — distribui carga).
- Tabela `plans` já tem rows `pro` e `agency` (sem `stripe_price_id`).
- `consumeQuota(userId, amount)` é chamado **no Salvar**, não no Buscar.
- Cron diário reseta `quota_used_month=0` e bumpa `quota_reset_at` quando vencido.
- Ligar Stripe pós-MVP: checkout session → webhook `subscription.created` muda `users.plan_id`; `subscription.deleted` volta pra `free`.

## Import mensal da Receita Federal

Fonte: https://dadosabertos.rfb.gov.br/CNPJ/ — ~20 arquivos zip (~5GB), descompactados ~30GB CSV pipe-delimited, encoding WIN1252.

Job (`scripts/import-rf.ts`, cron mensal no container worker):

```
1. Detecta último diretório publicado (YYYY-MM)
   → compara com `app.import_log.last_imported`
   → se igual, sai

2. Download paralelo dos zips (axios + p-limit concurrency=4) → ./tmp/rf/YYYY-MM/

3. Descompacta cada zip (unzipper streaming)

4. Import via COPY do Postgres em tabelas _staging (sem indexes):
   \COPY rf_estabelecimentos_staging FROM 'estabe0.csv' WITH CSV DELIMITER ';' ENCODING 'WIN1252'

5. CREATE INDEX nas _staging

6. Swap atômico em transaction:
   BEGIN;
     ALTER TABLE rf.estabelecimentos RENAME TO estabelecimentos_old;
     ALTER TABLE rf.estabelecimentos_staging RENAME TO estabelecimentos;
   COMMIT;
   DROP TABLE rf.estabelecimentos_old;

7. Limpa ./tmp/rf/YYYY-MM/

8. UPDATE app.import_log SET last_imported = 'YYYY-MM'
```

- Bootstrap inicial: mesmo job sem `last_imported`. Demora ~1h numa máquina com 4vCPU/8GB RAM.
- Import idempotente: re-rodar mesmo mês é no-op.

## Tradeoffs assumidos

- **DB único pra RF + app** (schemas separados): simples no MVP, migrar pra DBs separados é trivial depois.
- **Sem fila pra busca em si**: query principal é sync, só enrichment é async.
- **Buffer 3x na query**: cobre perdas de enrichment (sem email/tel quando filtro exige), ajustável.
- **Quota em "leads salvos"**, não em buscas: alinha com valor entregue.
- **Magic link em vez de senha**: menos código, sem bcrypt/reset flow, UX moderna.
- **CRM dentro do app**, sem integração HubSpot/Pipedrive no MVP.
- **Single-user (sem workspaces/teams)** no MVP. Add `workspaces` depois é refactor médio.
- **`abertoHaMeses` capado em 6**: requisito do produto, hard-coded.
- **Prisma só pro schema `app`**, queries da RF via SQL raw (Prisma é lento pra agregações em 30GB).

## Testes

| Camada | Tool | Cobertura |
|--------|------|-----------|
| Unit | Vitest | `packages/providers`, `lib/quota`, filtros→SQL, CSV/XLSX export — alvo 80% |
| Integration | Vitest + testcontainers (postgres) | Query principal com dedup, import RF (fixture 100 linhas) |
| E2E | Playwright | 1 happy path: login → buscar → salvar → exportar |

UI sem coverage hard; E2E cobre regressão do fluxo crítico.

## Deploy & infra

```
Vercel (apps/web)
   │
   ▼
Hetzner CX22 (~€5/mês, 4GB RAM, +60GB volume pra postgres)
   ├── postgres:16
   ├── redis:7
   └── worker (node, Playwright headless)
```

- Vercel free tier serve no MVP.
- 1 VPS único via docker-compose pra postgres+redis+worker. Migrar pra managed (Neon, Upstash) depois sem dor.
- Secrets: `.env` em dev, Vercel envs em prod.
- CI: GitHub Actions — lint + typecheck + test em PR, deploy on main.
- Observability MVP: Vercel logs + worker stdout. Sentry quando tiver primeiro user pagante.

## Roadmap pós-MVP

1. Stripe ligado (assinaturas free → pro → agency)
2. Provider `google-maps` (acha website quando RF não tem)
3. Provider `hunter-io` (acha email por domínio)
4. Admin panel (saúde providers, RF import status, métricas)
5. Workspaces/teams (multi-user, share de leads)
6. Webhooks/integrações outbound (HubSpot, Pipedrive, N8N)
7. Provider `speedio` / `econodata` (enrichment pago, diferencial do plano agency)
8. App mobile (Flutter) se demanda surgir

## Riscos conhecidos

| Risco | Mitigação |
|-------|-----------|
| Cobertura de email no dump RF é baixa (~30-40%) | Site-scraper fallback no MVP; Google Maps + Hunter no roadmap |
| Scraping pode ser bloqueado (rate limit, CAPTCHA) | Concurrency baixa (10), user-agent realista, Playwright fallback. Cache negativo evita re-scrape |
| LGPD pra emails comerciais | Dados são públicos (Receita Federal) ou do próprio site da empresa (zona aceita). Ofertar opt-out via email no rodapé do CSV gerado |
| Import RF demora e ocupa disco | Swap atômico evita downtime; tabelas `_staging` deletadas após swap |
| Postgres num VPS único é SPOF | Backup diário pra S3/Backblaze; managed DB no roadmap |
| Universo elegível se esgota pra user power (todo CNPJ filtrável já está em `seen_leads`) | UI sinaliza "esgotou"; user afrouxa filtros ou aguarda próximo import RF (mensal traz novos abertos) |

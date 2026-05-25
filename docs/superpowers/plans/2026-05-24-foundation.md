# cnpjscrap — Plano 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir monorepo, Postgres+Redis em docker-compose, schema `app` migrado, login por magic link funcional, CI passando.

**Architecture:** Monorepo pnpm com `apps/web` (Next.js 15 App Router) e `packages/{db,shared}`. Prisma só pro schema `app` (schema `rf` vem no Plano 2 via SQL raw). Auth via NextAuth credentials provider + email magic link (Resend). Tudo orquestrado por docker-compose em dev.

**Tech Stack:** Next.js 15, TypeScript 5.6, pnpm 9, Prisma 5, PostgreSQL 16, Redis 7, NextAuth 5, Resend, Vitest 2, Playwright 1.48, ESLint 9 + Prettier 3.

**Spec ref:** `docs/superpowers/specs/2026-05-24-cnpjscrap-design.md` — seções "Stack", "Estrutura do repo", "Schema do banco" (apenas `app`), "UI/UX → /login".

---

## File map (criados/alterados neste plano)

```
cnpjscrap/
├── .editorconfig                       NEW
├── .gitignore                          NEW
├── .nvmrc                              NEW
├── .prettierrc                         NEW
├── README.md                           NEW
├── docker-compose.yml                  NEW
├── eslint.config.mjs                   NEW
├── package.json                        NEW (root)
├── pnpm-workspace.yaml                 NEW
├── tsconfig.base.json                  NEW
├── vitest.config.ts                    NEW
├── .github/workflows/ci.yml            NEW
├── apps/web/
│   ├── package.json                    NEW
│   ├── tsconfig.json                   NEW
│   ├── next.config.mjs                 NEW
│   ├── postcss.config.mjs              NEW
│   ├── tailwind.config.ts              NEW
│   ├── playwright.config.ts            NEW
│   ├── .env.example                    NEW
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx              NEW
│   │   │   ├── page.tsx                NEW
│   │   │   ├── globals.css             NEW
│   │   │   ├── login/page.tsx          NEW
│   │   │   ├── login/check-email/page.tsx  NEW
│   │   │   └── api/auth/[...nextauth]/route.ts  NEW
│   │   ├── lib/
│   │   │   └── auth.ts                 NEW
│   │   └── middleware.ts               NEW
│   └── tests/
│       ├── unit/auth.test.ts           NEW
│       └── e2e/login.spec.ts           NEW
├── packages/db/
│   ├── package.json                    NEW
│   ├── tsconfig.json                   NEW
│   ├── prisma/
│   │   ├── schema.prisma               NEW
│   │   └── seed.ts                     NEW
│   ├── src/
│   │   ├── index.ts                    NEW
│   │   └── client.ts                   NEW
│   └── tests/seed.test.ts              NEW
└── packages/shared/
    ├── package.json                    NEW
    ├── tsconfig.json                   NEW
    └── src/
        ├── index.ts                    NEW
        └── types.ts                    NEW
```

---

## Task 1: Inicializar monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.nvmrc`, `.editorconfig`, `.prettierrc`, `tsconfig.base.json`, `README.md`

- [ ] **Step 1: Init git + node version pin**

```bash
git init
echo "20.18.0" > .nvmrc
nvm use 20.18.0 || nvm install 20.18.0
corepack enable
corepack prepare pnpm@9.12.3 --activate
```

- [ ] **Step 2: Criar `.gitignore`**

```
node_modules/
.next/
dist/
build/
coverage/
.env
.env.local
.turbo/
tmp/
*.log
.DS_Store
playwright-report/
test-results/
```

- [ ] **Step 3: Criar `package.json` root**

```json
{
  "name": "cnpjscrap",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.3",
  "engines": { "node": ">=20.18.0" },
  "scripts": {
    "dev": "pnpm --filter @cnpjscrap/web dev",
    "build": "pnpm -r build",
    "lint": "eslint .",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "pnpm --filter @cnpjscrap/web test:e2e",
    "db:migrate": "pnpm --filter @cnpjscrap/db migrate",
    "db:seed": "pnpm --filter @cnpjscrap/db seed",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  },
  "devDependencies": {
    "@types/node": "^20.16.10",
    "eslint": "^9.13.0",
    "prettier": "^3.3.3",
    "typescript": "^5.6.3",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 4: Criar `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 5: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: Criar `.editorconfig` e `.prettierrc`**

`.editorconfig`:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 7: Criar `README.md` mínimo**

```markdown
# cnpjscrap

Plataforma de prospecção B2B via extração de CNPJs com enrichment de contato.

## Dev

\`\`\`
pnpm install
pnpm docker:up
pnpm db:migrate
pnpm dev
\`\`\`

Spec: `docs/superpowers/specs/2026-05-24-cnpjscrap-design.md`
```

- [ ] **Step 8: Instalar deps + verificar**

```bash
pnpm install
pnpm -v   # >= 9.12.3
node -v   # >= 20.18.0
```

Expected: instala sem erro, gera `pnpm-lock.yaml`.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "chore: init monorepo with pnpm workspaces"
```

---

## Task 2: Docker compose (postgres + redis)

**Files:**
- Create: `docker-compose.yml`, `apps/web/.env.example`

- [ ] **Step 1: Criar `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: cnpjscrap-pg
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: cnpjscrap
      POSTGRES_PASSWORD: cnpjscrap_dev
      POSTGRES_DB: cnpjscrap
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cnpjscrap"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: cnpjscrap-redis
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: Subir e validar**

```bash
docker compose up -d
docker compose ps
docker compose exec postgres psql -U cnpjscrap -c "SELECT version();"
docker compose exec redis redis-cli PING
```

Expected: postgres responde versão; redis responde `PONG`.

- [ ] **Step 3: Criar `apps/web/.env.example`**

```
DATABASE_URL="postgresql://cnpjscrap:cnpjscrap_dev@localhost:5432/cnpjscrap?schema=app"
REDIS_URL="redis://localhost:6379"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me-openssl-rand-base64-32"

RESEND_API_KEY="re_xxxxxxxxxxxx"
EMAIL_FROM="login@cnpjscrap.local"
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml apps/web/.env.example
git commit -m "chore: add docker-compose for postgres + redis"
```

---

## Task 3: Package `@cnpjscrap/db` com Prisma e schema `app`

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/prisma/schema.prisma`, `packages/db/src/{index,client}.ts`, `packages/db/prisma/seed.ts`, `packages/db/tests/seed.test.ts`

- [ ] **Step 1: Criar `packages/db/package.json`**

```json
{
  "name": "@cnpjscrap/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p .",
    "typecheck": "tsc -p . --noEmit",
    "migrate": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "studio": "prisma studio",
    "seed": "tsx prisma/seed.ts",
    "generate": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^5.20.0"
  },
  "devDependencies": {
    "prisma": "^5.20.0",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Criar `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "prisma/**/*"]
}
```

- [ ] **Step 3: Criar `packages/db/prisma/schema.prisma` (schema `app` apenas)**

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["app"]
}

model Plan {
  id              String  @id
  name            String
  quotaMonthly    Int     @map("quota_monthly")
  priceCents      Int     @map("price_cents")
  stripePriceId   String? @map("stripe_price_id")
  users           User[]

  @@map("plans")
  @@schema("app")
}

model User {
  id              String   @id @default(uuid()) @db.Uuid
  email           String   @unique
  name            String?
  planId          String   @default("free") @map("plan_id")
  quotaUsedMonth  Int      @default(0) @map("quota_used_month")
  quotaResetAt    DateTime @default(now()) @map("quota_reset_at")
  emailVerified   DateTime? @map("email_verified")
  image           String?
  createdAt       DateTime @default(now()) @map("created_at")

  plan            Plan     @relation(fields: [planId], references: [id])
  accounts        Account[]
  sessions        Session[]
  seenLeads       SeenLead[]
  leadsContact    LeadContact[]
  searches        Search[]

  @@map("users")
  @@schema("app")
}

// NextAuth tables
model Account {
  id                String  @id @default(cuid())
  userId            String  @db.Uuid @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
  @@schema("app")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @db.Uuid @map("user_id")
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
  @@schema("app")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
  @@schema("app")
}

model SeenLead {
  userId   String   @db.Uuid @map("user_id")
  cnpjFull String   @map("cnpj_full")
  seenAt   DateTime @default(now()) @map("seen_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, cnpjFull])
  @@map("seen_leads")
  @@schema("app")
}

model LeadContact {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @db.Uuid @map("user_id")
  cnpjFull     String    @map("cnpj_full")
  status       String    @default("novo")
  notes        String?
  contactedAt  DateTime? @map("contacted_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, cnpjFull])
  @@map("leads_contact")
  @@schema("app")
}

model Search {
  id            String   @id @default(uuid()) @db.Uuid
  userId        String   @db.Uuid @map("user_id")
  filtersJson   Json     @map("filters_json")
  qtyRequested  Int      @map("qty_requested")
  qtyReturned   Int      @map("qty_returned")
  createdAt     DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("searches")
  @@schema("app")
}

model Enrichment {
  cnpjFull   String    @map("cnpj_full")
  source     String
  email      String?
  telefone   String?
  website    String?
  success    Boolean
  scrapedAt  DateTime  @default(now()) @map("scraped_at")

  @@id([cnpjFull, source])
  @@map("enrichments")
  @@schema("app")
}

model ImportLog {
  id            Int       @id @default(autoincrement())
  source        String    // 'receita-federal'
  lastImported  String    @map("last_imported")  // 'YYYY-MM'
  startedAt     DateTime  @map("started_at")
  finishedAt    DateTime? @map("finished_at")
  status        String    // 'running' | 'success' | 'failed'
  error         String?

  @@map("import_log")
  @@schema("app")
}
```

- [ ] **Step 4: Criar `packages/db/src/client.ts`** (singleton Prisma com proteção contra reload em dev)

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Criar `packages/db/src/index.ts`**

```typescript
export { prisma } from './client.js';
export * from '@prisma/client';
```

- [ ] **Step 6: Criar `packages/db/prisma/seed.ts`** (planos free/pro/agency)

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  { id: 'free',   name: 'Free',   quotaMonthly: 50,   priceCents: 0,     stripePriceId: null },
  { id: 'pro',    name: 'Pro',    quotaMonthly: 1000, priceCents: 9700,  stripePriceId: null },
  { id: 'agency', name: 'Agency', quotaMonthly: 5000, priceCents: 29700, stripePriceId: null },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
  }
  console.log(`Seeded ${PLANS.length} plans`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 7: Instalar deps + criar schema `app` no Postgres**

```bash
cd packages/db
pnpm install
docker compose exec postgres psql -U cnpjscrap -c "CREATE SCHEMA IF NOT EXISTS app;"
```

- [ ] **Step 8: Rodar primeira migration**

```bash
DATABASE_URL="postgresql://cnpjscrap:cnpjscrap_dev@localhost:5432/cnpjscrap?schema=app" \
  pnpm prisma migrate dev --name init
```

Expected: cria `packages/db/prisma/migrations/<timestamp>_init/migration.sql`, aplica no DB.

- [ ] **Step 9: Escrever teste do seed** (`packages/db/tests/seed.test.ts`)

(Vitest já foi instalado no root em Task 1. `tsx` é dep do `packages/db`.)

```typescript
// packages/db/tests/seed.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const prisma = new PrismaClient();

describe('seed', () => {
  beforeAll(() => {
    execSync('pnpm seed', { cwd: 'packages/db', stdio: 'inherit' });
  });
  afterAll(() => prisma.$disconnect());

  it('creates 3 plans', async () => {
    const count = await prisma.plan.count();
    expect(count).toBe(3);
  });

  it('free plan has 50 quota', async () => {
    const free = await prisma.plan.findUnique({ where: { id: 'free' } });
    expect(free?.quotaMonthly).toBe(50);
    expect(free?.priceCents).toBe(0);
  });
});
```

- [ ] **Step 10: Rodar teste — deve FALHAR (seed nunca rodou)**

```bash
DATABASE_URL="postgresql://cnpjscrap:cnpjscrap_dev@localhost:5432/cnpjscrap?schema=app" \
  pnpm vitest run packages/db/tests/seed.test.ts
```

Expected: PASS (o `beforeAll` roda o seed e cria os 3 planos).
> Nota: caso a tabela `plans` esteja vazia antes, `beforeAll` cobre. Caso já tenha rows de runs anteriores, upsert mantém idempotência.

- [ ] **Step 11: Commit**

```bash
git add packages/db pnpm-lock.yaml package.json
git commit -m "feat(db): add app schema with Prisma + plans seed"
```

---

## Task 4: Package `@cnpjscrap/shared`

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/{index,types}.ts`

- [ ] **Step 1: Criar `packages/shared/package.json`**

```json
{
  "name": "@cnpjscrap/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p .",
    "typecheck": "tsc -p . --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Criar `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Criar `packages/shared/src/types.ts`**

```typescript
export type LeadStatus = 'novo' | 'em_contato' | 'sem_resposta' | 'fechado' | 'descartado';

export type SearchFilters = {
  cnaes?: string[];
  ufs?: string[];
  municipios?: string[];
  portes?: string[];          // '01' MEI | '03' ME | '05' EPP
  abertoHaMeses: number;      // 1..6
  comEmail?: boolean;
  comTelefone?: boolean;
};

export const MAX_ABERTO_HA_MESES = 6 as const;
export const LEAD_STATUSES: readonly LeadStatus[] = [
  'novo', 'em_contato', 'sem_resposta', 'fechado', 'descartado',
] as const;
```

- [ ] **Step 4: Criar `packages/shared/src/index.ts`**

```typescript
export * from './types.js';
```

- [ ] **Step 5: Instalar + typecheck**

```bash
cd packages/shared && pnpm install
cd ../.. && pnpm -r typecheck
```

Expected: zero erros.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add common types"
```

---

## Task 5: Scaffold `apps/web` (Next.js 15)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.mjs`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/src/app/{layout,page,globals}.{tsx,css}`

- [ ] **Step 1: Criar `apps/web/package.json`**

```json
{
  "name": "@cnpjscrap/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@cnpjscrap/db": "workspace:*",
    "@cnpjscrap/shared": "workspace:*",
    "next": "15.0.2",
    "react": "19.0.0-rc-69d4b800-20241021",
    "react-dom": "19.0.0-rc-69d4b800-20241021"
  },
  "devDependencies": {
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@playwright/test": "^1.48.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Criar `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "incremental": true
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Criar `apps/web/next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@cnpjscrap/db', '@cnpjscrap/shared'],
  experimental: { typedRoutes: true },
};
```

- [ ] **Step 4: Criar Tailwind config**

`apps/web/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`apps/web/postcss.config.mjs`:
```javascript
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: Criar `apps/web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; }
body { font-family: ui-sans-serif, system-ui, sans-serif; }
```

- [ ] **Step 6: Criar `apps/web/src/app/layout.tsx`**

```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'cnpjscrap',
  description: 'Prospecção B2B de CNPJs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Criar `apps/web/src/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">cnpjscrap</h1>
      <p className="mt-2 text-zinc-600">Foundation pronto.</p>
    </main>
  );
}
```

- [ ] **Step 8: Instalar deps + dev server**

```bash
pnpm install
pnpm dev
```

Expected: abre em http://localhost:3000 mostrando "cnpjscrap / Foundation pronto."

- [ ] **Step 9: Build de produção (smoke)**

```bash
pnpm --filter @cnpjscrap/web build
```

Expected: build sem erro.

- [ ] **Step 10: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js 15 + Tailwind"
```

---

## Task 6: NextAuth com magic link (Resend)

**Files:**
- Create: `apps/web/src/lib/auth.ts`, `apps/web/src/app/api/auth/[...nextauth]/route.ts`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/login/check-email/page.tsx`, `apps/web/src/middleware.ts`
- Modify: `apps/web/package.json` (add deps)

- [ ] **Step 1: Adicionar deps**

```bash
pnpm --filter @cnpjscrap/web add next-auth@5.0.0-beta.25 @auth/prisma-adapter resend nodemailer
pnpm --filter @cnpjscrap/web add -D @types/nodemailer
```

- [ ] **Step 2: Criar `apps/web/src/lib/auth.ts`**

```typescript
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { Resend } from 'resend';
import { prisma } from '@cnpjscrap/db';

const resend = new Resend(process.env.RESEND_API_KEY);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  pages: { signIn: '/login', verifyRequest: '/login/check-email' },
  providers: [
    {
      id: 'email',
      type: 'email',
      name: 'Email',
      maxAge: 60 * 15, // 15min
      from: process.env.EMAIL_FROM!,
      async sendVerificationRequest({ identifier: email, url }) {
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: email,
          subject: 'Seu login no cnpjscrap',
          html: `
            <p>Clique pra entrar (válido por 15 min):</p>
            <p><a href="${url}">Entrar no cnpjscrap</a></p>
            <p style="color:#999;font-size:12px">Se não foi você, ignore este email.</p>
          `,
        });
      },
    },
  ],
});
```

- [ ] **Step 3: Criar `apps/web/src/app/api/auth/[...nextauth]/route.ts`**

```typescript
export { GET, POST } from '@/lib/auth';
export const dynamic = 'force-dynamic';
```

- [ ] **Step 4: Criar `apps/web/src/app/login/page.tsx`**

```tsx
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <form
        action={async (formData) => {
          'use server';
          await signIn('email', formData);
        }}
        className="mt-6 space-y-3"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="seu@email.com"
          className="w-full rounded border border-zinc-300 px-3 py-2"
        />
        <button
          type="submit"
          className="w-full rounded bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-700"
        >
          Receber link de login
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Criar `apps/web/src/app/login/check-email/page.tsx`**

```tsx
export default function CheckEmail() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Confira seu email</h1>
      <p className="mt-2 text-zinc-600">
        Enviamos um link de login. Válido por 15 minutos.
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Criar `apps/web/src/middleware.ts`**

```typescript
import { auth } from '@/lib/auth';

export default auth((req) => {
  const isAuth = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/login');
  const isPublic = isAuthPage || req.nextUrl.pathname === '/';

  if (!isAuth && !isPublic) {
    return Response.redirect(new URL('/login', req.url));
  }
  if (isAuth && isAuthPage) {
    return Response.redirect(new URL('/', req.url));
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 7: Gerar secret e configurar `.env.local`**

```bash
cd apps/web
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Cola o output em NEXTAUTH_SECRET no .env.local
# Configura RESEND_API_KEY com uma chave de teste do Resend
```

- [ ] **Step 8: Smoke test manual**

```bash
pnpm dev
# Abre http://localhost:3000/login
# Submete email
# Verifica que redirect vai pra /login/check-email
# Verifica caixa de entrada (ou logs do Resend)
# Clica no link → redirect pra /
```

Expected: fluxo completo funciona.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add NextAuth magic link via Resend"
```

---

## Task 7: Teste unitário do auth helper

**Files:**
- Create: `apps/web/tests/unit/auth.test.ts`, `vitest.config.ts` (root)
- Modify: root `package.json` (já tem `test`)

- [ ] **Step 1: Criar `vitest.config.ts` no root**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts', 'apps/**/tests/unit/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
```

- [ ] **Step 2: Escrever teste do helper `MAX_ABERTO_HA_MESES`** (sanity check do `@cnpjscrap/shared`)

`apps/web/tests/unit/auth.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { MAX_ABERTO_HA_MESES, LEAD_STATUSES } from '@cnpjscrap/shared';

describe('shared constants', () => {
  it('caps abertoHaMeses at 6', () => {
    expect(MAX_ABERTO_HA_MESES).toBe(6);
  });
  it('exposes 5 lead statuses', () => {
    expect(LEAD_STATUSES).toHaveLength(5);
    expect(LEAD_STATUSES).toContain('novo');
    expect(LEAD_STATUSES).toContain('fechado');
  });
});
```

> Nota: o teste real do fluxo de auth fica em E2E (Task 8) — testar NextAuth handlers em unit dá baixo ROI.

- [ ] **Step 3: Rodar — deve PASSAR**

```bash
pnpm test
```

Expected: 2 tests passing.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts apps/web/tests
git commit -m "test(web): sanity tests for shared constants"
```

---

## Task 8: E2E Playwright (login flow)

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/tests/e2e/login.spec.ts`

- [ ] **Step 1: Instalar Playwright browsers**

```bash
cd apps/web
pnpm exec playwright install chromium
```

- [ ] **Step 2: Criar `apps/web/playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: { baseURL: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 3: Escrever E2E (não valida envio de email real, só UI flow)**

`apps/web/tests/e2e/login.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test('login page renders and submits to check-email', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();

  await page.getByPlaceholder('seu@email.com').fill('teste@example.com');
  await page.getByRole('button', { name: /receber link/i }).click();

  await expect(page).toHaveURL(/check-email/);
  await expect(page.getByRole('heading', { name: /confira seu email/i })).toBeVisible();
});

test('protected route redirects to /login', async ({ page }) => {
  // Página /leads ainda não existe nesta sprint, usa qualquer rota não pública
  await page.goto('/buscar');
  await expect(page).toHaveURL(/login/);
});
```

- [ ] **Step 4: Rodar — deve PASSAR ambos os testes**

```bash
pnpm test:e2e
```

Expected: 1º passa (UI render + submit + redirect). 2º passa porque o middleware redireciona qualquer rota não pública pra `/login`, mesmo que a rota destino (`/buscar`) ainda não exista (o redirect acontece antes do render). Se 2º falhar, verificar matcher do middleware.

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/tests/e2e
git commit -m "test(web): E2E login flow + auth redirect"
```

---

## Task 9: ESLint + Prettier

**Files:**
- Create: `eslint.config.mjs`

- [ ] **Step 1: Adicionar deps**

```bash
pnpm add -D -w eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-config-next
```

- [ ] **Step 2: Criar `eslint.config.mjs`** (flat config, ESLint 9)

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from 'eslint-config-next';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**'],
  },
];
```

- [ ] **Step 3: Rodar lint**

```bash
pnpm lint
```

Expected: 0 erros (warnings OK).

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "chore: add ESLint flat config"
```

---

## Task 10: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: cnpjscrap
          POSTGRES_PASSWORD: cnpjscrap_dev
          POSTGRES_DB: cnpjscrap
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U cnpjscrap"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://cnpjscrap:cnpjscrap_dev@localhost:5432/cnpjscrap?schema=app
      NEXTAUTH_SECRET: ci-secret-not-used
      NEXTAUTH_URL: http://localhost:3000
      RESEND_API_KEY: re_ci_dummy
      EMAIL_FROM: ci@cnpjscrap.local

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.3 }
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Create app schema
        run: PGPASSWORD=cnpjscrap_dev psql -h localhost -U cnpjscrap -d cnpjscrap -c "CREATE SCHEMA IF NOT EXISTS app;"

      - name: Prisma migrate
        run: pnpm --filter @cnpjscrap/db prisma migrate deploy

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter @cnpjscrap/web build
```

- [ ] **Step 2: Commit + push pra branch + abrir PR de teste**

```bash
git add .github
git commit -m "ci: add GitHub Actions workflow"
git checkout -b ci-test
git push -u origin ci-test
# Abre PR no GitHub, observa Actions
```

Expected: CI verde em todos os steps.

- [ ] **Step 3: Merge no main**

```bash
git checkout main
git merge ci-test
git push
git branch -d ci-test
git push origin --delete ci-test
```

---

## Task 11: Validação final de Foundation

- [ ] **Step 1: Reset completo e bootstrap from scratch**

```bash
pnpm docker:down -v
docker volume rm cnpjscrap_pgdata || true
rm -rf node_modules apps/*/node_modules packages/*/node_modules pnpm-lock.yaml

pnpm install
pnpm docker:up
sleep 5
docker compose exec postgres psql -U cnpjscrap -c "CREATE SCHEMA IF NOT EXISTS app;"
pnpm --filter @cnpjscrap/db prisma migrate deploy
pnpm db:seed
pnpm test
pnpm test:e2e
pnpm dev
```

Expected: chega em `http://localhost:3000`, login funciona, todos os testes passam.

- [ ] **Step 2: Atualizar README com setup verificado**

Substituir bloco `## Dev` no `README.md`:

````markdown
## Dev — primeira vez

```bash
pnpm install
pnpm docker:up

# cria schema (one-shot)
docker compose exec postgres psql -U cnpjscrap -c "CREATE SCHEMA IF NOT EXISTS app;"

# migrate + seed
pnpm --filter @cnpjscrap/db prisma migrate deploy
pnpm db:seed

# copia env e ajusta secrets
cp apps/web/.env.example apps/web/.env.local
# preenche NEXTAUTH_SECRET e RESEND_API_KEY

pnpm dev
```

## Comandos úteis

| Comando | O quê |
|---------|-------|
| `pnpm dev` | App em dev |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Playwright |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TS strict |
| `pnpm db:migrate` | Cria migration nova |
| `pnpm docker:up/down` | Postgres + Redis |
````

- [ ] **Step 3: Commit final**

```bash
git add README.md
git commit -m "docs: update README with verified setup steps"
git push
```

---

## Definition of Done — Foundation

- [ ] `pnpm install` limpo funciona em máquina nova
- [ ] `docker compose up -d` sobe postgres + redis healthy
- [ ] `pnpm --filter @cnpjscrap/db prisma migrate deploy` cria tabelas no schema `app`
- [ ] `pnpm db:seed` popula tabela `plans` com 3 rows
- [ ] `pnpm dev` abre app em http://localhost:3000
- [ ] `/login` mostra form, submit redireciona pra `/login/check-email`
- [ ] Link recebido por email loga e redireciona pra `/`
- [ ] `pnpm test` passa todos os unit tests
- [ ] `pnpm test:e2e` passa happy path do login
- [ ] `pnpm lint` zero erros
- [ ] `pnpm typecheck` zero erros
- [ ] CI verde no GitHub Actions
- [ ] README documenta setup completo

---

## Próximos planos (a expandir quando começar cada sprint)

### Plano 2 — RF Import Engine
- Schema `rf` (estabelecimentos, empresas, socios, cnaes, municipios)
- Downloader paralelo (axios + p-limit)
- Unzipper streaming
- COPY em tabelas `_staging`
- Swap atômico via transaction
- Cron mensal no worker
- Logging em `app.import_log`
- Smoke test com CSV fixture de 100 linhas

### Plano 3 — Extraction & Enrichment
- Package `@cnpjscrap/providers` com interface `LeadProvider`
- Provider `receita-federal` (source) com SQL raw da query principal
- Provider `rf-self-contact` (enricher)
- Provider `site-scraper` (Cheerio + Playwright fallback)
- `apps/worker` (Node + BullMQ consumer)
- Cache negativo em `enrichments`
- CLI/API endpoint `/api/search` retornando leads via SSE

### Plano 4 — UI Buscar + CRM + Quota
- `/buscar` com filtros + SSE streaming
- CNAE multi-select com search
- UF→município cascata
- `/leads` com tabela, status inline, bulk select
- Export CSV (UTF-8 BOM) + XLSX (exceljs)
- `lib/quota` com `consumeQuota()`
- `/conta` com plano + barra de quota
- Cron diário de reset de quota
- Billing stub: rota `?upgrade=pro` com "Em breve"

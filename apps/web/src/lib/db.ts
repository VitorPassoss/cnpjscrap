/**
 * Persistência simples em Postgres — uma única linha de configuração global
 * (sem login). Guarda a chave da API do Casa dos Dados e o template padrão.
 *
 * A tabela se autocria na primeira consulta, então basta ter a DATABASE_URL
 * apontando pra um Postgres (ex.: o do Railway) — sem rodar migrations.
 */

import { Pool } from 'pg';

export interface TemplateItem {
  id: string;
  name: string;
  html: string;
}

export interface Settings {
  apiKey: string;
  template: string;
  disparoMsg: string;
  templates: TemplateItem[];
  activeTemplateId: string;
}

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  if (!pool) {
    const url = process.env.DATABASE_URL;
    // Railway e a maioria dos Postgres gerenciados exigem SSL.
    const needsSsl = /sslmode=require/.test(url) || /\.railway\.app|\.rlwy\.net|render\.com|neon\.tech|supabase/.test(url);
    pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

let ready: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ready) {
    ready = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS app_settings (
           id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
           api_key    TEXT NOT NULL DEFAULT '',
           template   TEXT NOT NULL DEFAULT '',
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         );
         INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
         ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS disparo_msg TEXT NOT NULL DEFAULT '';
         ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS templates JSONB NOT NULL DEFAULT '[]'::jsonb;
         ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS active_template_id TEXT NOT NULL DEFAULT '';
         CREATE TABLE IF NOT EXISTS lead_links (
           code       TEXT PRIMARY KEY,
           payload    JSONB NOT NULL,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         );`,
      )
      .then(() => undefined)
      .catch((e) => {
        ready = null; // permite nova tentativa numa próxima request
        throw e;
      });
  }
  return ready;
}

export async function getSettings(): Promise<Settings> {
  await ensureTable();
  const r = await getPool().query<{
    api_key: string;
    template: string;
    disparo_msg: string;
    templates: TemplateItem[] | null;
    active_template_id: string;
  }>('SELECT api_key, template, disparo_msg, templates, active_template_id FROM app_settings WHERE id = 1');
  const row = r.rows[0];
  return {
    apiKey: row?.api_key ?? '',
    template: row?.template ?? '',
    disparoMsg: row?.disparo_msg ?? '',
    templates: Array.isArray(row?.templates) ? row!.templates : [],
    activeTemplateId: row?.active_template_id ?? '',
  };
}

/** Atualiza só os campos enviados (undefined = não mexe). */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  await ensureTable();
  await getPool().query(
    `UPDATE app_settings
        SET api_key            = COALESCE($1, api_key),
            template           = COALESCE($2, template),
            disparo_msg        = COALESCE($3, disparo_msg),
            templates          = COALESCE($4::jsonb, templates),
            active_template_id = COALESCE($5, active_template_id),
            updated_at         = now()
      WHERE id = 1`,
    [
      patch.apiKey ?? null,
      patch.template ?? null,
      patch.disparoMsg ?? null,
      patch.templates ? JSON.stringify(patch.templates) : null,
      patch.activeTemplateId ?? null,
    ],
  );
  return getSettings();
}

// ───────────────────── encurtador de link de lead ─────────────────────

/** Insere um payload sob o `code` (no-op se o código já existir). */
export async function createLeadLink(code: string, payload: unknown): Promise<boolean> {
  await ensureTable();
  const r = await getPool().query(
    'INSERT INTO lead_links (code, payload) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
    [code, JSON.stringify(payload)],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Insere vários links de uma vez (um INSERT só). */
export async function createLeadLinksBatch(rows: { code: string; payload: unknown }[]): Promise<void> {
  if (!rows.length) return;
  await ensureTable();
  const values: string[] = [];
  const params: unknown[] = [];
  rows.forEach((r, i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(r.code, JSON.stringify(r.payload));
  });
  await getPool().query(
    `INSERT INTO lead_links (code, payload) VALUES ${values.join(', ')} ON CONFLICT (code) DO NOTHING`,
    params,
  );
}

/** Lê o payload de um código curto. */
export async function getLeadLink<T = unknown>(code: string): Promise<T | null> {
  await ensureTable();
  const r = await getPool().query<{ payload: T }>('SELECT payload FROM lead_links WHERE code = $1', [code]);
  return r.rows[0]?.payload ?? null;
}

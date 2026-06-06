import { dbConfigured, getSettings } from './db';

/**
 * Resolve a chave da API do Casa dos Dados no servidor, nesta ordem:
 *  1. header `x-api-key` (override pontual, raramente usado);
 *  2. configuração salva no banco;
 *  3. variável de ambiente CASADOSDADOS_API_KEY (fallback de dev).
 *
 * A chave nunca trafega de volta pro navegador.
 */
export async function resolveApiKey(req: Request): Promise<string> {
  const header = req.headers.get('x-api-key');
  if (header) return header;

  if (dbConfigured()) {
    try {
      const { apiKey } = await getSettings();
      if (apiKey) return apiKey;
    } catch {
      // banco indisponível → cai pro env
    }
  }

  return process.env.CASADOSDADOS_API_KEY || '';
}

# Página viva por CNPJ — versão PHP (Railway)

Versão standalone do `/cnpj/<cnpj>` do app Next, em PHP puro (1 arquivo).
Recebe um CNPJ, consulta a **BrasilAPI** (grátis) e renderiza o template.

## Arquivos
- `index.php` — lógica + o **template** (mesmo HTML/chaves do editor do app).
- `router.php` — roteia `/cnpj/<cnpj>` e `?cnpj=` para o `index.php`.
- `Dockerfile` — `php:8.2-cli` rodando o servidor embutido na `$PORT`.
- `railway.json` — manda a Railway buildar pelo Dockerfile.

## Trocar o template
Edite a função `template()` no fim do `index.php`. É o **mesmo HTML** que você
cola no editor do app, com `{{nomeFantasia}}`, `{{cnpjFormatado}}`,
`{{whatsappLink}}`, etc. (todas as chaves do `leadLink.ts`).
Os dados também ficam em `window.LEAD` para o JS do template.

## Rodar local (com PHP instalado)
```
php -S 0.0.0.0:8080 -t . router.php
# http://localhost:8080/?cnpj=19131243000197
```

## Deploy na Railway
1. `New Project → Deploy from GitHub` (ou `railway up` na pasta `php/`).
2. Em **Settings → Root Directory**, aponte para `php` se o repo tiver mais coisa.
3. A Railway lê o `railway.json`, builda o Dockerfile e injeta `$PORT`.
4. Acesse `https://<seu-app>.up.railway.app/?cnpj=...`

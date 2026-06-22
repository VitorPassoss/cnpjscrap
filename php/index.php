<?php
/**
 * Página viva por CNPJ — versão PHP standalone (deploy na Railway).
 *
 * Faz o mesmo que /cnpj/<cnpj> do app Next: recebe um CNPJ, consulta os dados
 * públicos na BrasilAPI (grátis), troca os {{placeholders}} do template e
 * devolve o HTML pronto (Tailwind via CDN).
 *
 * Uso:
 *   /?cnpj=12345678000190     ou      /cnpj/12345678000190
 *
 * Para trocar o template: edite a constante TEMPLATE lá embaixo — é o MESMO
 * HTML que você cola no editor do app (mesmas chaves: {{nomeFantasia}}, etc.).
 */

declare(strict_types=1);

// ───────────────────────── 1. CNPJ da requisição ─────────────────────────

$raw  = $_GET['cnpj'] ?? '';
if ($raw === '') {
    // suporta /cnpj/<digitos> além de ?cnpj=
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
    if (preg_match('~/cnpj/([0-9./-]+)~', $path, $m)) {
        $raw = $m[1];
    }
}
$cnpj = preg_replace('/\D/', '', (string) $raw);

// ───────────────────────── 2. consulta o lead ─────────────────────────

/** Busca os dados públicos na BrasilAPI. Retorna array ou null. */
function fetchCnpj(string $cnpj): ?array
{
    $url = "https://brasilapi.com.br/api/cnpj/v1/{$cnpj}";
    $ctx = stream_context_create(['http' => [
        'timeout' => 12,
        'header'  => "Accept: application/json\r\nUser-Agent: cnpjscrap-php\r\n",
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        return null;
    }
    $data = json_decode($body, true);
    return is_array($data) && !empty($data['cnpj']) ? $data : null;
}

// ───────────────────────── 3. monta as variáveis ─────────────────────────

$ESTADOS = [
    'AC' => 'Acre', 'AL' => 'Alagoas', 'AP' => 'Amapá', 'AM' => 'Amazonas',
    'BA' => 'Bahia', 'CE' => 'Ceará', 'DF' => 'Distrito Federal', 'ES' => 'Espírito Santo',
    'GO' => 'Goiás', 'MA' => 'Maranhão', 'MT' => 'Mato Grosso', 'MS' => 'Mato Grosso do Sul',
    'MG' => 'Minas Gerais', 'PA' => 'Pará', 'PB' => 'Paraíba', 'PR' => 'Paraná',
    'PE' => 'Pernambuco', 'PI' => 'Piauí', 'RJ' => 'Rio de Janeiro', 'RN' => 'Rio Grande do Norte',
    'RS' => 'Rio Grande do Sul', 'RO' => 'Rondônia', 'RR' => 'Roraima', 'SC' => 'Santa Catarina',
    'SP' => 'São Paulo', 'SE' => 'Sergipe', 'TO' => 'Tocantins',
];

function formatCnpj(string $d): string
{
    return strlen($d) === 14
        ? preg_replace('/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/', '$1.$2.$3/$4-$5', $d)
        : $d;
}

function brl($n): string
{
    $v = (float) $n;
    return $v ? 'R$ ' . number_format($v, 2, ',', '.') : '';
}

/** Telefone "DDD 9XXXXXXXX" → só dígitos com 55 na frente. */
function waNumber(string $phone): string
{
    $d = preg_replace('/\D/', '', $phone);
    if ($d === '') return '';
    return strncmp($d, '55', 2) === 0 ? $d : '55' . $d;
}

/** Monta o mapa plano de variáveis a partir da resposta da BrasilAPI. */
function buildVars(array $d, array $estados): array
{
    $uf        = strtoupper((string) ($d['uf'] ?? ''));
    $municipio = (string) ($d['municipio'] ?? '');
    $logr      = trim(((string) ($d['descricao_tipo_de_logradouro'] ?? '')) . ' ' . ((string) ($d['logradouro'] ?? '')));
    $numero    = (string) ($d['numero'] ?? '');
    $compl     = (string) ($d['complemento'] ?? '');
    $bairro    = (string) ($d['bairro'] ?? '');
    $cep       = (string) ($d['cep'] ?? '');

    $endereco        = trim("{$logr} {$numero} {$compl}");
    $enderecoCompleto = implode(', ', array_filter([
        $endereco,
        $bairro,
        $municipio ? "{$municipio}/{$uf}" : $uf,
        $cep,
    ]));

    $telefone = (string) ($d['ddd_telefone_1'] ?? '');
    $wa       = waNumber($telefone);
    $razao    = (string) ($d['razao_social'] ?? '');
    $fantasia = (string) ($d['nome_fantasia'] ?? '');

    return [
        'cnpj'             => (string) ($d['cnpj'] ?? ''),
        'cnpjFormatado'    => formatCnpj((string) ($d['cnpj'] ?? '')),
        'razaoSocial'      => $razao,
        'nomeFantasia'     => $fantasia !== '' ? $fantasia : $razao,
        'situacao'         => (string) ($d['descricao_situacao_cadastral'] ?? ''),
        'dataAbertura'     => (string) ($d['data_inicio_atividade'] ?? ''),
        'porte'            => (string) ($d['porte'] ?? ''),
        'naturezaJuridica' => (string) ($d['natureza_juridica'] ?? ''),
        'capitalSocial'    => brl($d['capital_social'] ?? 0),
        'uf'               => $uf,
        'estado'           => $estados[$uf] ?? $uf,
        'municipio'        => $municipio,
        'cidade'           => $municipio,
        'bairro'           => $bairro,
        'cep'              => $cep,
        'logradouro'       => $logr,
        'numero'           => $numero,
        'complemento'      => $compl,
        'endereco'         => $endereco,
        'enderecoCompleto' => $enderecoCompleto,
        'local'            => $municipio ? "{$municipio}/{$uf}" : $uf,
        'whatsapp'         => $telefone,
        'whatsappLink'     => $wa ? "https://api.whatsapp.com/send?phone={$wa}" : '',
        'telefone'         => $telefone,
        'telefones'        => $telefone,
        'celular'          => $telefone,
        'email'            => strtolower((string) ($d['email'] ?? '')),
        'emails'           => strtolower((string) ($d['email'] ?? '')),
        'fonte'            => "https://brasilapi.com.br/api/cnpj/v1/" . (string) ($d['cnpj'] ?? ''),
    ];
}

// ───────────────────────── 4. template → HTML ─────────────────────────

/** Troca {{variavel}} pelo valor (escapando HTML), igual ao applyTemplate do app. */
function applyTemplate(string $tpl, array $vars): string
{
    return preg_replace_callback('/\{\{\s*(\w+)\s*\}\}/', function ($m) use ($vars) {
        return htmlspecialchars((string) ($vars[$m[1]] ?? ''), ENT_QUOTES, 'UTF-8');
    }, $tpl);
}

/** Documento completo com Tailwind via CDN + window.LEAD (igual buildDoc do app). */
function buildDoc(string $body, array $vars): string
{
    $json = json_encode($vars, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
    return '<!doctype html><html lang="pt-BR"><head>'
        . '<meta charset="utf-8"/>'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
        . '<script src="https://cdn.tailwindcss.com"></script>'
        . "<script>window.LEAD={$json};window.lead=window.LEAD;</script>"
        . "</head><body>{$body}</body></html>";
}

// ───────────────────────── 5. resposta ─────────────────────────

header('Content-Type: text/html; charset=utf-8');

$notFound = function (string $msg): void {
    http_response_code(404);
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
        . '<script src="https://cdn.tailwindcss.com"></script></head>'
        . '<body class="min-h-screen flex items-center justify-center bg-zinc-100 p-6 text-center">'
        . '<div><p class="text-lg font-semibold text-zinc-800">' . htmlspecialchars($msg) . '</p>'
        . '<p class="mt-1 text-sm text-zinc-500">Informe um CNPJ válido: <code>?cnpj=00000000000000</code></p></div>'
        . '</body></html>';
};

if (strlen($cnpj) !== 14) {
    $notFound('CNPJ inválido');
    exit;
}

$data = fetchCnpj($cnpj);
if ($data === null) {
    $notFound('Lead não encontrado');
    exit;
}

$vars = buildVars($data, $ESTADOS);
echo buildDoc(applyTemplate(template(), $vars), $vars);


// ═══════════════════════════ TEMPLATE ═══════════════════════════
//
// É o MESMO HTML que você cola no editor do app. Edite à vontade —
// use {{nomeFantasia}}, {{cnpjFormatado}}, {{whatsappLink}}, etc.
//
function template(): string
{
    return <<<'HTML'
<div class="min-h-screen bg-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
    <div class="bg-emerald-600 px-6 py-5 text-white">
      <p class="text-xs uppercase tracking-wide text-emerald-100">{{situacao}} · {{porte}}</p>
      <h1 class="mt-1 text-xl font-bold leading-tight">{{nomeFantasia}}</h1>
      <p class="text-sm text-emerald-100">{{razaoSocial}}</p>
    </div>
    <div class="px-6 py-5 space-y-3 text-sm text-zinc-700">
      <div class="flex justify-between gap-4"><span class="text-zinc-400">CNPJ</span><span class="font-mono">{{cnpjFormatado}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Cidade/Estado</span><span class="text-right">{{cidade}} — {{estado}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Endereço</span><span class="text-right">{{enderecoCompleto}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Aberta em</span><span>{{dataAbertura}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Capital</span><span>{{capitalSocial}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">E-mail</span><span>{{email}}</span></div>
    </div>
    <div class="px-6 pb-6">
      <a href="{{whatsappLink}}" target="_blank"
         class="block rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white hover:bg-emerald-700">
        Chamar no WhatsApp · {{whatsapp}}
      </a>
    </div>
  </div>
</div>
HTML;
}

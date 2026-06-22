<?php
/**
 * Router do servidor embutido do PHP (php -S).
 * Arquivos estáticos reais são servidos direto; todo o resto cai no index.php
 * (assim /cnpj/<cnpj> e /?cnpj=... funcionam).
 */
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$file = __DIR__ . $path;
if ($path !== '/' && is_file($file) && !is_dir($file)) {
    return false; // deixa o php -S servir o arquivo estático
}
require __DIR__ . '/index.php';

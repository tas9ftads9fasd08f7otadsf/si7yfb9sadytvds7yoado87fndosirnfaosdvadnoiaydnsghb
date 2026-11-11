<?php

declare(strict_types=1);

// The site's one entry, under Apache, nginx (`try_files $uri /index.php`) or `php -S … index.php`.
require __DIR__ . '/Site.php';

$answer = Site::inFolder(__DIR__)->answer(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    $_SERVER['REQUEST_URI'] ?? '/',
    Site::scriptName($_SERVER, __FILE__),
    $_SERVER['HTTP_IF_NONE_MATCH'] ?? ''
);
http_response_code($answer->status);
foreach ($answer->headers as $name => $value) {
    header($name . ': ' . $value);
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
    echo $answer->body;
}

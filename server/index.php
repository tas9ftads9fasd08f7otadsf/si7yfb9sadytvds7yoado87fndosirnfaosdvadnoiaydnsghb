<?php

declare(strict_types=1);

// The site's one entry, under Apache, nginx (`try_files $uri /index.php`) or `php -S … index.php`.
require __DIR__ . '/Site.php';
require __DIR__ . '/Regions.php';

$answer = Site::inFolder(__DIR__)->answer(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    $_SERVER['REQUEST_URI'] ?? '/',
    Site::scriptName($_SERVER, __FILE__),
    $_SERVER['HTTP_IF_NONE_MATCH'] ?? '',
    $_SERVER['HTTP_RANGE'] ?? ''
);
http_response_code($answer->status);
foreach ($answer->headers as $name => $value) {
    header($name . ': ' . $value);
}
if ($answer->stream !== null) {
    // A region package is hundreds of megabytes: sent as it arrives, not compressed or held back.
    @ini_set('zlib.output_compression', '0');
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    @set_time_limit(0);
    while (!feof($answer->stream) && !connection_aborted()) {
        $chunk = fread($answer->stream, 65536);
        if ($chunk === false || $chunk === '') {
            break;
        }
        echo $chunk;
        flush();
    }
    fclose($answer->stream);
} elseif (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
    echo $answer->body;
}

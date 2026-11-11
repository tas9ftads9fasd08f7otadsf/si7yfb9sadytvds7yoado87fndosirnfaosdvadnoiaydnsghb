<?php

declare(strict_types=1);

/** What the site sends back: a status, its headers and the body. */
final class Answer
{
    /** @param array<string, string> $headers */
    public function __construct(public int $status, public array $headers = [], public string $body = '')
    {
    }
}

/**
 * The site's files, its page at every screen's address and its config, and nothing else:
 * no maps, no accounts, no request made on anyone's behalf.
 */
final class Site
{
    /** Where the build's addresses start; replaced with the path this file is served under. */
    public const PLACEHOLDER = '/__riki_base__';

    private const TYPES = [
        'html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8', 'json' => 'application/json; charset=utf-8',
        'txt' => 'text/plain; charset=utf-8', 'svg' => 'image/svg+xml', 'wasm' => 'application/wasm',
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'ico' => 'image/x-icon', 'woff2' => 'font/woff2',
    ];
    private const FILLED = ['html', 'js', 'css', 'json', 'txt', 'svg'];

    /**
     * @param list<string> $pageSegments
     * @param array<string, mixed>|null $config
     */
    public function __construct(private string $root, private array $pageSegments, private ?array $config)
    {
    }

    /** The site as a release's zip lays it out: `out/`, `site.json` and the deploy's `config.php`. */
    public static function inFolder(string $folder): self
    {
        $site = json_decode((string) @file_get_contents($folder . '/site.json'), true);
        $config = is_file($folder . '/config.php') ? require $folder . '/config.php' : null;
        return new self($folder . '/out', is_array($site) ? ($site['pageSegments'] ?? []) : [],
            is_array($config) ? $config : null);
    }

    /**
     * The script's address: `SCRIPT_NAME`, except under `php -S`, which runs this file as a router
     * and names the asked path there; then where the file sits under the document root.
     *
     * @param array<string, mixed> $server
     */
    public static function scriptName(array $server, string $file): string
    {
        $named = (string) ($server['SCRIPT_NAME'] ?? '');
        if (str_ends_with($named, '/' . basename($file))) {
            return $named;
        }
        $root = realpath((string) ($server['DOCUMENT_ROOT'] ?? ''));
        $real = realpath($file);
        if ($root !== false && $real !== false && str_starts_with($real, rtrim($root, '/') . '/')) {
            return substr($real, strlen(rtrim($root, '/')));
        }
        return '/' . basename($file);
    }

    /** `""` at a domain's root, `"/editor"` when this file is served from that folder. */
    public static function base(string $scriptName): string
    {
        $folder = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
        return $folder === '.' ? '' : $folder;
    }

    public function answer(string $method, string $uri, string $scriptName, string $ifNoneMatch = ''): Answer
    {
        if ($method !== 'GET' && $method !== 'HEAD') {
            return new Answer(405, ['Allow' => 'GET, HEAD']);
        }
        $base = self::base($scriptName);
        $path = rawurldecode((string) (parse_url($uri, PHP_URL_PATH) ?? '/'));
        if ($base !== '') {
            if ($path === $base) {
                return $this->page($base, $ifNoneMatch);
            }
            if (!str_starts_with($path, $base . '/')) {
                return new Answer(404);
            }
            $path = substr($path, strlen($base));
        }
        if ($path === '' || $path === '/' || $path === '/index.html' || $path === '/index.php') {
            return $this->page($base, $ifNoneMatch);
        }
        if ($path === '/config.json') {
            return $this->config === null ? new Answer(404)
                : $this->sent(json_encode($this->config, JSON_UNESCAPED_SLASHES), 'json', 'no-store', $ifNoneMatch);
        }
        $segments = explode('/', ltrim($path, '/'));
        if (in_array($segments[0], $this->pageSegments, true)) {
            return $this->page($base, $ifNoneMatch);
        }
        return $this->file($segments, $base, $ifNoneMatch);
    }

    private function page(string $base, string $ifNoneMatch): Answer
    {
        $page = @file_get_contents($this->root . '/index.html');
        return $page === false ? new Answer(404) : $this->sent(self::filled($page, $base), 'html', 'no-cache', $ifNoneMatch);
    }

    /** @param list<string> $segments */
    private function file(array $segments, string $base, string $ifNoneMatch): Answer
    {
        foreach ($segments as $segment) {
            // A dot file, `..` or an empty segment never names one of the build's files.
            if ($segment === '' || str_starts_with($segment, '.') || str_contains($segment, "\0")) {
                return new Answer(404);
            }
        }
        $root = realpath($this->root);
        $found = realpath($this->root . '/' . implode('/', $segments));
        if ($root === false || $found === false || !is_file($found) || !str_starts_with($found, $root . '/')) {
            return new Answer(404);
        }
        $kind = strtolower(pathinfo($found, PATHINFO_EXTENSION));
        $body = (string) file_get_contents($found);
        if (in_array($kind, self::FILLED, true)) {
            $body = self::filled($body, $base);
        }
        // A build's own names change with it; everything else is asked again each time.
        $caching = $segments[0] === '_next' && ($segments[1] ?? '') === 'static'
            ? 'public, max-age=31536000, immutable' : 'no-cache';
        return $this->sent($body, $kind, $caching, $ifNoneMatch);
    }

    private function sent(string $body, string $kind, string $caching, string $ifNoneMatch): Answer
    {
        $tag = '"' . sha1($body) . '"';
        $headers = ['Content-Type' => self::TYPES[$kind] ?? 'application/octet-stream', 'Cache-Control' => $caching,
            'ETag' => $tag, 'X-Content-Type-Options' => 'nosniff'];
        if ($ifNoneMatch !== '' && in_array($tag, array_map('trim', explode(',', $ifNoneMatch)), true)) {
            return new Answer(304, $headers);
        }
        return new Answer(200, $headers + ['Content-Length' => (string) strlen($body)], $body);
    }

    private static function filled(string $text, string $base): string
    {
        return str_replace(self::PLACEHOLDER, $base, $text);
    }
}

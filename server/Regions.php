<?php

declare(strict_types=1);

/** Where a request is made: the one place the server reaches out, so a test can stand in for the network. */
interface RegionFetcher
{
    /**
     * @param list<string> $headers
     * @return array{status: int, headers: array<string, string>, body: resource}|null null when nothing answered
     */
    public function get(string $url, array $headers = []): ?array;
}

/** `fopen` over https, following redirects, with a timeout; no header of the browser's is ever passed on. */
final class StreamFetcher implements RegionFetcher
{
    public function __construct(private int $timeout = 30)
    {
    }

    public function get(string $url, array $headers = []): ?array
    {
        $context = stream_context_create(['http' => [
            'method' => 'GET', 'header' => implode("\r\n", $headers), 'ignore_errors' => true,
            'follow_location' => 1, 'max_redirects' => 5, 'timeout' => $this->timeout,
            'user_agent' => 'riki-site-regions', 'protocol_version' => 1.1,
        ], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $body = @fopen($url, 'rb', false, $context);
        if ($body === false) {
            return null;
        }
        /** @var list<string> $http_response_header */
        $lines = $http_response_header ?? [];
        return self::last($lines) + ['body' => $body];
    }

    /**
     * The final answer of the header lines a redirect chain leaves.
     *
     * @param list<string> $lines
     * @return array{status: int, headers: array<string, string>}
     */
    public static function last(array $lines): array
    {
        $status = 0;
        $headers = [];
        foreach ($lines as $line) {
            if (preg_match('~^HTTP/\S+\s+(\d{3})~', $line, $found) === 1) {
                $status = (int) $found[1];
                $headers = [];
            } elseif (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                $headers[strtolower(trim($name))] = trim($value);
            }
        }
        return ['status' => $status, 'headers' => $headers];
    }
}

/**
 * Region packages, which a browser cannot fetch itself: the catalog, kept on disk for a while, and the
 * files it lists, streamed from Google Drive. No other address is ever fetched, and nothing of the browser's
 * goes with a request but a byte range.
 */
final class RegionHost
{
    public const FILE_ID = '/^[A-Za-z0-9_-]{20,}$/';

    /** Where a catalog's file ids are fetched from; `{id}` is the id. */
    public const DRIVE = 'https://drive.usercontent.google.com/download?id={id}&export=download&confirm=t';

    private string $folder;

    public function __construct(
        private string $catalogUrl,
        string $folder,
        private ?RegionFetcher $fetcher = null,
        private string $files = self::DRIVE,
        private int $ttl = 900,
        private ?int $clock = null
    ) {
        $this->fetcher ??= new StreamFetcher();
        // A folder the server cannot write to still keeps the catalog, in the system's own.
        if (!is_dir($folder)) {
            @mkdir($folder, 0777, true);
        }
        $this->folder = is_dir($folder) && is_writable($folder) ? $folder
            : sys_get_temp_dir() . '/riki-regions-' . substr(sha1($folder), 0, 12);
        if (!is_dir($this->folder)) {
            @mkdir($this->folder, 0777, true);
        }
    }

    private function now(): int
    {
        return $this->clock ?? time();
    }

    /** The catalog as last fetched, as a browser may read it. */
    public function catalog(string $ifNoneMatch): Answer
    {
        $body = $this->current();
        if ($body === null) {
            return $this->failure(502, 'The region catalog cannot be fetched now.');
        }
        $tag = '"' . sha1($body) . '"';
        $headers = ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'public, max-age=300',
            'ETag' => $tag, 'X-Content-Type-Options' => 'nosniff'];
        if ($ifNoneMatch !== '' && in_array($tag, array_map('trim', explode(',', $ifNoneMatch)), true)) {
            return new Answer(304, $headers);
        }
        return new Answer(200, $headers + ['Content-Length' => (string) strlen($body)], $body);
    }

    /**
     * One package file by its Drive id, only if the catalog lists it, only as the catalog's size says.
     * The answer's `stream` is the file, which the caller sends and closes.
     */
    public function file(string $id, string $method, string $range): Answer
    {
        if (preg_match(self::FILE_ID, $id) !== 1) {
            return new Answer(404);
        }
        $this->current();
        $size = $this->ids()[$id] ?? null;
        if ($size === null) {
            return new Answer(404);
        }
        $asked = [];
        $partial = preg_match('/^bytes=\d+-\d*$/', $range) === 1;
        if ($partial) {
            $asked[] = 'Range: ' . $range;
        }
        $given = $this->fetcher->get(str_replace('{id}', rawurlencode($id), $this->files), $asked);
        if ($given === null) {
            return $this->failure(502, 'The region host did not answer.', 'no answer');
        }
        $status = $given['status'];
        $headers = $given['headers'];
        if (!in_array($status, [200, 206], true) || ($status === 206 && !$partial)) {
            fclose($given['body']);
            return $this->failure(502, 'The region host refused the download (HTTP ' . $status . '); it may be over its quota, try again later.', 'HTTP ' . $status);
        }
        $type = strtolower($headers['content-type'] ?? 'application/octet-stream');
        if (str_contains($type, 'text/html')) {
            fclose($given['body']);
            return $this->failure(502, 'The region host sent a web page instead of the file (a quota or a confirmation page); try again later.', 'a web page instead of the file');
        }
        $total = $status === 206
            ? (preg_match('~/(\d+)$~', $headers['content-range'] ?? '', $found) === 1 ? (int) $found[1] : null)
            : (isset($headers['content-length']) ? (int) $headers['content-length'] : null);
        if ($total !== null && $total !== $size) {
            fclose($given['body']);
            return $this->failure(502, 'The region host sent a file of ' . $total . ' bytes where the catalog says ' . $size . '.', 'a file of ' . $total . ' bytes');
        }
        $out = ['Content-Type' => 'application/octet-stream', 'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff', 'Accept-Ranges' => 'bytes', 'X-Accel-Buffering' => 'no'];
        foreach (['content-length' => 'Content-Length', 'content-range' => 'Content-Range', 'etag' => 'ETag',
            'last-modified' => 'Last-Modified'] as $from => $to) {
            if (isset($headers[$from])) {
                $out[$to] = $headers[$from];
            }
        }
        if ($method === 'HEAD') {
            fclose($given['body']);
            return new Answer($status, $out);
        }
        $answer = new Answer($status, $out);
        $answer->stream = $given['body'];
        return $answer;
    }

    /** `reason` is the short form the page puts in its own words; `error` is for a person reading the response. */
    private function failure(int $status, string $said, string $reason = ''): Answer
    {
        $body = (string) json_encode(['error' => $said, 'reason' => $reason === '' ? $said : $reason], JSON_UNESCAPED_SLASHES);
        return new Answer($status, ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store',
            'Content-Length' => (string) strlen($body)], $body);
    }

    /** The catalog's text: the kept one while it is fresh, a newer one if the host has it, else the kept one. */
    private function current(): ?string
    {
        $kept = @file_get_contents($this->folder . '/regions-catalog.json');
        $meta = $this->meta();
        $fresh = $kept !== false && $meta !== null && $this->now() - (int) $meta['fetchedAt'] < $this->ttl;
        if ($fresh) {
            return $kept;
        }
        $asked = $kept !== false && $meta !== null && ($meta['etag'] ?? '') !== '' ? ['If-None-Match: ' . $meta['etag']] : [];
        $given = $this->fetcher->get($this->catalogUrl, $asked);
        if ($given !== null && $given['status'] === 304 && $kept !== false && $meta !== null) {
            fclose($given['body']);
            $this->keep($kept, (string) ($meta['etag'] ?? ''), $meta['ids']);
            return $kept;
        }
        if ($given !== null && $given['status'] === 200) {
            $text = (string) stream_get_contents($given['body'], 8 * 1024 * 1024);
            fclose($given['body']);
            $ids = self::idsOf($text);
            if ($ids !== null) {
                $this->keep($text, $given['headers']['etag'] ?? '', $ids);
                return $text;
            }
        } elseif ($given !== null) {
            fclose($given['body']);
        }
        return $kept === false ? null : $kept;
    }

    /** @param array<string, int> $ids */
    private function keep(string $text, string $etag, array $ids): void
    {
        $this->write('regions-catalog.json', $text);
        $this->write('regions-catalog.meta.json', (string) json_encode(['fetchedAt' => $this->now(), 'etag' => $etag, 'ids' => $ids]));
    }

    private function write(string $name, string $text): void
    {
        $temporary = $this->folder . '/' . $name . '.' . bin2hex(random_bytes(4));
        if (@file_put_contents($temporary, $text) !== false) {
            @rename($temporary, $this->folder . '/' . $name);
        }
    }

    /** @return array{fetchedAt: int, etag?: string, ids: array<string, int>}|null */
    private function meta(): ?array
    {
        $read = json_decode((string) @file_get_contents($this->folder . '/regions-catalog.meta.json'), true);
        return is_array($read) && isset($read['fetchedAt']) && is_array($read['ids'] ?? null) ? $read : null;
    }

    /** @return array<string, int> */
    private function ids(): array
    {
        return $this->meta()['ids'] ?? [];
    }

    /**
     * Every download id of a catalog with the size it is listed at, or null for text that is not a catalog.
     *
     * @return array<string, int>|null
     */
    public static function idsOf(string $text): ?array
    {
        $catalog = json_decode($text, true);
        if (!is_array($catalog)) {
            return null;
        }
        $ids = [];
        $walk = static function (mixed $node) use (&$walk, &$ids): void {
            if (!is_array($node)) {
                return;
            }
            if (isset($node['download'], $node['size']) && is_string($node['download']) && is_numeric($node['size'])
                && preg_match('~^https://drive\.google\.com/uc\?(?:[^#]*&)?id=([A-Za-z0-9_-]{20,})(?:&|$)~', $node['download'], $found) === 1) {
                $ids[$found[1]] = (int) $node['size'];
            }
            foreach ($node as $each) {
                $walk($each);
            }
        };
        $walk($catalog);
        return $ids;
    }
}

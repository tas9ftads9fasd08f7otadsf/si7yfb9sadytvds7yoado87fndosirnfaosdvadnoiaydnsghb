<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

/** A stand-in for the network: what each address answers, and what was asked of it. */
final class StubFetcher implements RegionFetcher
{
    /** @var list<array{url: string, headers: list<string>}> */
    public array $asked = [];

    /** @param array<string, array{status: int, headers?: array<string, string>, body?: string}|null> $answers */
    public function __construct(public array $answers)
    {
    }

    public function get(string $url, array $headers = []): ?array
    {
        $this->asked[] = ['url' => $url, 'headers' => $headers];
        $answer = $this->answers[$url] ?? null;
        if ($answer === null) {
            return null;
        }
        $body = fopen('php://temp', 'r+b');
        fwrite($body, $answer['body'] ?? '');
        rewind($body);
        return ['status' => $answer['status'], 'headers' => $answer['headers'] ?? [], 'body' => $body];
    }
}

// 112 the region packages are the one thing the server fetches for the browser, and only as the catalog lists them
final class RegionsTest extends TestCase
{
    private const CATALOG = 'https://catalog.example/maps.json';
    private const ID = '1xfu1OzAYa6PUtmtvSwH4yjVXZ9x9sIHO';
    private const OTHER = '1xPQudJrWi5sZ63-z4NqyWAbsQZJ4iYbD';

    private string $folder;
    private int $now = 1_000_000;

    protected function setUp(): void
    {
        $this->folder = sys_get_temp_dir() . '/riki-regions-test-' . bin2hex(random_bytes(6));
        mkdir($this->folder, 0777, true);
    }

    protected function tearDown(): void
    {
        exec('rm -rf ' . escapeshellarg($this->folder));
    }

    private static function catalog(int $size = 11): string
    {
        return (string) json_encode(['_updated_ts' => 1, 'slovensko' => ['id' => 'slovakia', 'maps' => ['lines' => [
            'download' => 'https://drive.google.com/uc?export=download&id=' . self::ID, 'size' => $size,
            'formats' => ['zip' => ['download' => 'https://drive.google.com/uc?export=download&id=' . self::ID, 'size' => $size]],
        ]]]]);
    }

    private function host(StubFetcher $fetcher, ?string $files = null): RegionHost
    {
        return new RegionHost(self::CATALOG, $this->folder, $fetcher, $files ?? 'https://files.example/get?id={id}', 900, $this->now);
    }

    private function later(StubFetcher $fetcher, int $seconds): RegionHost
    {
        $this->now += $seconds;
        return $this->host($fetcher);
    }

    private static function drive(array $headers = [], string $body = 'hello world', int $status = 200): array
    {
        return ['status' => $status, 'headers' => ['content-type' => 'application/zip', 'content-length' => '11'] + $headers, 'body' => $body];
    }

    public function testTheCatalogIsFetchedOnceAndKeptForAWhile(): void
    {
        $fetcher = new StubFetcher([self::CATALOG => ['status' => 200, 'headers' => ['etag' => '"v1"'], 'body' => self::catalog()]]);
        $host = $this->host($fetcher);
        $first = $host->catalog('');
        $this->assertSame(200, $first->status);
        $this->assertSame(self::catalog(), $first->body);
        $this->assertStringStartsWith('application/json', $first->headers['Content-Type']);
        $this->assertSame(self::catalog(), $host->catalog('')->body);
        $this->assertCount(1, $fetcher->asked, 'a fresh catalog is not fetched again');
        $this->assertSame(304, $host->catalog($first->headers['ETag'])->status);
    }

    public function testAStaleCatalogIsAskedAgainByItsTagAndKeptWhenTheHostSaysUnchanged(): void
    {
        $fetcher = new StubFetcher([self::CATALOG => ['status' => 200, 'headers' => ['etag' => '"v1"'], 'body' => self::catalog()]]);
        $this->host($fetcher)->catalog('');
        $again = new StubFetcher([self::CATALOG => ['status' => 304]]);
        $host = $this->later($again, 901);
        $this->assertSame(self::catalog(), $host->catalog('')->body);
        $this->assertSame(['If-None-Match: "v1"'], $again->asked[0]['headers']);
        $host->catalog('');
        $this->assertCount(1, $again->asked, 'and is then fresh for another while');
    }

    public function testAStaleCatalogTakesTheNewOneTheHostHas(): void
    {
        $this->host(new StubFetcher([self::CATALOG => ['status' => 200, 'body' => self::catalog()]]))->catalog('');
        $newer = new StubFetcher([self::CATALOG => ['status' => 200, 'headers' => ['etag' => '"v2"'], 'body' => self::catalog(22)]]);
        $this->assertSame(self::catalog(22), $this->later($newer, 901)->catalog('')->body);
    }

    public function testTheStaleCatalogIsServedWhenTheHostDoesNotAnswerOrAnswersNonsense(): void
    {
        $this->host(new StubFetcher([self::CATALOG => ['status' => 200, 'body' => self::catalog()]]))->catalog('');
        foreach ([[], [self::CATALOG => ['status' => 500, 'body' => 'oops']], [self::CATALOG => ['status' => 200, 'body' => '<html>']]] as $answers) {
            $down = new StubFetcher($answers);
            $this->assertSame(self::catalog(), $this->later($down, 901)->catalog('')->body);
        }
    }

    public function testWithNoCatalogKeptAndNoneFetchedItIsAnError(): void
    {
        $answer = $this->host(new StubFetcher([]))->catalog('');
        $this->assertSame(502, $answer->status);
        $this->assertStringContainsString('cannot be fetched', $answer->body);
    }

    public function testAFileTheCatalogListsIsStreamedWithItsLengthAndTypeAndNoHeaderOfTheBrowsers(): void
    {
        $fetcher = new StubFetcher([
            self::CATALOG => ['status' => 200, 'body' => self::catalog()],
            'https://files.example/get?id=' . self::ID => self::drive(['etag' => '"f"', 'last-modified' => 'Fri, 01 Jan 2027 00:00:00 GMT',
                'set-cookie' => 'secret=1', 'content-disposition' => 'attachment']),
        ]);
        $answer = $this->host($fetcher)->file(self::ID, 'GET', '');
        $this->assertSame(200, $answer->status);
        $this->assertSame('hello world', stream_get_contents($answer->stream));
        $this->assertSame('11', $answer->headers['Content-Length']);
        $this->assertSame('"f"', $answer->headers['ETag']);
        $this->assertArrayNotHasKey('Set-Cookie', $answer->headers);
        $this->assertSame('private, no-store', $answer->headers['Cache-Control']);
        $this->assertSame([], $fetcher->asked[1]['headers'], 'nothing of the browser goes on');
    }

    public function testOnlyAByteRangeOfTheBrowsersIsPassedOnAndAnswersWithItsRange(): void
    {
        $fetcher = new StubFetcher([
            self::CATALOG => ['status' => 200, 'body' => self::catalog()],
            'https://files.example/get?id=' . self::ID => ['status' => 206, 'headers' => ['content-type' => 'application/zip',
                'content-range' => 'bytes 6-10/11', 'content-length' => '5'], 'body' => 'world'],
        ]);
        $host = $this->host($fetcher);
        $answer = $host->file(self::ID, 'GET', 'bytes=6-');
        $this->assertSame(206, $answer->status);
        $this->assertSame('bytes 6-10/11', $answer->headers['Content-Range']);
        $this->assertSame(['Range: bytes=6-'], $fetcher->asked[1]['headers']);
        // Anything else, a list of ranges or a header injected, is not passed.
        $host->file(self::ID, 'GET', "bytes=0-1,5-6\r\nCookie: x");
        $this->assertSame([], $fetcher->asked[2]['headers']);
    }

    public function testAnIdTheCatalogDoesNotListOrThatIsNotAnIdIsNeverFetched(): void
    {
        $fetcher = new StubFetcher([self::CATALOG => ['status' => 200, 'body' => self::catalog()]]);
        $host = $this->host($fetcher);
        foreach ([self::OTHER, 'short', '..', '../../etc/passwd', 'a b c d e f g h i j k l m n', str_repeat('x', 19), ''] as $id) {
            $this->assertSame(404, $host->file($id, 'GET', '')->status, $id);
        }
        $this->assertCount(1, $fetcher->asked, 'only the catalog was asked');
    }

    public function testTheHostsWebPageIsAnErrorNotTheFile(): void
    {
        $fetcher = new StubFetcher([self::CATALOG => ['status' => 200, 'body' => self::catalog()],
            'https://files.example/get?id=' . self::ID => ['status' => 200, 'headers' => ['content-type' => 'text/html; charset=utf-8'],
                'body' => '<html>Quota exceeded</html>']]);
        $answer = $this->host($fetcher)->file(self::ID, 'GET', '');
        $this->assertSame(502, $answer->status);
        $this->assertNull($answer->stream);
        $this->assertStringContainsString('web page', $answer->body);
    }

    public function testARefusalOrNoAnswerOfTheHostIsAnErrorThatSaysTheStatus(): void
    {
        $answers = [self::CATALOG => ['status' => 200, 'body' => self::catalog()],
            'https://files.example/get?id=' . self::ID => ['status' => 429, 'body' => 'slow down']];
        $refused = $this->host(new StubFetcher($answers))->file(self::ID, 'GET', '');
        $this->assertSame(502, $refused->status);
        $this->assertStringContainsString('HTTP 429', $refused->body);
        $this->assertSame('HTTP 429', json_decode($refused->body, true)['reason']);
        unset($answers['https://files.example/get?id=' . self::ID]);
        $this->assertSame(502, $this->host(new StubFetcher($answers))->file(self::ID, 'GET', '')->status);
    }

    public function testAFileOfAnotherSizeThanTheCatalogSaysIsRefused(): void
    {
        $fetcher = new StubFetcher([self::CATALOG => ['status' => 200, 'body' => self::catalog(999)],
            'https://files.example/get?id=' . self::ID => self::drive()]);
        $answer = $this->host($fetcher)->file(self::ID, 'GET', '');
        $this->assertSame(502, $answer->status);
        $this->assertStringContainsString('11 bytes where the catalog says 999', $answer->body);
    }

    public function testAHeadAsksForTheHeadersAndHoldsNoStream(): void
    {
        $fetcher = new StubFetcher([self::CATALOG => ['status' => 200, 'body' => self::catalog()],
            'https://files.example/get?id=' . self::ID => self::drive()]);
        $answer = $this->host($fetcher)->file(self::ID, 'HEAD', '');
        $this->assertSame(200, $answer->status);
        $this->assertSame('11', $answer->headers['Content-Length']);
        $this->assertNull($answer->stream);
        $this->assertSame('', $answer->body);
    }

    public function testTheDownloadIdsOfACatalogAreListedWithTheirSizes(): void
    {
        $this->assertSame([self::ID => 11], RegionHost::idsOf(self::catalog()));
        $this->assertNull(RegionHost::idsOf('<html>'));
        // Only an address of Drive's download names a file; a link or another host does not.
        $this->assertSame([], RegionHost::idsOf((string) json_encode(['a' => ['download' => 'https://evil.example/uc?id=' . self::ID, 'size' => 1],
            'b' => ['link' => 'https://drive.google.com/file/d/' . self::ID . '/view', 'size' => 1]])));
    }

    public function testStreamFetcherTakesTheLastAnswerOfARedirectChain(): void
    {
        $last = StreamFetcher::last(['HTTP/1.1 303 See Other', 'Location: https://x', 'Content-Length: 0', 'HTTP/2 200 OK',
            'Content-Type: application/zip', 'ETag: "a"']);
        $this->assertSame(['status' => 200, 'headers' => ['content-type' => 'application/zip', 'etag' => '"a"']], $last);
    }
}

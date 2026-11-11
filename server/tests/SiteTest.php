<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

// 37 the site's one PHP file: its base, its page, its files, its config, and nothing else.
final class SiteTest extends TestCase
{
    private string $folder;

    protected function setUp(): void
    {
        $this->folder = sys_get_temp_dir() . '/riki-site-' . bin2hex(random_bytes(6));
        mkdir($this->folder . '/out/_next/static/chunks', 0777, true);
        file_put_contents($this->folder . '/out/index.html',
            '<script src="/__riki_base__/_next/static/chunks/a.js"></script>');
        file_put_contents($this->folder . '/out/_next/static/chunks/a.js', 'const BASE="/__riki_base__";');
        file_put_contents($this->folder . '/out/riki-core.wasm', "\0asm\x01\0\0\0 /__riki_base__");
        file_put_contents($this->folder . '/secret.txt', 'outside the build');
        file_put_contents($this->folder . '/site.json', json_encode(['version' => '0.1.0',
            'pageSegments' => ['maps', 'data', 'servers', 'settings', 'new', 'unlock']]));
        file_put_contents($this->folder . '/config.php',
            "<?php return ['container' => 'iCloud.test', 'apiToken' => 't', 'environment' => 'development'];");
    }

    protected function tearDown(): void
    {
        exec('rm -rf ' . escapeshellarg($this->folder));
    }

    private function ask(string $uri, string $scriptName = '/index.php', string $method = 'GET'): Answer
    {
        return Site::inFolder($this->folder)->answer($method, $uri, $scriptName);
    }

    public function testTheBaseIsTheFolderThisFileIsServedFrom(): void
    {
        $this->assertSame('', Site::base('/index.php'));
        $this->assertSame('/editor', Site::base('/editor/index.php'));
        $this->assertSame('/a/b', Site::base('/a/b/index.php'));
        $this->assertSame('', Site::base('index.php'));
    }

    public function testUnderPhpsOwnServerTheScriptIsFoundUnderTheDocumentRoot(): void
    {
        mkdir($this->folder . '/www/editor', 0777, true);
        $file = $this->folder . '/www/editor/index.php';
        touch($file);
        $this->assertSame('/editor/index.php', Site::scriptName(['SCRIPT_NAME' => '/editor/index.php'], $file));
        $this->assertSame('/editor/index.php', Site::scriptName(['SCRIPT_NAME' => '/editor/maps/M1/edit/layers',
            'DOCUMENT_ROOT' => $this->folder . '/www'], $file));
        $this->assertSame('/index.php', Site::scriptName(['SCRIPT_NAME' => '/maps',
            'DOCUMENT_ROOT' => $this->folder . '/www/editor'], $file));
        $this->assertSame('/index.php', Site::scriptName([], $file));
    }

    public function testEveryScreensAddressIsThePageWithItsBaseFilledIn(): void
    {
        foreach (['/', '/index.html', '/maps', '/maps/M1/edit/layers', '/unlock/7Q4K29', '/data/regions'] as $path) {
            $answer = $this->ask($path);
            $this->assertSame(200, $answer->status, $path);
            $this->assertStringStartsWith('text/html', $answer->headers['Content-Type']);
            $this->assertSame('<script src="/_next/static/chunks/a.js"></script>', $answer->body, $path);
            $this->assertSame('no-cache', $answer->headers['Cache-Control']);
        }
    }

    public function testUnderAPathEveryAddressCarriesIt(): void
    {
        foreach (['/editor', '/editor/', '/editor/maps/M1', '/editor/new'] as $path) {
            $answer = $this->ask($path, '/editor/index.php');
            $this->assertSame(200, $answer->status, $path);
            $this->assertSame('<script src="/editor/_next/static/chunks/a.js"></script>', $answer->body, $path);
        }
        $script = $this->ask('/editor/_next/static/chunks/a.js', '/editor/index.php');
        $this->assertSame('const BASE="/editor";', $script->body);
        $this->assertSame(404, $this->ask('/maps', '/editor/index.php')->status);
        $this->assertSame(404, $this->ask('/editorial/maps', '/editor/index.php')->status);
    }

    public function testTheBuildsFilesAreServedNamedByBuildCachedForAYear(): void
    {
        $script = $this->ask('/_next/static/chunks/a.js');
        $this->assertSame(200, $script->status);
        $this->assertStringStartsWith('text/javascript', $script->headers['Content-Type']);
        $this->assertSame('public, max-age=31536000, immutable', $script->headers['Cache-Control']);

        $core = $this->ask('/riki-core.wasm');
        $this->assertSame('application/wasm', $core->headers['Content-Type']);
        $this->assertStringContainsString('/__riki_base__', $core->body, 'a binary file is sent as it is');
        $this->assertSame('no-cache', $core->headers['Cache-Control']);
    }

    public function testAnUnchangedFileIsAnsweredWithItsTagAlone(): void
    {
        $first = $this->ask('/_next/static/chunks/a.js');
        $again = Site::inFolder($this->folder)->answer('GET', '/_next/static/chunks/a.js', '/index.php',
            $first->headers['ETag']);
        $this->assertSame(304, $again->status);
        $this->assertSame('', $again->body);
    }

    public function testTheConfigComesFromTheDeploysConfigPhp(): void
    {
        $answer = $this->ask('/config.json');
        $this->assertSame(200, $answer->status);
        $this->assertSame('no-store', $answer->headers['Cache-Control']);
        $this->assertSame(['container' => 'iCloud.test', 'apiToken' => 't', 'environment' => 'development'],
            json_decode($answer->body, true));
        unlink($this->folder . '/config.php');
        $this->assertSame(404, $this->ask('/config.json')->status);
    }

    public function testNothingOutsideTheBuildIsReached(): void
    {
        foreach (['/../secret.txt', '/%2e%2e/secret.txt', '/_next/../../secret.txt', '/site.json', '/config.php',
                     '/index.php/../secret.txt', '/.env', '/_next//static/chunks/a.js', '/nothing.js', "/a%00.js"] as $path) {
            $this->assertSame(404, $this->ask($path)->status, $path);
        }
    }

    public function testOnlyReadingIsAnswered(): void
    {
        $answer = $this->ask('/maps', '/index.php', 'POST');
        $this->assertSame(405, $answer->status);
        $this->assertSame('GET, HEAD', $answer->headers['Allow']);
        $this->assertSame(200, $this->ask('/maps', '/index.php', 'HEAD')->status);
    }
}

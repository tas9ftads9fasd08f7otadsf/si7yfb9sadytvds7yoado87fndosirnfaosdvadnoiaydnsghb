"""The map editor's checks for `tools/ready.py`: lint, format, types, unit tests, PHP, build."""

from ready import Check

CODE = ("*.ts", "*.tsx", "*.js", "*.mjs", "*.json", "*.css", "src/*", "e2e/*", "scripts/*", "public/*")
PHP = ("server/*",)
NODE = ["sh", "-c", "[ -d node_modules ] || npm ci --silent"]

CHECKS = [
    Check("ready's tests", ["python3", "tools/test-ready.py"], covers=("tools/*ready*",)),
    Check("dependencies", NODE, covers=CODE, needs="npm"),
    Check("lint", ["npm", "run", "--silent", "lint"], covers=CODE, needs="npm"),
    Check(
        "format",
        ["npx", "prettier", "--check"],
        covers=("*.ts", "*.tsx", "*.js", "*.mjs", "*.css"),
        needs="npm",
        on_paths=True,
    ),
    Check("types", ["npm", "run", "--silent", "typecheck"], covers=CODE, needs="npm"),
    Check("unit tests", ["npm", "test", "--silent"], covers=CODE, needs="npm", waits=True),
    Check(
        "PHP tests",
        ["sh", "-c", "[ -d server/vendor ] || composer install -q --working-dir=server; npm run --silent test:php"],
        covers=PHP,
        needs="php",
        waits=True,
    ),
    Check("build", ["npm", "run", "--silent", "build"], covers=CODE, needs="npm", waits=True, limit=30 * 60),
]

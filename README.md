# kuradb

A PostgreSQL wrapper and ORM foundation for FiveM (FXServer). Built as the database backbone for [Project Kura](https://kura.walteria.net).

---

## Requirements

- FXServer (FiveM)
- PostgreSQL 17+

---

## Installation

> **Do not use "Code -> Download ZIP."** Download the prebuilt release instead.

1. Download the latest release from the [Releases](../../releases) page.
2. Extract into your `resources` folder.
3. Edit `schema.ts` with your tables.
4. Run `bun ./cli.js generate` and then `bun ./cli.js migrate`.
5. Add to your `server.cfg`:

```
ensure kuradb
```

6. Set your connection string in `config.cfg` or via convar:

```
set kuradb_connection_string "postgresql://user:password@localhost:5432/dbname"
```

---

## Building from Source

Requires [Bun](https://bun.sh).

```sh
bun install
bun run build
```

## Schema Workflow

- `schema.ts` is the file you edit.
- `lib/schema.generated.lua` is generated output. Do not edit or ship it manually.
- Run `kuradb generate`, `kuradb migrate`, or `generate --types-only` to recreate it.

---

## Documentation

Full docs at [kura.walteria.net/docs/kuradb](https://kura.walteria.net/docs/kuradb).

---

## Acknowledgments

This project was developed with significant inspiration from [oxmysql](https://github.com/communityox/oxmysql) by [Overextended (Community Ox)](https://coxdocs.dev/).

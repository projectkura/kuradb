# KuraDB

A PostgreSQL wrapper and ORM foundation for FiveM (FXServer). Built as the database backbone for [Project Kura](https://kura.walteria.net).

---

## Requirements

- FXServer (FiveM)
- PostgreSQL 17+
- [Bun](https://bun.sh)

---

## Installation

> **Do not use "Code -> Download ZIP."** The resource must be built before use.

1. Download the latest release from the [Releases](../../releases) page.
2. Extract into your `resources` folder.
3. Install dependencies and build:

```sh
bun install
bun run build
```

4. Add to your `server.cfg`:

```
ensure KuraDB
```

5. Set your connection string in `config.cfg` or via convar:

```
set kuradb_connection_string "postgresql://user:password@localhost:5432/dbname"
```

---

## Documentation

Full docs at [kura.walteria.net/docs/kuradb](https://kura.walteria.net/docs/kuradb).

---

## Acknowledgments

This project was developed with significant inspiration from [oxmysql](https://github.com/communityox/oxmysql) by [Overextended (Community Ox)](https://coxdocs.dev/).

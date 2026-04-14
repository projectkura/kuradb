# KuraDB

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
3. Add to your `server.cfg`:

```
ensure kuradb
```

4. Set your connection string in `config.cfg` or via convar:

```
set kuradb_connection_string "postgresql://user:password@localhost:5432/dbname"
```

---

## Performance

KuraDB ships with prebuilt [pg-native](https://github.com/brianc/node-postgres/tree/master/packages/pg-native) binaries for Linux, which use PostgreSQL's native `libpq` C library for significantly faster query execution.

| Platform | Driver | Notes |
|----------|--------|-------|
| **Linux** | `pg-native` | Requires `libpq5` on the host system |
| **Windows** | `pg` (pure JS) | Automatic fallback, no extra setup needed |

To enable `pg-native` on Linux, install `libpq5`:

```sh
# Debian / Ubuntu
sudo apt install libpq5

# RHEL / CentOS / Fedora
sudo dnf install libpq
```

KuraDB will automatically detect and use `pg-native` when available. If not, it falls back to the pure JavaScript `pg` driver — no configuration needed.

---

## Building from Source

Requires [Bun](https://bun.sh).

```sh
bun install
bun run build
```

To create a full release package (including prebuilt native modules):

```sh
# Linux only — requires libpq-dev
sudo apt install libpq-dev
bun run release
```

The `release/` folder is the drag-and-drop resource ready for deployment.

---

## Documentation

Full docs at [kura.walteria.net/docs/kuradb](https://kura.walteria.net/docs/kuradb).

---

## Acknowledgments

This project was developed with significant inspiration from [oxmysql](https://github.com/communityox/oxmysql) by [Overextended (Community Ox)](https://coxdocs.dev/).

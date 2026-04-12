# kuradb

`kuradb` is the PostgreSQL database wrapper and ORM foundation for Project Kura.

Current focus:
- PostgreSQL-native query engine
- bulk execution via `batch`, `insertMany`, and `COPY`
- transaction options and prepared query paths
- pub/sub via `LISTEN` / `NOTIFY`

Start with the docs in `docs/`:
- `docs/index.md`
- `docs/installation.md`
- `docs/lua-api.md`
- `docs/typescript.md`
- `docs/orm-foundation.md`

### Acknowledgments

This project was developed with significant inspiration from [oxmysql](https://github.com/communityox/oxmysql) by [Overextended (Community Ox)](https://coxdocs.dev/).

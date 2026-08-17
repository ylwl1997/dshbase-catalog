# dshbase-catalog

Query the [dshbase](https://dshbase.com) plugin directory from inside DeepSeek Harness — search, list, and get install commands for 1,100+ community plugins without leaving your session.

## Install

```bash
dsh plugin add dshbase-catalog
```

## Tools

| Tool | Description |
|------|-------------|
| `search_dsh_plugins` | Full-text search across plugin name + description |
| `get_dsh_plugin` | Look up one plugin: install command, verification status, stats |
| `list_dsh_plugins` | List plugins by category |
| `get_dsh_stats` | Catalog totals (plugins, npm vs git, verification) |
| `get_dsh_categories` | All categories with counts |

## Data

The catalog snapshot is regenerated daily from the live [dshbase](https://dshbase.com) directory (see `scripts/sync-catalog.py`), so the built-in index stays current.

## License

MIT

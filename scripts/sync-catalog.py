#!/usr/bin/env python3
"""从 dshbase 的 plugins.json 生成 catalog.json。

用法: python sync-catalog.py <input plugins.json> <output catalog.json>
"""
import json
import sys
from datetime import date

def owner_repo(url):
    return (url or "").replace("https://github.com/", "").rstrip("/")

def main():
    inp, outp = sys.argv[1], sys.argv[2]
    d = json.load(open(inp, encoding="utf-8"))
    plugins = []
    for cat, items in d.items():
        for p in items:
            repo = owner_repo(p.get("url"))
            install = f"dsh plugin add {p['pkg']}" if (p.get("npm") and p.get("pkg")) else f"dsh plugin add github:{repo}"
            plugins.append({
                "name": p["name"],
                "category": cat,
                "url": p.get("url") or "",
                "pkg": p.get("pkg") or "",
                "npm": bool(p.get("npm")),
                "test": p.get("test") or "pending",
                "desc": p.get("desc_en") or p.get("desc") or "",
                "desc_zh": p.get("desc_zh") or "",
                "stars": p.get("stars") or 0,
                "install": install,
                "added": p.get("added") or "",
            })
    plugins.sort(key=lambda x: -(x["stars"] or 0))
    out = {
        "schema_version": 2,
        "updated": date.today().isoformat(),
        "count": len(plugins),
        "plugins": plugins,
    }
    json.dump(out, open(outp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"catalog.json: {len(plugins)} plugins -> {outp}")

if __name__ == "__main__":
    main()

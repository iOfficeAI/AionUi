#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""安全清理历史运行产物目录。"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import List, Dict

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RUNTIME_ROOT = ROOT / "artifacts" / "runtime"
LEGACY_DIR_PATTERNS = [
    re.compile(r"^default-PROD\d{6,}-.+"),
    re.compile(r"^\d{4,}-PROD\d{6,}-.+"),
    re.compile(r"^pc-[^-]+-PROD\d{6,}-.+"),
]


def _matches_legacy_dir(name: str) -> bool:
    return any(pattern.match(name) for pattern in LEGACY_DIR_PATTERNS)


def _directory_age_days(path: Path) -> float:
    stat = path.stat()
    return max(0.0, (time.time() - stat.st_mtime) / 86400.0)


def collect_cleanup_candidates(root: Path, days: int = 0, include_legacy_root: bool = True) -> List[Dict]:
    candidates: List[Dict] = []

    runtime_root = root / DEFAULT_RUNTIME_ROOT.relative_to(ROOT)
    if runtime_root.exists():
        for path in runtime_root.rglob("*"):
            if not path.is_dir():
                continue
            if days > 0 and _directory_age_days(path) < days:
                continue
            candidates.append({
                "path": str(path),
                "kind": "runtime_subdir",
                "age_days": round(_directory_age_days(path), 2),
            })

    if include_legacy_root:
        for path in root.iterdir():
            if not path.is_dir():
                continue
            if not _matches_legacy_dir(path.name):
                continue
            if days > 0 and _directory_age_days(path) < days:
                continue
            candidates.append({
                "path": str(path),
                "kind": "legacy_root_dir",
                "age_days": round(_directory_age_days(path), 2),
            })

    # 仅保留最外层目录，避免 runtime root 里父子目录重复删除
    normalized = []
    seen = set()
    for item in sorted(candidates, key=lambda x: x["path"]):
        p = item["path"]
        if any(p.startswith(existing + os.sep) for existing in seen):
            continue
        normalized.append(item)
        seen.add(p)
    return normalized


def cleanup_candidates(candidates: List[Dict], dry_run: bool = True) -> Dict:
    removed = []
    errors = []
    for item in candidates:
        path = Path(item["path"])
        if dry_run:
            removed.append(dict(item))
            continue
        try:
            shutil.rmtree(path)
            removed.append(dict(item))
        except Exception as exc:
            errors.append({"path": str(path), "error": str(exc)})
    return {
        "dry_run": dry_run,
        "removed": removed,
        "errors": errors,
        "count": len(removed),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="安全清理 blue-ocean-selection 运行产物")
    parser.add_argument("--root", default=str(ROOT), help="仓库根目录")
    parser.add_argument("--days", type=int, default=0, help="仅清理超过 N 天的目录，0 表示全部候选")
    parser.add_argument("--legacy-root-only", action="store_true", help="仅清理仓库根目录历史遗留 default-*/4292150-* 目录")
    parser.add_argument("--apply", action="store_true", help="真的执行删除；默认仅 dry-run")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    candidates = collect_cleanup_candidates(root, days=max(args.days, 0), include_legacy_root=True)
    if args.legacy_root_only:
        candidates = [item for item in candidates if item["kind"] == "legacy_root_dir"]
    result = cleanup_candidates(candidates, dry_run=not args.apply)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Command line entry point: `cse <command> <brand>`."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from . import brand as brandlib
from . import ads, breakdown, briefs, competitors, creative, llm
from .adsource import AdSourceError
from .storage import Storage, StorageError, from_env

log = logging.getLogger("cse")

NOT_BUILT = {
    "voc": "mine voice of customer",
    "report": "write report.md and research-brief.md",
    "run": "all of the above in order",
}


def cmd_init(storage: Storage, slug: str, force: bool = False) -> int:
    key = brandlib.brand_key(slug)
    if storage.exists(key) and not force:
        log.info("%s already exists in %s, leaving it alone (use --force to overwrite)",
                 key, storage.describe())
        return 0
    storage.write_text(key, brandlib.render_template(slug))
    log.info("created %s in %s", key, storage.describe())
    log.info("next: fill in brand.md, then run `cse competitors %s`", slug)
    return 0


def brand_name(storage: Storage, slug: str) -> str:
    key = brandlib.brand_key(slug)
    if storage.exists(key):
        return brandlib.parse(storage.read_text(key))[0].get("name") or slug
    return slug


def cmd_verify(storage: Storage, slug: str, top: int) -> None:
    """Check the ads the briefs will cite (top by score + own) before citing them."""
    import json
    from datetime import datetime, timezone

    all_ads = json.loads(storage.read_text(brandlib.brand_key(slug, "ads.json")))["ads"].values()
    picked = briefs.pick_ads(list(all_ads), datetime.now(timezone.utc).date())[:top]
    ads.verify(storage, slug, [a["ad_id"] for a in picked])


def cmd_seed(storage: Storage, slug: str) -> int:
    root = Path("seed") / brandlib.validate_slug(slug)
    if not root.is_dir():
        raise brandlib.BrandError(f"no seed folder at {root}")
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        key = brandlib.brand_key(slug, path.relative_to(root).as_posix())
        if storage.exists(key):
            log.info("skip %s (already in storage)", key)
            continue
        storage.write_bytes(key, path.read_bytes())
        log.info("uploaded %s", key)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cse", description="Creative strategy engine, Phase 1.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="create the brand folder + brand.md template")
    p.add_argument("brand")
    p.add_argument("--force", action="store_true", help="overwrite an existing brand.md")

    sub.add_parser("competitors", help="build the 3-ring competitor map").add_argument("brand")

    p = sub.add_parser("ads", help="pull competitor + own Meta ads, score them, download media")
    p.add_argument("brand")
    p.add_argument("--pages", type=int, default=1, help="result pages per brand (1 credit each)")

    p = sub.add_parser("creative", help="transcripts, cuts and key frames for new ads")
    p.add_argument("brand")
    p.add_argument("--limit", type=int, help="only the top N new ads by score")
    p.add_argument("--per-brand", type=int, help="only each advertiser's top N ads")

    p = sub.add_parser("breakdown", help="Claude breaks down each analyzed ad (hook, format, angle...)")
    p.add_argument("brand")
    p.add_argument("--limit", type=int, help="only the top N by score")
    p.add_argument("--per-brand", type=int, help="at most N per advertiser")

    p = sub.add_parser("briefs", help="write this week's idea briefs")
    p.add_argument("brand")
    p.add_argument("--count", type=int, default=6)

    p = sub.add_parser("weekly", help="weekly engine: ads -> creative -> breakdown -> briefs")
    p.add_argument("brand")
    p.add_argument("--pages", type=int, default=1)
    p.add_argument("--count", type=int, default=6)

    p = sub.add_parser("verify", help="re-check top ads are still in the Ad Library (1 credit each)")
    p.add_argument("brand")
    p.add_argument("--top", type=int, default=30)

    p = sub.add_parser("seed", help="upload seed/<brand>/ files into storage")
    p.add_argument("brand")

    for name, help_text in NOT_BUILT.items():
        sub.add_parser(name, help=f"{help_text} (not built yet)").add_argument("brand")
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    load_dotenv()
    args = build_parser().parse_args(argv)
    try:
        storage = from_env()
        if args.command == "init":
            return cmd_init(storage, args.brand, args.force)
        if args.command == "competitors":
            competitors.run(storage, args.brand)
            return 0
        if args.command == "ads":
            ads.run(storage, args.brand, max_pages=args.pages)
            return 0
        if args.command == "creative":
            creative.run(storage, args.brand, limit=args.limit, per_brand=args.per_brand)
            return 0
        if args.command == "breakdown":
            breakdown.run(storage, args.brand, brand_name(storage, args.brand), limit=args.limit,
                          per_brand=args.per_brand)
            return 0
        if args.command == "briefs":
            briefs.run(storage, args.brand, brand_name(storage, args.brand), count=args.count)
            return 0
        if args.command == "weekly":
            name = brand_name(storage, args.brand)
            ads.run(storage, args.brand, max_pages=args.pages)
            creative.run(storage, args.brand)
            if breakdown.run(storage, args.brand, name)["waiting"]:
                log.info("weekly: paused for handoff breakdowns; re-run `weekly` when answered.")
                return 0
            cmd_verify(storage, args.brand, 30)
            briefs.run(storage, args.brand, name, count=args.count)
            return 0
        if args.command == "verify":
            cmd_verify(storage, args.brand, args.top)
            return 0
        if args.command == "seed":
            return cmd_seed(storage, args.brand)
        log.error("`%s` is not built yet.", args.command)
        return 2
    except (StorageError, brandlib.BrandError, llm.LLMError, AdSourceError) as e:
        log.error("error: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())

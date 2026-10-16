"""Command line entry point: `cse <command> <brand>`."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from . import brand as brandlib
from . import ads, competitors, llm
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
        if args.command == "seed":
            return cmd_seed(storage, args.brand)
        log.error("`%s` is not built yet.", args.command)
        return 2
    except (StorageError, brandlib.BrandError, llm.LLMError, AdSourceError) as e:
        log.error("error: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())

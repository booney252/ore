"""Command line entry point: `cse <command> <brand>`."""

from __future__ import annotations

import argparse
import logging
import sys

from dotenv import load_dotenv

from . import brand as brandlib
from . import competitors, llm
from .storage import Storage, StorageError, from_env

log = logging.getLogger("cse")

NOT_BUILT = {
    "ads": "pull competitor Meta ads + score them",
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cse", description="Creative strategy engine, Phase 1.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="create the brand folder + brand.md template")
    p.add_argument("brand")
    p.add_argument("--force", action="store_true", help="overwrite an existing brand.md")

    sub.add_parser("competitors", help="build the 3-ring competitor map").add_argument("brand")

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
        log.error("`%s` is not built yet.", args.command)
        return 2
    except (StorageError, brandlib.BrandError, llm.LLMError) as e:
        log.error("error: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())

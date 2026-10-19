"""Command line entry point: `cse <command> <brand>`."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from . import brand as brandlib
from . import ads, breakdown, competitors, creative, formats, ingredients, llm, research, setup, stages, voc
from .adsource import AdSourceError
from .storage import Storage, StorageError, from_env

log = logging.getLogger("cse")

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


def cmd_verify(storage: Storage, slug: str) -> None:
    """Re-check the ads the report may cite, so it never cites a removed ad as live."""
    ads.verify(storage, slug, stages.report_candidates(stages.load_ads(storage, slug)))


def ask_format(given: str | None) -> str:
    """Which format to write in: the flag, else ask (interactive), else UGC."""
    if given:
        return formats.check(given)
    if not sys.stdin.isatty():
        return formats.DEFAULT
    while True:
        answer = input("Format? ugc / broll / static [ugc] ").strip() or formats.DEFAULT
        try:
            return formats.check(answer)
        except ValueError:
            print("Type ugc, broll or static.")


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

    sub.add_parser("setup", help="new brand: profile, competitors, VOC, ads, research brief"
                   ).add_argument("brand")
    sub.add_parser("run", help="same as setup: the whole foundation in order").add_argument("brand")
    sub.add_parser("voc", help="customer quotes: App Store reviews + pasted text").add_argument("brand")
    sub.add_parser("research", help="the 4 research prompts -> research-brief.md").add_argument("brand")
    sub.add_parser("ingredients", help="study-backed claims for each ingredient in brand.md").add_argument("brand")

    p = sub.add_parser("ads", help="pull competitor + own Meta ads, score them, download media")
    p.add_argument("brand")
    p.add_argument("--pages", type=int, default=1, help="result pages per brand (1 credit each)")
    p.add_argument("--only", help="comma-separated competitor names to pull (default: all)")

    p = sub.add_parser("creative", help="transcripts, cuts and key frames for new ads")
    p.add_argument("brand")
    p.add_argument("--limit", type=int, help="only the top N new ads by score")
    p.add_argument("--per-brand", type=int, help="only each advertiser's top N ads")

    p = sub.add_parser("breakdown", help="Claude breaks down each analyzed ad (hook, format, angle...)")
    p.add_argument("brand")
    p.add_argument("--limit", type=int, help="only the top N by score")
    p.add_argument("--per-brand", type=int, help="at most N per advertiser")

    sub.add_parser("report", help="Winning Ads Report: top winners broken down, patterns, gaps"
                   ).add_argument("brand")

    p = sub.add_parser("iterations", help="turn winners from a report into iterations for the brand")
    p.add_argument("brand")
    p.add_argument("--ads", default="", help="winner ranks from the report, e.g. 1,3,5-7")
    p.add_argument("--idea", help="your own idea to build iterations from (winners optional)")
    p.add_argument("--report", help="report date YYYY-MM-DD (default: latest)")
    p.add_argument("--format", choices=list(formats.FORMATS),
                   help="ugc, broll or static (asks if not given)")
    p.add_argument("--per-ad", type=int, default=1,
                   help="iterations per winner, or per idea with --idea (default 1)")

    p = sub.add_parser("briefs", help="turn chosen iterations into full creative briefs")
    p.add_argument("brand")
    p.add_argument("--iterations", help="iterations file name (default: latest)")
    p.add_argument("--numbers", help="iteration numbers in that file, e.g. 1,2")
    p.add_argument("--pick", action="append", default=[],
                   help="FILE:N, repeatable, to mix iterations from different files")

    p = sub.add_parser("weekly", help="ads -> creative -> breakdown -> verify -> report")
    p.add_argument("brand")
    p.add_argument("--pages", type=int, default=1)

    p = sub.add_parser("verify", help="re-check top ads are still in the Ad Library (1 credit each)")
    p.add_argument("brand")

    p = sub.add_parser("worker", help="run requests from the website (jobs/pending in storage)")
    p.add_argument("--once", action="store_true", help="process what's pending, then exit")

    p = sub.add_parser("seed", help="upload seed/<brand>/ files into storage")
    p.add_argument("brand")

    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    load_dotenv()
    args = build_parser().parse_args(argv)
    try:
        storage = from_env()
        if args.command == "init":
            return cmd_init(storage, args.brand, args.force)
        if args.command in ("setup", "run"):
            setup.run(storage, args.brand)
            return 0
        if args.command == "voc":
            voc.run(storage, args.brand)
            return 0
        if args.command == "research":
            research.run(storage, args.brand)
            return 0
        if args.command == "ingredients":
            ingredients.run(storage, args.brand)
            return 0
        if args.command == "competitors":
            competitors.run(storage, args.brand)
            return 0
        if args.command == "ads":
            ads.run(storage, args.brand, max_pages=args.pages,
                    only=[n.strip() for n in args.only.split(",")] if args.only else None)
            return 0
        if args.command == "creative":
            creative.run(storage, args.brand, limit=args.limit, per_brand=args.per_brand)
            return 0
        if args.command == "breakdown":
            breakdown.run(storage, args.brand, brand_name(storage, args.brand), limit=args.limit,
                          per_brand=args.per_brand)
            return 0
        if args.command == "report":
            stages.run_report(storage, args.brand)
            return 0
        if args.command == "iterations":
            report_key = (brandlib.brand_key(args.brand, f"reports/{args.report}.md")
                          if args.report else None)
            stages.run_iterations(storage, args.brand, report_key, stages.parse_numbers(args.ads),
                                  fmt=ask_format(args.format), per_ad=args.per_ad, idea=args.idea)
            return 0
        if args.command == "briefs":
            picks = [(brandlib.brand_key(args.brand, f"iterations/{p.rsplit(':', 1)[0]}.md"),
                      int(p.rsplit(":", 1)[1])) for p in args.pick]
            if args.numbers:
                its_key = (brandlib.brand_key(args.brand, f"iterations/{args.iterations}.md")
                           if args.iterations
                           else stages.latest_key(storage, args.brand, "iterations"))
                picks += [(its_key, n) for n in stages.parse_numbers(args.numbers)]
            stages.run_brief_picks(storage, args.brand, picks)
            return 0
        if args.command == "weekly":
            from . import worker

            try:
                worker.run_weekly(storage, args.brand, pages=args.pages)
            except llm.HandoffPending:
                log.info("weekly: paused for handoff answers; re-run `weekly` when answered.")
            return 0
        if args.command == "verify":
            cmd_verify(storage, args.brand)
            return 0
        if args.command == "worker":
            from . import worker

            worker.loop(storage, once=args.once)
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

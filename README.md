# Creative Strategy Engine (working name)

Research layer for UGC / paid social creative strategy. Full brief: [CLAUDE.md](CLAUDE.md).

## Setup (each machine)

```
git clone <this repo> && cd ore
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"   # also needs ffmpeg: brew install ffmpeg
cp .env.example .env   # then fill in the bucket + API keys
```

Brand data lives in one S3-compatible bucket under `brands/<brand>/`, so both
machines see the same files. Research prompts live in `prompts/` (in git).

## Commands

```
cse init <brand>          create brands/<brand>/brand.md for you to fill in
cse seed <brand>          upload seed/<brand>/ (e.g. an existing research brief) into storage
cse competitors <brand>   find competitors in 3 rings -> competitors.json (review + approve)
cse ads <brand>           pull competitor + own ads, score, download media -> ads.json
cse creative <brand>      transcripts (Whisper), cuts, key frames for new ads
cse breakdown <brand>     Claude diagnoses each analyzed ad, element by element
cse verify <brand>        re-check top ads are still in the Ad Library
cse report <brand>        1. Winning Ads Report: top 10 broken down line by line, patterns,
                             why they work, N iteration ideas (asks how many)
cse scripts <brand> --ideas 1,3   2. full scripts for ideas picked from the latest report
cse briefs <brand> --ideas 1,3    3. full creative strategy briefs for picked ideas
cse weekly <brand>        ads -> creative -> breakdown -> verify -> report
```

## Tests

```
pytest
```

## Claude steps: API or handoff

With `ORE_ANTHROPIC_API_KEY` in `.env` (or the cloud environment's variables; plain `ANTHROPIC_API_KEY` also works locally), Claude steps run through the API. Without it, they run in
handoff mode: the tool writes the filled-in prompt to `brands/<brand>/handoff/<step>.prompt.md`,
Claude Code answers it in `<step>.answer.md`, and re-running the command picks the answer up.
Force a mode with `CSE_LLM=api` or `CSE_LLM=handoff`.

## Website (`web/`)

Next.js app for Vercel. Shows brands, Winning Ads Reports, scripts and briefs from the R2 bucket,
behind one password. "Run a new report" and "Get scripts / briefs" drop a request in
`jobs/pending/`; the worker runs it.

- Deploy: import this repo in Vercel, set **Root Directory** to `web`, add the env vars from
  `web/.env.example` (same S3 values as `.env`, plus `SITE_PASSWORD`).
- Worker: `cse worker` (keeps running) or `cse worker --once`. Needs `ORE_ANTHROPIC_API_KEY` to run
  Claude steps unattended; without it, requests stop at "waiting".
- Local: `cd web && npm install && npm run dev` with a `web/.env.local`.

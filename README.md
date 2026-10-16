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
cse competitors <brand>   find competitors in 3 rings -> competitors.json (review + approve)
cse ads <brand>           pull competitor + own ads, score, download media -> ads.json
cse creative <brand>      transcripts (Whisper), cuts, key frames for new ads
cse seed <brand>          upload seed/<brand>/ (e.g. an existing research brief) into storage
cse voc <brand>           (not built yet)
cse report <brand>        (not built yet)
cse run <brand>           (not built yet)
```

## Tests

```
pytest
```

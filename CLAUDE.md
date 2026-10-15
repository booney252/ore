# Creative Strategy Engine: Phase 1 Brief

Working name. Rename later.

## What we're building (big picture)

A full-stack creative strategy tool for brands running UGC and paid social ads. It researches the market, studies competitors' ads, mines how real customers talk, and later turns all of that into briefs and scripts for creators. It runs the same research process every time and remembers each brand, so it gets smarter over time.

First user: me. First brands: PeptidePal (peptide tracking app) and Solis (morning alarm + phone lock app for 18 to 25 year old guys).

## Phase 1 goal

Build the **research layer only**. For any brand, one command should produce a research report with:

1. **Competitor map** in three rings:
   - Direct: same product, same buyer
   - Adjacent: different product, same buyer and problem
   - Relative: same buyer, nearby problem
2. **Competitor ad intel**: their current and recent Meta ads, ranked by how likely each one is a winner
3. **Voice of customer (VOC)**: the exact words buyers use for their pains, desires, and objections, with sources

No briefs, hooks, or scripts yet. That's Phase 2. Phase 1 has to produce research good enough that writing a brief from it is easy.

## Tech setup

- Python, run from the command line. No web app or UI yet.
- Claude API for analysis and summarizing. Keys go in `.env`, never in code.

**Everything lives in the cloud, nothing only on one computer.** I switch between a Mac and a desktop, so:
- **Code**: in a private GitHub repo. I pull it on whichever machine I'm on.
- **Data and media**: in cloud storage, not local folders. Recommend a simple option (for example Supabase for data plus file storage, or an S3-style bucket) and check storage limits and cost first, since videos add up fast. Ask me before picking anything paid.
- **Secrets**: `.env` on each machine, with a `.env.example` in the repo listing what's needed. Never commit real keys.
- The tool must work the same from either machine: same command, same data, same results.
- Running from the cloud on a schedule comes later (Phase 2), so don't build anything that only works on a local machine.

Organize the cloud data one brand at a time, like this:

```
brands/
  peptidepal/
    brand.md          # brand brain: product, offer, audience, known competitors, notes
    competitors.json
    ads.json
    voc.json
    report.md         # the human-readable output
  solis/
    ...
```

## Commands

```
init <brand>              create the brand folder + a brand.md template for me to fill in
competitors <brand>       build the 3-ring competitor map
ads <brand>               pull competitor Meta ads + score them
voc <brand>               mine voice of customer
report <brand>            write report.md from everything above
run <brand>               all of the above in order
```

## Module details

### 1. Competitor map
- Start from what I write in `brand.md` (product, audience, known competitors).
- Use web search plus Claude to suggest more competitors in all three rings.
- For each: name, ring, website, Facebook page if found, one line on why it's a competitor.
- Mark which ones I listed vs which the tool found, so I can approve or remove them.

### 2. Ad intel (do a research step FIRST)
Getting Meta ad data is the hardest part. **Before building this module, research the options and report back to me** with pros, cons, cost, and reliability for each:
- Meta's official Ad Library API (check what it actually covers for regular commercial ads in the US)
- Third-party ad library data services and scraper providers (check current pricing and terms)
- Manual fallback: I paste ad library links or export a CSV

Ask me before picking anything that costs money. Build the data source as a swappable piece so we can change providers later without rewriting the rest.

For each ad, store: brand, ad ID, start date, days running, still active or not, platforms, ad copy, headline, CTA, link, media type, media URL.

**Winner score** (simple and explainable, not a black box):
- Days running (longer = more likely profitable)
- Still active
- Number of versions of the same creative or copy (many versions usually means they're scaling it)

Every score must show *why*: "Running 47 days, still active, 6 versions."

### 2b. Creative breakdown (video + image)
Every competitor ad needs its actual creative pulled and broken down, not just the copy.

**Download**
- Get the direct media URL for each ad's video or image (the same file you can find by inspecting the ad in the Ad Library), and download it to `brands/<brand>/media/<ad_id>.mp4` (or `.jpg`).
- Meta's media links are usually temporary and expire, so download right when the ad is pulled, not later.
- Skip files already downloaded. Log any that fail.

**Transcript**
- Pull the audio and transcribe it with timestamps (Whisper or a transcription API; recommend one and ask me before anything paid).
- Store the full transcript plus the first spoken line (the hook) separately.

**Visuals**
- Detect cuts with a scene detection tool (PySceneDetect or similar). Store cut count, cuts per second, and video length.
- Save key frames: the first frame, plus one frame per scene.
- Use a vision model on the key frames to record: what's in the first frame (face, product, text, before shot), when the product first appears, on-screen text and captions, talking head vs b-roll, setting.

**Per-ad breakdown** saved in `ads.json`:
hook line, first frame, time to product, length, cuts per second, on-screen text, format (talking head, b-roll, slideshow, etc.), angle, structure (problem/solution, before/after, story, list), and the CTA.

These breakdowns feed the "patterns across winning ads" section of the report, so patterns come from what's actually in the videos, not just the captions.

### 3. Voice of customer
Phase 1 sources, easiest first:
- Reddit (official API): relevant subreddits and threads
- App Store and Google Play reviews for competitor apps (both of my brands are apps, so this matters most)
- YouTube comments (official API) on relevant videos
- Manual paste: a file where I dump TikTok comments, Amazon reviews, DMs, anything

Use Claude to cluster quotes into:
- Pains
- Desires / dream outcomes
- Objections and doubts
- Words and phrases they repeat

Keep the **exact quotes** with a source link for every one. Never rewrite customer language. The raw wording is the whole point.

### 3b. Research prompts (my method)
I have a set of research prompts I use for copywriting research. They live in a `prompts/` folder inside the GitHub repo, as editable text files, so they sync to every machine with the code. Don't hardcode them. Load them from the folder so I can change them anytime.

They cover four steps:
1. **Competitor research**: target demo, acquisition channels, core messaging, recurring hooks and angles, pricing, what customers love and hate, rough revenue/users
2. **Psychographic research**: demographic insights (attitudes, hopes, dreams, wins, failures, outside forces they blame, core beliefs), existing solutions (what they use, likes, dislikes, horror stories, whether they think it works), curiosity (unique or old forgotten solutions), and corruption (beliefs that the problem got worse because of outside forces)
3. **Market awareness**: estimate where the market sits (unaware, problem aware, solution aware, product aware, most aware), with a rough % in each stage and a final call
4. **Unified research brief**: one doc combining everything: demographic overview, psychographics (pains, dream future, language to use and avoid, primary promises), objections and how to answer them, and existing solutions and why they fall short

**How to run them (important):**
- The prompt files use `{{placeholders}}`. Fill brand details (product, niche, audience, age_range, problem, country, communities, category_examples) from `brand.md`, and fill data placeholders (competitors_json, ads_json, voc_json, step1/2/3 outputs) from the earlier steps. Add those fields to the `brand.md` template. Never leave another product's examples in the prompt. Each brand has its own age range (Solis is 18 to 25, not 18 to 60).
- Feed each prompt the **real data we already pulled**: competitor list, scored ads with transcripts and breakdowns, and VOC quotes. The model analyzes our data. It does not invent its own.
- Any quote in the output must come from `voc.json` with its source link. If the model writes a quote we didn't collect, drop it.
- Web search is allowed for facts like pricing and revenue estimates, but every fact gets a source link or a "not found."
- Any "promise" the output suggests for a health product (PeptidePal) gets flagged for compliance review. No specific results, cures, or numbers without proof.

### 4. Report
Two outputs:
- `research-brief.md`: the unified research brief from prompt 4. This becomes the brand brain that Phase 2 (briefs and scripts) reads every time.
- `report.md`: the quick read, about 10 minutes:
- Competitor map (3 rings)
- Top 10 competitor ads by winner score, with the reason for each score, a link, the hook line, the first frame image, and the breakdown
- Patterns across winning ads: common angles, hooks, formats, first frames, pacing, offers
- Top VOC quotes grouped by pains / desires / objections
- "Gaps": things customers say a lot that no competitor ad is talking about

## Rules

- Respect rate limits and each platform's terms. If something would require breaking terms, stop and tell me instead of working around it.
- Health products (peptides) have strict ad rules. Flag any competitor claims that look risky, but don't treat them as safe to copy.
- Keep it simple. Only the cloud storage we need, no UI, auth, or multiple users in Phase 1.
- Write short tests for the winner score and the data parsing.
- Log what each run pulled (counts per source) so I can tell when something breaks.

## Out of scope for Phase 1

Briefs, hooks, scripts, scheduled weekly runs, connecting my ad accounts, the learn loop, the compliance checker, a UI. All of that comes later.

## Done when

- `run peptidepal` works start to finish in one command.
- The report has at least 15 competitors across all 3 rings, at least 10 scored competitor ads (each with downloaded media, a transcript, and a visual breakdown), and at least 50 VOC quotes with sources.
- I read the report and learn at least one thing about the PeptidePal market I didn't know.
- Same for `run solis`.
- I can run it on my Mac, switch to my desktop, and see the same data and reports.

## What I'll provide

- `brand.md` filled in for PeptidePal and Solis
- My research prompts in `prompts/`
- Known competitor names I already know
- API keys once we pick the services

## Start here

1. Set up the GitHub repo, recommend the cloud storage option, and build the `init` command against it.
2. Do the ad data research step and report back before building ad intel.
3. Build competitors, then VOC, then ads, then creative breakdown, then the research prompts, then the report and research brief.

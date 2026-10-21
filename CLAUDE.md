# Creative Strategy Engine: Build Brief

Working name. Rename later.

## What we're building (big picture)

A full-stack creative strategy tool for brands running UGC and paid social ads. It researches the market, studies competitors' ads, mines how real customers talk, and later turns all of that into briefs and scripts for creators. It runs the same research process every time and remembers each brand, so it gets smarter over time.

First user: me. **Current brands: PeptidePal (peptide tracking app), Solis (morning alarm + phone lock app for 18 to 25 year old guys), Cal AI (Creator Studio demo, a Trybe brand) and AI Creator Lab (`aicl`, added 2026-10-20: the affiliate campaign I manage).** Solis was added 2026-10-17: its Oct 4, 2026 research (competitors, customer research, awareness, campaign brief) is imported into `brands/solis/` as research steps 1-3 and `research-brief.md`, with 59 competitors in `competitors.json`. Keep the code brand-agnostic.

## North star: a product other people can use

The end goal is to release this to other people. They type in what their product or service is (a sentence or a URL) and the tool does the rest: researches the market, finds competitors, builds the research brief, pulls and breaks down ads, and writes weekly briefs. No research PDF, no hand-filled `brand.md`.

For now I'm the only user and PeptidePal is the only brand (dogfooding). Build for PeptidePal first, but don't paint us into a corner:

- **Nothing app- or health-specific in the core.** Apps, ecommerce, services, local businesses all have to work. Source choices (App Store reviews vs Amazon vs Trustpilot vs Google reviews) and compliance rules (health, finance, etc.) are picked per brand, not hardcoded.
- **The foundation must run from a one-line description.** PeptidePal skips it because I already have a brief, but for everyone else `init` takes a description or URL, drafts `brand.md` by research, and the foundation (competitors, VOC, the 4 prompts → research brief) runs automatically. Keep that pipeline on the roadmap; it's the product.
- **Two kinds of knowledge.** General copywriting craft (hooks, structure, short-form, direct response) ships with the product for everyone. Brand-specific knowledge (rules, compliance, voice) lives with each brand. My notes from paid courses (e.g. RMBC) stay in my private brand/workspace knowledge and are **not** shipped to other users unless rewritten as original material; course terms usually forbid redistribution.
- **Keep data separated per brand** (and later per account), so adding users later is a prefix change, not a rewrite.
- **Providers stay swappable** (storage, ad data, transcription, LLM). Before release, re-check terms for commercial use at scale: ScrapeCreators' terms for reselling data, Meta's scraping stance, and API costs per customer.
- **Handoff mode is a dev convenience.** The released product runs on the API.
- Release-only work (web UI, accounts, billing, per-customer costs) comes after the weekly engine works for PeptidePal.

## The workflow (updated 2026-10-15)

Two loops:

**Foundation (once, refreshed every month or two)**
1. Competitor audit: direct, adjacent, and relative rings.
2. Voice of customer: real quotes with sources.
3. My 4 research prompts → `research-brief.md`, the brand brain.
4. **Unique mechanisms**, added 2026-10-20: after the unified research brief (so after prompts 1-3 and 4), `prompts/09-unique-mechanisms.md` (from RMBC: private, rewrite before release) writes 10-15 UMP + UMS ideas for the brand's market awareness (brand.md `target_awareness` if set, else the awareness research's final call / campaign target, else Problem Aware). The user ticks the ones they like (saved to `unique-mechanisms-chosen.md`, fed into every writing prompt), and 2+ picks are ranked by `prompts/10-rank-mechanisms.md` → `unique-mechanisms-ranked.md` → `unique-mechanisms.md`, a Research tab. Runs in setup and on Refresh research, or alone from the Research page.
5. **Your notes** (added 2026-10-20): on the Research page the brand can type a note or attach a document (PDF, Word, text, CSV, up to 8 MB; text pulled out on upload) → `brands/<brand>/brain/<id>.json`. `cse/brain.py` adds them after the research brief in every prompt that reads it (reports, iterations, briefs, Studio, mechanisms, ingredients, and the research run itself); where they disagree with the research, the brand's words win.
6. **Ingredient claims (if the product has ingredients)**, added 2026-10-19: brand.md `ingredients` (+ optional `unique_mechanism`), set on the New brand form or the Research page. `prompts/08-ingredient-claims.md` (from RMBC: private, rewrite before release) uses the research brief as the market overview and finds published studies (PubMed/journals, human RCTs first) for claims per ingredient → `ingredient-claims.md`, shown as a Research tab. Needs the API key (web search).

**Weekly engine (the main goal)**
1. Pull new Meta ads from competitors **and from PeptidePal itself**.
2. Score which are winning (winner score below).
3. **Diagnose the winners.** Take each strong ad apart element by element: spoken hook, on-screen text hook, frame 0, first 3 seconds, caption style, creator, setting, camera, edit and pacing, time to product, structure, emotion, persuasion devices, proof, offer, CTA. Mark which elements are load-bearing and why (evidence: days running, versions, reused across the advertiser's other ads).
4. **Put the winning elements into PeptidePal ads.** That's the whole point: find why winners win, then build our ads out of those elements.
5. **Three steps, in order** (updated 2026-10-17; the site has one tab per step: Overview, Reports, Iterations, Creative briefs, with Research at the bottom):
   1. **Winning Ads Report** (Reports tab; sectioned since 2026-10-21): about 25 winners in lanes (`stages.PAID_LANES`: Proven 5, Rising 5, UGC 5, Statics 5, LFS 4, B-roll 3, then More winners to fill; organic: Breakouts, Recent winners, Talking to camera, B-roll), at most 2 per advertiser per lane, each ad once and numbered straight through. It opens with the big picture (patterns across formats, emerging vs fading, what carries across formats), then one section per lane; the first 2 ads of each lane get the full breakdown, the rest a short card; then gaps. Before the report, the weekly run transcribes and breaks down each lane's best candidates (`stages.lane_candidates`). brand.md `report_formats` (e.g. `ugc`) limits a brand's report to those formats; AICL is `ugc` (no B-roll). The top winning ads, videos and statics, each broken down line by line (video) or piece by piece (static); why each works now and, for long-runners, why it still works; patterns and gaps. **No ideas or iterations in the report.** It also saves `reports/<date>.json`, the ranked ad list.
   2. **Iterations** (Iterations tab): the user picks winners from a report, a format and how many per winner, **or writes their own idea** (added 2026-10-17: "something I took from the report + what I want to make"; built from the idea, the whole report and the research brief, with any ticked winners as inspiration; `prompts/06-iterations-own-idea.md`, files `iterations/<report>-idea-<hash>...md`). Each becomes an iteration for our product, built from the winner's load-bearing elements (90/10 or pattern transfer). **UGC** gets a word-for-word script, **B-roll** a shot list with on-screen text and voiceover, **static** the image spec and copy. Saved to `iterations/<report>-ads-<ranks>[-format].md`.
   3. **Creative briefs** (Creative briefs tab): the user picks iterations and gets full creative brief docs to hand to a creator, editor or designer. Saved to `briefs/<iterations file>-its-<numbers>.md`.
   **Creators** (added 2026-10-20, the start of creator/strategist modes): each brand has a roster in `creators.json` (Creators page: who they are, their story with the offer, audience, what they can film, voice, what they can honestly claim, avoid). Iterations and briefs can be written for one creator ("Who's filming it"; files get `-for-<id>`); the prompts' "Who's speaking" block holds their profile.
   Every report, iteration and brief prompt also gets **the product facts from brand.md** (the `product` field plus its notes, e.g. Solis's "How Solis works"); they win over the research brief where they differ (added 2026-10-17 after an iteration described Solis wrong).
   Formats live in `cse/formats.py`; the brand's `ad_format` in brand.md stays as notes (creator age, style rules), and the chosen format wins where they conflict.

The weekly run only processes ads it hasn't seen before, so it stays cheap. It's the part that will later run in the cloud on a schedule.

**Copy lessons** (built 2026-10-20, simplified 2026-10-21): two simple sides. **Strategists give feedback**: every iteration and brief has a "What would you change?" box in the right column that stays on screen while you scroll (or paste it on the Research page's **What Ore learned** tab). It's saved to `brands/<brand>/feedback/`, and job `lessons` (`cse/lessons.py`, `prompts/14-copy-lessons.md`) turns it into the rules Ore follows for that brand (`brands/<brand>/copy-lessons.md`, listed on the What Ore learned tab, where any rule can be edited or removed) and writes a short reply ("Got it. From now on I'll...") shown under the feedback. **I train the universal Ore** on the owner-only **Ore's playbook** page (`/playbook`, linked from All brands): the rules every brand follows (`workspace/copy-lessons.md`; edit, remove, add my own) plus an inbox of rules any brand's feedback suggested for everyone (`brands/<brand>/craft-suggestions.json`); nothing joins the playbook unless I add it. Both go into every report, iteration, brief and Studio prompt. No "decide" marks: Ore writes its best version of each rule. The old Skill Tree (`/skills`) redirects to the What Ore learned tab. First batch: Michael's (PeptidePal owner) feedback on the 3 MOFU creator briefs. Creators is a link in the sidebar footer next to All brands and Log out. Later, once creators can log in, Creative briefs gets a section to send a brief to a creator.

**House style** (decided 2026-10-21): Ore writes aggressive direct response copy by default (`knowledge/house-style.md`). It doesn't police claims, add disclaimers or list "risky claims" on its own; the only brakes are a brand's own rules (brand.md, `knowledge/<brand>/`, the brief's hard rules, copy lessons). Brand-only knowledge lives in `knowledge/<brand>/` (PeptidePal's rules: `knowledge/peptidepal/rules.md`). Nothing flags risky claims, for any brand (removed 2026-10-21, PeptidePal included; `health_product` no longer adds compliance notes), and captions get an #ad line only with `caption_disclosure: true`.

**Copywriting skill.** Research tells the tool *what* to say; it also needs to know *how* to write: hooks, angles, structure, short-form video, direct response, and the RMBC method (I'm taking the RMBC course). This lives in a `knowledge/` folder in the repo, editable like `prompts/`, and is loaded every time briefs are written. I add my own notes and summaries there over time (not verbatim course material). **Book skills** (2026-10-21): each copywriting book gets full notes in `knowledge/books/` (a library, not loaded), and its skills are merged into `knowledge/copywriting-skills.md` (38 skills grouped by job: before writing, the problem, hooks, the middle, persuasion levers, offer and CTA, editing, breaking down a winner), which every prompt loads. Books so far: Masterson's Copywriting Secrets and Great Leads (only the first third read; the six lead types are from memory), Take Their Money, The Brain Audit (excerpt), Influence, Predictably Irrational, StoryBrand, Halbert's editing formula.

**Own ads.** Start by pulling PeptidePal's ads from the public Ad Library like any competitor (no performance data). Later, connect my Meta ad account (official Marketing API) so own-ad winners are judged on real results (spend, CPA, ROAS).

## Foundation detail

The foundation produces:

1. **Competitor map** in three rings:
   - Direct: same product, same buyer
   - Adjacent: different product, same buyer and problem
   - Relative: same buyer, nearby problem
2. **Competitor ad intel**: their current and recent Meta ads, ranked by how likely each one is a winner
3. **Voice of customer (VOC)**: the exact words buyers use for their pains, desires, and objections, with sources

Build order: foundation first (briefs are only as good as the research under them), then the weekly engine and briefs.

## Tech setup

- Python pipeline, run from the command line or by the website's worker. Website: Next.js on Vercel in `web/` (started 2026-10-17).
- Claude API for analysis and summarizing. Keys go in `.env`, never in code. The Claude key is `ORE_ANTHROPIC_API_KEY` (cloud environments reserve `ANTHROPIC_API_KEY`).

**Everything lives in the cloud, nothing only on one computer.** I switch between a Mac and a desktop, so:
- **Code**: in a private GitHub repo. I pull it on whichever machine I'm on.
- **Data and media**: in cloud storage, not local folders. Recommend a simple option (for example Supabase for data plus file storage, or an S3-style bucket) and check storage limits and cost first, since videos add up fast. Ask me before picking anything paid.
- **Secrets**: `.env` on each machine, with a `.env.example` in the repo listing what's needed. Never commit real keys.
- The tool must work the same from either machine: same command, same data, same results.
- Running the weekly engine from the cloud on a schedule comes later, so don't build anything that only works on a local machine.

Organize the cloud data one brand at a time, like this:

```
brands/
  peptidepal/
    brand.md          # brand brain: product, offer, audience, known competitors, notes
    competitors.json
    ads.json
    voc.json
    report.md         # the human-readable output
    research-brief.md # brand brain the weekly briefs read
    media/            # downloaded ad videos/images + key frames
    briefs/           # one file of 6 briefs per week

```

## Commands

```
init <brand>              create the brand folder + a brand.md template for me to fill in
setup <brand>             new brand: draft brand.md by research, then the competitor map
competitors <brand>       build the 3-ring competitor map
ads <brand>               pull competitor + own Meta ads, score them, break down new ones
voc <brand>               mine voice of customer (App Store reviews + pasted text)
research <brand>          the 4 research prompts -> research-brief.md (old brief kept in research/<date>/)
mechanisms <brand>        unique mechanism ideas (UMP + UMS) from the research brief -> unique-mechanisms.md
ingredients <brand>       study-backed claims per ingredient -> ingredient-claims.md (only if brand.md lists ingredients)
report <brand>            Winning Ads Report: top winners broken down, patterns, gaps (no ideas)
iterations <brand>        --ads 1,3 [--report DATE] [--format ugc|broll|static] [--per-ad N]
briefs <brand>            --numbers 1,2 [--iterations FILE]: full creative briefs from iterations
run <brand>               foundation: all of the above in order
weekly <brand>            weekly engine: ads, creative, breakdown, verify, then the report
```

**Handoff mode.** Until an Anthropic API key is added, every Claude step can run in "handoff" mode: the tool saves the fully filled-in prompt with our real data, Claude Code does the step in a session, and saves the answer back for the tool to continue. Same code path; switching to the API is a `.env` change.

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

**Winner grade** (simple and explainable, A to F like school; changed from a 0-100 score 2026-10-19):
- Time live sets the grade: A 90+ days, B 30+, C 14+, D under 2 weeks
- Stopped (or removed from the Ad Library): down one grade (a stopped D is an F)
- 5+ versions of the same creative or copy (they're scaling it): up one grade
- **Rising** (added 2026-10-21, recency matters in fast markets): a still-running ad under 30 days is judged against its advertiser's usual ad life (median days of its stopped ads, 5+ needed). Outliving it 2x (and a week+) or 5+ versions = B, both = A. The report's top 10 keeps 3 spots for rising ads (`stages.balance_rising`); the Winning ads page has a Rising filter (with UGC, B-roll, LFS = 400+ words of ad copy, Static).

Every grade must show *why*: "Grade A: running 47 days (B), still active, 6 versions (up one)." The site says it in plain words too (Proven winner, Strong signal, Early signal, Too early to tell, Didn't make it).

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

**Statics count too** (added 2026-10-17). A static image that's crushing competes on the same winner score and gets the same depth: `prompts/ad-breakdown-static.md` breaks down the graphic (focal point, layout, style, typography, color, product) and the copy (first line, structure, voice, headline), and the report gives it a piece-by-piece table plus "why the graphic works" and "why the copy works". Ideas from a static stay in the brand's `ad_format` (a static idea only when the format allows statics).

### 3. Voice of customer
Sources, easiest first:
- App Store reviews for competitor apps (PeptidePal is an app, so this matters most). Apple's public review feed.
- YouTube comments (official API) on relevant videos
- Manual paste: a file where I dump Reddit threads, TikTok comments, Amazon reviews, DMs, anything
- Left out: Google Play (no official API; scraping breaks its terms) and the Reddit API (free tier is non-commercial only; business use needs Reddit's approval). Reddit content comes in via manual paste.

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
- `research-brief.md`: the unified research brief from prompt 4. This becomes the brand brain the weekly briefs read every time.
- `report.md`: the quick read, about 10 minutes:
- Competitor map (3 rings)
- Top 10 competitor ads by winner score, with the reason for each score, a link, the hook line, the first frame image, and the breakdown
- Patterns across winning ads: common angles, hooks, formats, first frames, pacing, offers
- Top VOC quotes grouped by pains / desires / objections
- "Gaps": things customers say a lot that no competitor ad is talking about

## Rules

- Push finished work straight to `main` (and the working branch); I'm the only one with access, so no need to ask first (decided 2026-10-19).
- Respect rate limits and each platform's terms. If something would require breaking terms, stop and tell me instead of working around it.
- Health products (peptides) have strict ad rules. Flag any competitor claims that look risky, but don't treat them as safe to copy.
- Keep it simple. Only the cloud storage we need, no UI, auth, or multiple users for now.
- Write short tests for the winner score and the data parsing.
- Log what each run pulled (counts per source) so I can tell when something breaks.

### 5. Weekly briefs
- Input: this week's scored + broken-down ads (competitors and own), `research-brief.md`, `voc.json`, and everything in `knowledge/`.
- Output: `brands/<brand>/briefs/<YYYY-MM-DD>.md` with 6 briefs. Each brief: idea name, type (iteration or new), source ads and why they win, angle, hook options (spoken line + first frame), format, structure/beats, on-screen text, CTA, VOC quotes to use (exact, with links), and creator notes.
- PeptidePal is a health-adjacent product: every brief flags claims needing compliance review. No results, cures, or numbers without proof. Competitor claims are never treated as safe to copy.

## Where Ore is going (decided 2026-10-20)

Ore becomes a copywriter for anyone selling with short-form video, not just a paid-social iteration machine. Two kinds of users: **creators** (write for themselves, e.g. affiliates) and **strategists** (write for others: brands, clients, a roster of creators; for now they export docs). A strategist can share a **brand brain** with their creators (read-only, revocable, kept live); creators on a shared brain use Ore free, billed to the strategist's allowance. Organic winners (views vs the creator's normal) join paid ads as a source. **Creator Studio** (`/studio`, built 2026-10-20 for the Trybe Daily pitch, redesigned the same day): the creator-facing side. The creator fills in their profile once (`studio/me.json`: who they are, story, voice, what they can film and claim). Each piece of work is a session (`studio/sessions/<id>.json` + `.md`): pick a brand that's opted in (`studio: true` in brand.md; first one: Cal AI, a Trybe brand, set up from its 28 Meta ads and 98 App Store reviews), see who buys it and what's winning, pick a winner or let Ore pick; `prompts/12-studio-angles.md` suggests 5 angles that fit the creator (job `angles`); they tick angles, a format, a length and how many; `prompts/11-creator-scripts.md` writes ready-to-film scripts (job `scripts`); each script can be tweaked (more like this, new hooks, shorter: `prompts/13-studio-tweak.md`, job `tweak`). Code: `cse/studio.py`, `web/app/studio/`. **Organic winners** (built 2026-10-20 for AICL): `cse/organic.py` / `organic <brand> --file posts.tsv` imports Reels/TikToks/Shorts into ads.json (`source: "organic"`) and grades them on the outlier, views vs the account's median (A 5x+, B 2x+, C about normal, D below), raw reach counts too (beating the usual by 1.5x+: B at 50K+ views, A at 250K+, so a big account's hit isn't held back by its high usual), then comments per view at 2x+ the account's usual lift it one grade (10+ comments; comments never lower a grade, since posts without a comment-keyword CTA look weak next to ones with it; changed 2026-10-21); under 10,000 views caps at C, since a post needs 10K+ views to be worth copying however far it beats a small account (brand.md `breakout_min_views` changes the bar; raised from 1,000 on 2026-10-21). With audience segments, the report's top 10 saves at least 3 spots for each segment's A/B winners (`stages.balance_segments`). brand.md `campaign_type: organic|paid` picks the site's layout (organic: Winning posts, outlier / comments / posted date on each card; AICL is organic, PeptidePal, Solis, Cal AI and HAUS are paid) and `organic_since` drops older posts (AICL: 2026-04-01). Within a grade, organic posts rank by views (changed 2026-10-21 from the outlier, which pushed small accounts' 14K posts above 600K ones), ads by days live. The `talking` format (Talking head, organic) is for affiliates posting on their own page; brand.md `default_format` picks the default. `organic <brand> --pull` (`cse/organic_source.py`, ScrapeCreators, 1 credit a page) fetches brand.md `organic_accounts` (`platform:handle[:own]`; Instagram reels, TikTok, YouTube Shorts) with full history, grades them, downloads each account's A/B winners (plus our own creators' top 2) for `creative` to transcribe, and gets YouTube Shorts transcripts from the API. AICL's first full pull (2026-10-20): 1,206 posts from 14 accounts for about 105 credits. AICL's income-claim rules in its brand.md are placeholders until Finn confirms them. **Audience segments** (added 2026-10-21 for AICL, where women and men watch different creators for different reasons): brand.md `segments` (`key | Label | who they are | handles`; AICL: `her` = Jianna + Alexis, `him` = the other 10 accounts). `research` then runs psychographics (step 2) and market awareness (step 3) once per segment on that segment's posts and comments (`research/<date>/02-psychographics-<key>.md`, plus the combined file), and the brief gets a section per segment. `comments <brand> --handles a,b` (ScrapeCreators, 1 credit a page, Instagram) saves comments on each account's most-watched posts to voc.json (`source: "comment"`, `about: "@handle"`); first pulls: Jianna's top 15 posts (42 usable comments, 30 credits) and the men's lane top 20 posts overall (`--overall`, 125 comments, 39 credits). `research --redo <segment>` reuses the steps already saved today except that segment's. `organic --pull --only X --top-views N` also downloads an account's N most-watched videos for `creative`. Facts about AICL's women (top affiliate ever is a faceless woman; Natalie two $35k months; Kay a $53k month; no different objections) are a brain note. A "Who's it for" pick (`segment`, only shown when brand.md has segments) on iterations, briefs and the Studio start adds the segment's block to the prompts (`brand.segment_block`: write for this segment's section of the brief, not the other's words); files get `-to-<key>`. Phases: 1 creator profiles (done), 2 brand brain export/share, 3 organic winners (paid data: ask first), 4 creator front door (signup choice, today's ideas, free seats), 5 plans and billing.

## Later (not now)

Scheduled cloud runs of the weekly engine, connecting my Meta ad account, full scripts, the learn loop (which briefs became winners), the compliance checker, a UI, Solis.

## Done when

- `run peptidepal` works start to finish.
- The report has at least 15 competitors across all 3 rings, at least 10 scored competitor ads (each with downloaded media, a transcript, and a visual breakdown), and at least 50 VOC quotes with sources.
- I read the report and learn at least one thing about the PeptidePal market I didn't know.
- `weekly peptidepal` pulls only new ads and produces 6 briefs I'd actually hand to a creator.
- I can run it on my Mac, switch to my desktop, and see the same data and reports.

## What I'll provide

- `brand.md` filled in for PeptidePal
- My copywriting notes (RMBC and others) in `knowledge/`
- My research prompts in `prompts/`
- Known competitor names I already know
- API keys once we pick the services

## Decisions so far

See `docs/decisions.md`. Storage: Cloudflare R2. Ad data: ScrapeCreators (free credits first). Transcription: Whisper inside the tool.

## Build order

The PeptidePal foundation already exists: my Unified Research Brief (Oct 6, 2026) is imported as `research-brief.md` (in `seed/peptidepal/` until R2 is set up), and its 19 competitors seed `competitors.json`. Its quotes come without per-quote links; that's accepted for this imported brief only. Its hard rules are in `knowledge/peptidepal/rules.md` (loaded for PeptidePal only). Solis's foundation was imported the same way on 2026-10-17 (its rules are in its brand.md and section 5 of its brief).

1. ~~Repo, storage, `init`~~ (done)
2. ~~Ad data research~~ (done, see `docs/ad-data-options.md`)
3. ~~`competitors`~~ (built) and ~~foundation~~ (imported from my brief)
4. ~~Handoff mode; websites + Facebook pages for competitors and PeptidePal~~ (done; R2 live)
5. ~~Ads (competitors + own) and creative breakdown~~ (done: `ads`, `creative`, `breakdown`)
6. ~~`knowledge/` loading + `briefs`~~ (done; first briefs 2026-10-16 in `exports/peptidepal/briefs/`)
7. ~~`weekly`~~ (built). Next: Anthropic API key so it runs without a handoff session; scheduled cloud run.
8. ~~Auto-foundation from a one-line description~~ (built 2026-10-17: the site's "New brand" form → `setup` = profile → competitors → `voc` (App Store reviews + pasted text) → ads → `research` (prompts 1-3, then 4 → research-brief.md). Not yet run end to end: needs the Anthropic API key): `init` drafts `brand.md` by research, then competitors → VOC → the 4 prompts → research brief. Needed for every user who isn't me; also refreshes PeptidePal's brief.
9. Split `knowledge/` into general (ships) and brand-specific (private).
10. Release work: web UI, accounts, billing, terms review.

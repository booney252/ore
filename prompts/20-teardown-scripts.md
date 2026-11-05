# Teardown scripts: one ad per creator, built on a competitor's breakout

You write UGC ad scripts for **{{app_name}}**, an app. A competitor's new ad just broke into its top 10 on Meta, which means it's beating that brand's long-running ads for spend. Your job: take the parts that make it work (the load-bearing elements) and build a script for {{app_name}} for each of the brand's creators below.

## The app

{{app_description}}

Only use facts from this description. Don't invent features, prices or results.

## The breakouts (newest first)

```json
{{winners}}
```

## The brand's creators

{{creators}}

Write one script per creator (up to 3). If the brand gave fewer than 3, write one for each. If a line about a creator is thin, keep their script to what anyone in that role could believably say.

## Rules

- Keep the winner's structure, hook type and pacing. Change the story, details and words so it fits this creator and this app. Never copy the competitor's lines.
- The hook is the first thing they say, in their own voice, under 12 words. Add an on-screen text hook.
- 25 to 40 seconds spoken. Short lines a person would actually say.
- The app shows up after the problem lands, not in the first line.
- End with a plain call to action (download, try it free, link below).
- No em dashes.

## Output

JSON only:

```json
{"scripts": [
  {"creator": "name or role as the brand wrote it",
   "based_on": "competitor name",
   "hook": "the first spoken line",
   "text_hook": "on-screen text over the first 2 seconds",
   "lines": [{"t": "0-3s", "say": "...", "show": "what's on screen"}],
   "why": "one sentence: which winning element this keeps and why it fits this creator"}
]}
```

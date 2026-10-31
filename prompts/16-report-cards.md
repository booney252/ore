We just wrote a Winning Ads Report for {{brand_name}}. Its big picture and gaps sections are below. Turn them into a few cards for the brand's home page. A busy brand owner or strategist reads these in seconds, picks one, and Ore writes a script from it for each of their creators.

## What we sell

{{product_facts}}

## The report's big picture and gaps

{{report}}

## The ranked ads (rank: advertiser, hook)

{{ranks}}

## What to write

**Patterns: the 3 that are most useful for {{brand_name}} to use right now.** Pick from the report's patterns the ones with the most evidence that also fit this product best. Skip offer mechanics the brand can't use (e.g. bundles for an app).

**Open lanes: the 2 best gaps.** Things this brand's buyers care about that no winning ad is saying. Prefer the gaps with the biggest pain and a clear way for {{brand_name}} to own it.

For each card:
- `title`: the pattern or gap in plain words, at most 9 words, no quotation marks around the whole thing. Example: "Nobody told me: the doctor who brushed you off".
- `why`: one or two short sentences on why it works on this buyer, in plain words. No jargon ("load-bearing", "pattern interrupt", "awareness level").
- `ranks`: for patterns, the ranks of the 3 to 5 ads that show it best (from the report's numbers). For open lanes, an empty list.
- `example`: one short real line from the evidence: a hook from one of those ads for a pattern, or a customer quote from the report for an open lane. Copy it exactly.
- `idea`: the brief Ore will write from, 2 or 3 sentences: the move to make, what the {{brand_name}} version is about, and the moment to open on. Written to a copywriter, plain words.

No em dashes anywhere. Answer with JSON only:

{"patterns": [{"title": "", "why": "", "ranks": [1, 2], "example": "", "idea": ""}], "gaps": [{"title": "", "why": "", "ranks": [], "example": "", "idea": ""}]}

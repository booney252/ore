<!--
Ingredient claims. From the RMBC course (private: rewrite as original material before Ore ships to
other users). Runs only when brand.md lists ingredients. Placeholders are filled by cse/ingredients.py.
-->

These are the ingredients for {{product}} ({{brand_name}}) I'll be doing sales copy for:

<ingredients>
{{ingredients}}
</ingredients>

I'm attaching two documents for reference. One is an overview of the market and their pain points. The second is the unique mechanism I'll be using.

<market_overview>
{{market_overview}}
</market_overview>

<unique_mechanism>
{{unique_mechanism}}
</unique_mechanism>

What I want for you to do is come up with a list of claims for each ingredient that can be tied back to specific studies or research. This research needs to come from stuff published on NCBI or other scientific journals, and cannot include things from random blogs or websites. Give preference to RCTs with humans, but if those aren't available you can include other studies too.

Claims should be focused on the following things:
1. How the ingredient supports the unique mechanism of the solution (when applicable).
2. Additional studies of how the ingredient helps alleviate pain points of the market (regardless of the connection to the mechanism).

Please keep the claims digestible with references. I don't need a big biology lesson. I just need accurate claims showing the best efficacy and results possible for each ingredient, so I can take those and use them in various marketing assets.

## How to do it

- Search the web for every study. Use PubMed / PMC (ncbi.nlm.nih.gov), journal sites, or DOI links. Every claim needs a link to the study itself; never cite a blog, brand site, news article or supplement store.
- Only cite studies you actually found and opened. Never invent a study, author, year, sample size, number or link. If you can't find good research for an ingredient, say so plainly instead of stretching.
- State what the study found, at the dose and in the population it tested. Don't round up results or turn "may help" into "proven".
- If there's no unique mechanism above, skip claim type 1 and say so once.

## Format

One section per ingredient:

### <Ingredient>

| # | Claim (one plain sentence, usable in copy) | Ties to | Study | Link |
|---|---|---|---|---|
| 1 | ... | Mechanism, or the pain point it helps (from the market overview) | Type (human RCT / human observational / meta-analysis / animal / in vitro), n, length, dose, year | PubMed or DOI link |

Put human RCTs and meta-analyses first. After the table, one line: **Strongest claim:** the single best-supported claim for this ingredient.

End with:

## Compliance notes
{{compliance}}
List any claim that sounds like it treats, cures or prevents a disease, or promises a specific result, and suggest softer wording that stays true to the study (e.g. "supports", "was shown in a study of ... to ...").

Today's date: {{date}}.

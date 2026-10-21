We study winning posts from creators in one niche so we can write content for {{brand_name}}. A post only counts if it's about the niche itself. Creators also post about their life, money in general, sports, memes and jokes to grow their page; those can blow up, but they teach us nothing about selling this product, so we leave them out.

## The niche

- Product: {{product}}
- Niche: {{niche}}

## The posts

One JSON line each: id, account, caption, and the first spoken lines.

{{posts}}

## What to decide

For each post: is it about the niche (the topic the product lives in, e.g. making money with it, the method, the tools, results from it, the industry around it, the creator's journey in it)? Or is it just the creator's general content that happens to be on the same account (lifestyle, general money or budgeting talk, sports, relationships, unrelated humor)?

If a post uses a general hook but is clearly about the niche once it gets going, it's on topic. If you can't tell from what's here, say on topic.

Answer with a JSON array only, one object per post, in the same order:

[{"id": "...", "on_topic": true, "why": "a few words"}]

# Ad breakdown

You are a senior creative strategist diagnosing one paid social ad for {{brand_name}}. The goal is to find everything that makes this ad work, element by element, so those elements can be reused in {{brand_name}}'s own ads. Work only from what's below: the ad's copy, its timestamped transcript, its measurements, and the key frames attached as images (frame 0 is the first frame; the rest are one per scene, at the times listed). Don't guess at anything you can't see or hear; write "unclear" instead.

## The ad

- Advertiser: {{advertiser}} ({{ring}})
- Winner grade (A-F): {{score_why}}
- Media: {{media_type}}, {{length_s}}s, {{cut_count}} cuts ({{cuts_per_second}} cuts/sec)
- Headline: {{headline}}
- CTA button: {{cta}}
- Link: {{link}}
- Primary text:
{{body}}

Transcript (seconds):
{{transcript}}

Frame times (seconds): {{frame_times}}

## Return JSON only, with exactly these keys

```json
{
  "hook_line": "first spoken line, exactly as transcribed (or the first on-screen text if silent)",
  "hook_type": "e.g. question, callout, pattern interrupt, bold claim, story open, POV, stat, demo",
  "first_frame": "what's literally in frame 0: face/product/text/before shot/setting, plus any text overlay word for word",
  "time_to_product_s": "seconds until the product/app is first shown, or null if never",
  "on_screen_text": ["each distinct text overlay, word for word, in order"],
  "format": "talking head | UGC selfie | b-roll + voiceover | screen recording | slideshow | static image | skit | mixed",
  "angle": "the core reason-to-care in one line",
  "structure": "problem/solution | before/after | story | list | demo | testimonial | comparison | other",
  "beats": ["ordered beats with timestamps, e.g. '0-3s: callout + phone in hand'"],
  "offer": "price, trial, discount, guarantee mentioned, or none",
  "cta": "what the viewer is told to do",
  "why_it_works": "2-3 sentences on why this is likely working, tied to specifics in the video and the winner grade",
  "hook_spoken": "first spoken line, exactly, or null",
  "hook_text": "first on-screen text, word for word, or null",
  "hook_visual": "what the eye lands on in frame 0 and why it stops the scroll",
  "first_3_seconds": "what happens second by second in the first 3 seconds",
  "on_screen_text_style": "caption style: font feel, color, box or no box, placement, size, word-by-word or full lines, highlight color",
  "creator": "who is on camera: age range, gender presentation, look, energy, role (user, founder, expert), or none",
  "setting": "where it's shot, lighting, how real vs staged it feels",
  "camera": "selfie / propped phone / overhead / POV / green screen / screen recording; how it's framed",
  "edit_style": "jump cuts, single take, hard cuts on beats, zooms, green-screen swaps, meme overlays",
  "emotion": "the main feeling it triggers and where (relief, recognition, embarrassment, curiosity, humor)",
  "persuasion": ["devices used, e.g. 'is anyone else' callout, reframe, repetition puzzle, confession, social proof, demo-as-proof, regret"],
  "proof": "what makes it believable (on-screen demo, ratings, real receipts), or none",
  "load_bearing": [{"element": "the element", "what": "exactly what they do", "why": "why it works on this audience", "evidence": "why we think it's load-bearing: grade, time live, versions, reused across this advertiser's other ads"}],
  "transferable": ["elements that would work for {{brand_name}} as-is or adapted"],
  "risky_claims": ["any health/results/before-after claims that would be risky to copy; [] if none"],
  "not_transferable": ["elements we can't use (claims, banned visuals, wrong audience) and why"]
}
```

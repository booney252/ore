# Meta ad data: options (researched 2026-10-15)

Status: waiting on your decision. Nothing paid has been picked.

## Meta's official Ad Library API: not usable
- It only returns ads that reached the EU/UK, plus political/issue ads. US-only commercial ads are not returned.
  Source: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
- It has no direct media URL, no CTA and no variant count, and it requires ID verification.
- Scraping the snapshot pages yourself breaks Meta's Automated Data Collection Terms:
  https://www.facebook.com/legal/automated_data_collection_terms

## Third-party providers (all of them collect from Meta's public Ad Library)
| Option | Cost | Media URL / variant count | Notes |
|---|---|---|---|
| ScrapeCreators | 100 free credits, then $47 for 25k credits that never expire | `video_hd_url`, `collation_count`, CTA, link, platforms | Pay as you go; endpoint per company. Number of ads per request not confirmed. https://scrapecreators.com/ |
| Apify `curious_coder/facebook-ads-library-scraper` | about $0.75/1k ads; free plan gives $5/mo of usage | variant count yes; media field names not confirmed | 4.79/5, 45k users |
| Apify `apify/facebook-ads-scraper` | $3.40/1k ads | `videoHdUrl`, `collationCount`, `ctaText` | Run by Apify; image URLs were null in its samples |
| SearchAPI.io | 100 free requests, then $40/mo | images + variant count; video URL not confirmed | Subscription |
| Foreplay / Atria / AdSpy / Swipekit | $26–159/mo | Mostly UI-only | Too expensive or no API at this volume |

Terms risk for you as the customer is low but not zero. Meta's terms forbid automated collection. In Meta v. Bright Data (N.D. Cal. 2024), the court held that logged-out scraping of public data didn't breach Meta's terms, and Meta dropped the case. That ruling isn't binding precedent. To stay low-risk: never scrape with your own logged-in Meta account, and use the creatives as internal reference only. Don't republish them.

## Manual fallback (free)
- The Ad Library web page shows US commercial ads: `facebook.com/ads/library/?active_status=all&ad_type=all&country=US&view_all_page_id=<PAGE_ID>`.
- No CSV export for commercial ads (likely; not confirmed).
- To get a video file: open DevTools, go to Network, filter by `fbcdn` or `mp4`, and play the video.

## Media URL expiry
fbcdn links are signed and reportedly expire after about 4–5 days. The `oe=` parameter is likely the expiry timestamp. So download the media during the same run that pulls the ads.

## Recommendation
1. Start free with ScrapeCreators. If you keep using it, $47 should last a year or more at this volume (estimate).
2. Backup: Apify free plan with `curious_coder` (about $3–9/mo at 1–3k ads/week).
3. Build the provider as a swappable adapter, and keep "paste Ad Library URLs" as a manual input.

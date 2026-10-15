# Decisions

| Date | Decision |
|---|---|
| 2026-10-15 | Storage: Cloudflare R2 (S3-compatible; swap via `.env`). |
| 2026-10-15 | Meta ad data: ScrapeCreators, starting on free credits. Apify free plan is the backup. Manual paste of Ad Library links is the fallback. |
| 2026-10-15 | Google Play reviews: left out (no official API; scraping breaks its terms). Use App Store reviews + manual paste. |
| 2026-10-15 | Transcription: Whisper running inside the tool (free) to start. |

"""Ad formats the user picks when asking for ideas, scripts or briefs.

The chosen format decides how ideas are written and what a script or brief contains.
The brand's own `ad_format` in brand.md (creator age, setting, style rules) is kept as notes;
where it conflicts with the chosen format, the chosen format wins.
"""

from __future__ import annotations

DEFAULT = "ugc"

# How every video script is written, whatever the format. Added 2026-10-21 after a batch of
# vague, feature-tour scripts ("your weekly one", six features in 50 seconds).
SCRIPT_CRAFT = """\
- **Write it like this (every script):**
  - **One moment.** Open inside one specific scene with a day, a time, a place and an object (e.g. "Sunday, 9pm, I swipe the alarm because I'm mid-dinner"). Never open on a category ("it's hard to keep track").
  - **One stake, felt.** Show what goes wrong in that moment; don't explain it like a lecture.
  - **At most 2 features,** the ones that fix that exact moment. No feature tours.
  - **Real nouns.** Say exactly what it is (the weekly shot, the pen, the second peptide, the spreadsheet). Never placeholders like "your weekly one", "the new one", "this thing".
  - **Every line earns the next.** Cut any line the viewer wouldn't miss. Say it the way the creator would tell a friend."""

FORMATS = {
    "ugc": {
        "label": "UGC video",
        "spec": "UGC video: a real creator talking to camera, shot on a phone, 25-40s, "
                "with a full word-for-word script",
        "fields": """\
- **Setup:** who's on camera (age, look, role), where, how it's shot, target length (25-40s unless the winner it's built from needs longer)
- **Alternate hooks (2):** each a different first line the creator says AND its first frame
- **Script:** a table `| Time | They say | On screen |`, 0s to the end. "They say" is every spoken word, written the way a real person talks to their phone (contractions, short sentences). "On screen" is the shot, any cut, and any text overlay word for word. The first row is the main hook.""",
    },
    "broll": {
        "label": "B-roll video",
        "spec": "B-roll video: no one talking to camera; real-looking footage of the moment, the "
                "problem and the product (hands, phone screen, room, setting) carried by on-screen "
                "text and/or a voiceover, 15-45s",
        "fields": """\
- **Setup:** the footage to shoot or source (hands, phone screen, room, product, setting), how it should look (native phone footage, not polished), whether it's text-only or has a voiceover, target length (15-45s)
- **Alternate hooks (2):** each a different first on-screen line (and first voiceover line, if any) AND its first shot
- **Script:** a table `| Time | Shot | On-screen text | Voiceover |`, 0s to the end. Describe every shot; write every word of on-screen text and voiceover word for word ("none" where there's no voiceover). The first row is the main hook.""",
    },
    "talking": {
        "label": "Talking head (organic)",
        "spec": "Organic talking-head video for the creator's own page (Reels, TikTok, Shorts): the "
                "creator talking to their phone as themselves, often with a green-screen or text "
                "overlay hook, 15-60s, ending in a soft call to action (comment a keyword, DM, link "
                "in bio) instead of an ad button",
        "fields": """\
- **Setup:** where they film, what's behind them or green-screened behind them (a profile, a screenshot, a video), target length (15-60s)
- **Alternate hooks (2):** each a different first line they say AND the text overlay on frame 0
- **Script:** a table `| Time | They say | On screen |`, 0s to the end. "They say" is every spoken word, in the creator's own voice. "On screen" is the text overlay word for word, any green-screen background and any cut. The first row is the main hook.
- **Call to action:** the exact line, and the comment keyword or DM word if there is one""",
    },
    "static": {
        "label": "Static image",
        "spec": "Static image ad: one image plus its primary text, headline and button",
        "fields": """\
- **Image:** what's in it, the focal point, the style (native photo, screenshot, notes app, review card, designed graphic) and the layout, so a designer can make it without asking
- **Text on the image:** every word, biggest first
- **Alternate hooks (2):** each a different main line on the image AND how the image changes with it
- **Primary text:** word for word, first line first (the line that earns the "see more" tap), plus 2 alternate first lines
- **Headline and button:** the headline under the image and the CTA button""",
    },
}


for _fmt in ("ugc", "broll", "talking"):
    FORMATS[_fmt]["fields"] = SCRIPT_CRAFT + "\n" + FORMATS[_fmt]["fields"]


def check(fmt: str | None) -> str:
    fmt = (fmt or DEFAULT).strip().lower().replace("-", "").replace(" ", "")
    fmt = {"video": "ugc", "b-roll": "broll", "image": "static", "talkinghead": "talking",
           "organic": "talking"}.get(fmt, fmt)
    if fmt not in FORMATS:
        raise ValueError(f"format must be one of {', '.join(FORMATS)}")
    return fmt


def describe(fmt: str, brand_notes: str = "") -> str:
    """The {{ad_format}} line for a prompt: the chosen format plus the brand's own notes."""
    spec = FORMATS[check(fmt)]["spec"]
    if not brand_notes:
        return spec
    return (f"{spec}. Brand notes on ads (follow them where they fit this format; where they "
            f"conflict with it, the chosen format wins): {brand_notes}")


def suffix(fmt: str) -> str:
    """File-name suffix: UGC (the default) has none, so older files keep their names."""
    fmt = check(fmt)
    return "" if fmt == DEFAULT else f"-{fmt}"

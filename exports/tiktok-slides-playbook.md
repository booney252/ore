# TikTok Shop Slides Playbook (for Claude)

> **Claude, read this first.** This file teaches you a full daily system for making TikTok Shop slideshow posts
> (3-5 photo slides with text) for the person who gave it to you. They may be new to Claude, so:
> walk them through **Part 1 (setup) one step at a time**, wait for them to confirm each step, and
> don't move on until it works. After setup, run **Part 2 (the daily routine)** whenever they say
> "make today's slides". Keep explanations short and plain.

---

## What this system does

Every day:
1. Find the TikTok Shop **slideshows that are winning right now** (Daily Virals, filtered to slideshows).
2. Read the winners' slides **word for word** and note the product, the hook and the structure.
3. Plan the day's posts in 5 buckets (below).
4. Build each post with **their own photos** from Google Drive, in **their own text style**.
5. Hand back **one zip of finished slides**, named and dated so they save to the camera roll in posting order.
6. Next day, look at what sold and shift the mix toward it.

---

## Part 1: Setup (once, about 30 minutes)

Walk them through these in order. One step per message. Ask them to say "done" before the next.

### Step 1. Claude plan and settings
- They need a paid Claude plan (Pro or Max): Claude in Chrome and the file tools need it.
- In claude.ai **Settings → Capabilities**, turn on **Code execution and file creation** (this is what lets you make the slide images and the zip).

### Step 2. Make a Project
- In claude.ai, create a **Project** called "TikTok Slides".
- Add **this file** to the Project's knowledge, so every chat in the Project follows it.
- All daily work happens in chats inside this Project.

### Step 3. Connect Google Drive
- In claude.ai **Settings → Connectors**, connect **Google Drive**.
- Test it: ask them to make a folder, then you list it.

### Step 4. Set up the photo folders in Drive
Ask them to make one folder called **Slide pics** with a subfolder per kind of photo. Suggested:
- `It Girl Pics` (aesthetic lifestyle shots for slide 1)
- `Couple Pics`
- `Hair Pics`, `Lip Pics`, `Skin Pics`, `Lash Pics`, `Teeth Pics` (close-ups, including **before** and **after** shots)
- `Product Pics`, with **one subfolder per product**, named exactly like the product (3-6 photos each: in hand, on a vanity, being applied)
- `Screenshots` (real text threads, reviews)

Tips to give them:
- Before/afters should be **the same person** (or at least the same hair color and type). Never a brunette "before" and a blonde "after".
- More photos = less repetition. A photo shouldn't be reused within 7 days (product shots are the exception).
- Photos from Pinterest aren't theirs and can get posts taken down. Their own photos, free stock (Unsplash) or brand-provided photos are safer. Before/afters presented as product results should be real.

### Step 5. Install Claude in Chrome and log into Daily Virals
- Install the **Claude in Chrome** extension (from claude.ai or the Chrome Web Store) and sign in.
- In Chrome, log into **thedailyvirals.com**.
- Test it: you open Daily Virals in their Chrome and read the page title back.
- Note: Daily Virals is a paid tool. Reading their own logged-in account for their own use is fine; don't hammer it or bulk-export data.

### Step 6. Get the font and lock their text style
- Have them download **TikTok Sans** from Google Fonts (fonts.google.com, search "TikTok Sans", download). Unzip and upload **`TikTokSans-Medium.ttf`** (in the `static` folder) to the Project.
- Ask them to upload **2-3 of their own past slides**. Measure and write down their style. The default (most slide accounts) is:
  - 1080 x 1920 pixels
  - TikTok Sans **Medium**, about **42px**, lowercase
  - pale yellow **#FBEEA9**, centered, in the **middle** of the slide, wrapping about 470px wide
  - **no shadow**, except a thin black outline when the photo behind the text is light (otherwise it can't be read)
- Save their exact style as a note in the Project ("Slide style") so it never drifts.

### Step 7. Their product lineup
Ask what they sell (their TikTok Shop showcase). For each product: name, commission, and whether there are photos in `Product Pics`. Save as a Project note ("Lineup"). Update it whenever they add or drop products.

Setup is done when you can: list their Drive folders, open Daily Virals in their Chrome, and render one test slide in their style (Part 4).

---

## Part 2: The daily routine ("make today's slides")

### 2a. Pull today's winners from Daily Virals (via Claude in Chrome)
1. Open Daily Virals → TikTok Shop → filter to **slideshows only** → top performers, **last 24 hours**.
2. Go through the top 40. For each, record exactly what the page shows (never guess):
   `link | @handle | views | creator revenue | product | posted`
3. **Careful:** the revenue shown is usually the **creator's total**, not that post's. The same creator shows the same number on every post. Use it to judge who sells overall, not to rank single posts.
4. Keep only posts in their niche (their products and audience).
5. For the best 10-15, open the TikTok post and read **every slide's text word for word**, including typos, emoji and line breaks. Note each slide's layout (photo + text, text thread, tweet, before/after, product shot) and what the picture shows.
6. Write a short "What's winning today" summary: which products show up on several accounts, which hook formulas repeat (e.g. a suggestive hook → a text thread → the product), and any new products worth testing.

### 2b. Plan the day: 5 buckets
Default 40 posts, 8 per bucket (ask them how many they want to post):

| Bucket | What it is |
|---|---|
| **Copy what's winning** | A winner copied directly: same hook text word for word, same product, same format and slide order. **Only the pictures change** (their photos, same kind of shot). |
| **Iterate on what's winning** | A winner's hook, format and slide order with **their product plugged in** instead. |
| **Iterate on their winners** | Their own posts that sold (or got the most views) with small changes: a tweaked line or a different picture. |
| **Reruns** | Their winners redone as they were, with new photos so it isn't a duplicate. |
| **New tests** | Patterns from what's winning turned into their own hook and format ideas. Not a copy of any one post. |

For each post write: bucket, product, every slide's exact text, which photo goes on each slide, and a short caption with 3-4 hashtags.

**If a product has no photos yet**, don't make the post: list it under "needs product photos" with its TikTok Shop link, so they can make or take photos.

### 2c. Rules every post follows
- **Slide 2 proves it.** The posts that sell show proof: a before/after, week 1 vs week 4, one coat vs two, real reviews. Views without proof don't convert.
- **Context:** within the first 2 slides, it's clear what the product is (brand + what it does).
- **Never repost another account's actual slide images.** Rebuild them with their own photos.
- **Before/afters match** (same person or same hair color/type), and slide 1 matches them.
- **Honest claims:** real prices only, no invented discounts, "limited edition" only if the listing says so, no expired sale prices.
- **Suggestive hooks** (common in this niche) work, but keep them to about 1 in 4 posts while an account is new.
- **AI images:** AI-made product photos (e.g. from Google Flow) carry an AI tag. TikTok asks creators to label realistic AI content. Don't build anything to hide that.
- No photo twice within 7 days (except product shots). Spread posts for one product across the day.

### 2d. Make the slides and the zip
Use the code in Part 4 (Code execution). Load the photos from Drive, render every slide, check them yourself (view a contact sheet before handing over), then give them **one zip**:
- flat, no folders: `01-1.jpg, 01-2.jpg, 01-3.jpg, 02-1.jpg …` (post number, then slide number)
- each image stamped with a **date taken** one second after the last, so saving all of them to an iPhone keeps them in order (Photos → sort by **Date Captured**)

Also give a short list: post number, bucket, hook, product, caption (so they can paste captions).

### 2e. Next day: learn
Ask for a screenshot of their TikTok Shop orders or video analytics. Note orders per product and per post, work out **orders per 1,000 views**, and shift tomorrow's plan: more posts on what sold, fewer on what only got views. Keep a running "What sells" note in the Project.

---

## Part 3: Slide formats that keep showing up

- **Photo + hook**: slide 1, an aesthetic photo with the hook in the middle.
- **Before / after split**: two photos stacked, labeled ("before" / "after", "week 1" / "week 4").
- **Text thread (iMessage, dark mode)**: e.g. a boyfriend texting about the product, an Apple Cash payment, a mom asking "did you get your lips done??". Realistic details matter: status bar, contact name with an emoji, "Read 11:41 AM".
- **Tweet / quote tweet (dark mode X)**: "psa don't use this unless…".
- **Fake comment thread**: a comment and a reply.
- **Product shot**: the product in hand with how to use it ("2 pumps every morning").
- **"FCK MY BF RN BC HE WONT BUY ME THIS"**: an angry face/middle finger photo, then the product.

---

## Part 4: The slide renderer (Python, for Code execution)

Use this as a starting point. Set `FONT` to wherever the uploaded `TikTokSans-Medium.ttf` is (find it with `ls`). Photos come from Drive (download them into the sandbox first).

```python
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageStat
import zipfile, io, datetime, re

W, H = 1080, 1920
FONT = "TikTokSans-Medium.ttf"          # set to the uploaded font's path
YELLOW, SIZE, WRAP = "#FBEEA9", 42, 470  # their measured style

def font(size=SIZE):
    return ImageFont.truetype(FONT, size)

def no_emoji(t):
    # the font can't draw emoji; keep slide text emoji-free (or add emoji in TikTok's editor)
    return re.sub(r"[\U0001F000-\U0001FAFF☀-➿️‍]", "", t).strip()

def wrap(text, f, width=WRAP):
    lines = []
    for para in text.split("\n"):
        line = ""
        for word in para.split():
            test = (line + " " + word).strip()
            if f.getlength(test) <= width or not line:
                line = test
            else:
                lines.append(line); line = word
        lines.append(line)
    return lines

def cover(path, w=W, h=H):
    return ImageOps.fit(ImageOps.exif_transpose(Image.open(path)).convert("RGB"), (w, h))

def draw_text(img, text, where="middle", size=SIZE):
    """Pale yellow centered text. Thin black outline only when the area behind it is light."""
    d, f = ImageDraw.Draw(img), font(size)
    lines = wrap(no_emoji(text), f)
    lh = int(size * 1.18)
    total = lh * len(lines)
    y = {"top": 300, "high": 150, "middle": (H - total) // 2, "bottom": H - 330 - total}[where]
    box = (W // 2 - WRAP // 2, y, W // 2 + WRAP // 2, y + total)
    light = ImageStat.Stat(img.crop(box).convert("L")).mean[0] > 125
    for i, ln in enumerate(lines):
        x = (W - f.getlength(ln)) / 2
        d.text((x, y + i * lh), ln, font=f, fill=YELLOW,
               stroke_width=4 if light else 0, stroke_fill="black")
    return img

def photo(path, text="", where="middle"):
    img = cover(path)
    return draw_text(img, text, where) if text else img

def split(before, after, top_label="before", bottom_label="after", text=""):
    img = Image.new("RGB", (W, H))
    img.paste(cover(before, W, H // 2), (0, 0))
    img.paste(cover(after, W, H // 2), (0, H // 2))
    d, f = ImageDraw.Draw(img), font()
    for label, y in ((top_label, 440), (bottom_label, 1400)):
        light = ImageStat.Stat(img.crop((300, y, 780, y + 50)).convert("L")).mean[0] > 125
        d.text(((W - f.getlength(label)) / 2, y), label, font=f, fill=YELLOW,
               stroke_width=4 if light else 0, stroke_fill="black")
    return draw_text(img, text) if text else img

def imessage(name, messages, time="11:42", read="11:41 AM"):
    """Dark-mode iMessage screenshot. messages: [("them"|"me", "text"), ("them", "$30.00 CASH")]"""
    img = Image.new("RGB", (W, H), "black")
    d = ImageDraw.Draw(img)
    f, fs, fb = font(38), font(28), font(40)
    d.text((130, 55), time, font=fb, fill="white")
    d.ellipse((465, 150, 615, 300), fill="#4a4660")
    d.text((W / 2 - fb.getlength(name[0].upper()) / 2, 200), name[0].upper(), font=font(70), fill="white")
    nw = fb.getlength(no_emoji(name))
    d.rounded_rectangle((W / 2 - nw / 2 - 28, 320, W / 2 + nw / 2 + 28, 385), 33, fill="#1c1c1e")
    d.text((W / 2 - nw / 2, 330), no_emoji(name), font=fb, fill="white")
    d.text((W / 2 - fs.getlength("iMessage") / 2, 420), "iMessage", font=fs, fill="#8e8e93")
    y, last_me = 520, max([i for i, (who, _) in enumerate(messages) if who == "me"], default=-1)
    for i, (who, text) in enumerate(messages):
        text = no_emoji(text)
        if text.endswith("CASH"):  # Apple Cash bubble
            amount = text.replace("CASH", "").strip()
            d.rounded_rectangle((50, y, 520, y + 170), 34, fill="#1c1c1e")
            d.text((86, y + 26), "Apple Cash", font=fs, fill="#8e8e93")
            d.text((86, y + 66), amount, font=font(72), fill="white")
            y += 195
            continue
        lines = wrap(text, f, 700)
        bw = max(f.getlength(l) for l in lines) + 64
        bh = len(lines) * 48 + 36
        x0 = 50 if who == "them" else W - 50 - bw
        d.rounded_rectangle((x0, y, x0 + bw, y + bh), 38, fill="#262628" if who == "them" else "#2f8cfa")
        for j, l in enumerate(lines):
            d.text((x0 + 32, y + 18 + j * 48), l, font=f, fill="white")
        y += bh + 14
        if i == last_me and read:
            d.text((W - 60 - fs.getlength("Read " + read), y - 4), "Read " + read, font=fs, fill="#8e8e93")
            y += 40
    d.rounded_rectangle((120, H - 170, W - 40, H - 90), 40, outline="#2c2c2e", width=3)
    d.text((160, H - 150), "iMessage", font=fs, fill="#5b5b60")
    d.ellipse((30, H - 170, 110, H - 90), fill="#1c1c1e")
    return img

def flat_zip(posts, out_path, day="2026-01-01", start_hour=9):
    """posts: [[slide_img, slide_img, ...], ...] in posting order -> one zip, dated in order."""
    t = datetime.datetime.fromisoformat(day).replace(hour=start_hour)
    with zipfile.ZipFile(out_path, "w") as z:
        for p, slides in enumerate(posts, start=1):
            for s, img in enumerate(slides, start=1):
                exif = Image.Exif()
                stamp = t.strftime("%Y:%m:%d %H:%M:%S")
                exif[0x0132] = stamp
                exif[0x8769] = {0x9003: stamp, 0x9004: stamp}  # date taken
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=92, exif=exif.tobytes())
                z.writestr(f"{p:02d}-{s}.jpg", buf.getvalue())
                t += datetime.timedelta(seconds=1)

# Example post:
# post = [photo("itgirl/1.jpg", "how to get glass skin\nwhen you're lazy"),
#         split("skin/before.jpg", "skin/after.jpg", "week 1", "week 3"),
#         photo("products/serum/1.jpg", "2 pumps every morning.\nthat's the routine", "top")]
# flat_zip([post], "slides.zip", "2026-11-07")
```

Before handing over the zip, **look at every slide** (make a contact sheet) and fix:
- text that can't be read (too light behind it → it should have the outline; or move it with `where`)
- text sitting on a face or on the product (move it to "top" or "high")
- before/afters that don't match
- product text covering the product

---

## Part 5: Saving to the phone

Tell them:
1. Download the zip on their iPhone and tap it in **Files** to unzip.
2. Open the folder → **Select** → **Select All** → share → **Save Images**.
3. In Photos, sort by **Date Captured** (Library → ⋯ → Sort). The slides are in posting order.

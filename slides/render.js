// Turns a day's post list into TikTok photo-mode slides (1080x1920 PNGs).
//
//   node slides/render.js <spec.json> <out-dir>
//
// spec.json: {"posts": [{"id": "01", "slides": [<slide>, ...]}, ...]}
// Every slide has a "type":
//   photo   {bg, text, pos?: "top"|"middle"|"bottom", focus?: "50% 30%"}   photo with the hook text
//   split   {top, bottom, top_label?, bottom_label?, text?}                  before / after, stacked
//   tweet   {bg, name, handle, text, quote?: {name, handle, text}}           fake post over a dimmed photo
//   thread  {bg, from, messages: [{me: bool, text}], text?}                  iMessage thread over a dimmed photo
//   product {bg, text}                                                       product photo with a caption line
// Paths in bg/top/bottom are relative to the spec file. Style: knowledge/brockstaaa/slide-style.md.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const FONT = path.resolve(__dirname, "../assets/slides/TikTokSans.ttf");
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const url = (base, p) => (p ? "file://" + path.resolve(base, p).replace(/'/g, "%27") : "");

const CSS = `
@font-face{font-family:TT;src:url('file://${FONT}')}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#111}
.s{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:TT}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.dim::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.35)}
.t{position:absolute;left:90px;right:90px;text-align:center;font-variation-settings:"wght" 500;font-size:78px;line-height:1.18;
   color:#FFF59D;text-shadow:0 0 3px rgba(0,0,0,.55),0 2px 10px rgba(0,0,0,.35);z-index:2;white-space:pre-line}
.top{top:300px}.middle{top:50%;transform:translateY(-50%)}.bottom{bottom:330px}
.half{position:absolute;left:0;right:0;height:960px;background-size:cover;background-position:center}
.half.a{top:0}.half.b{top:960px}
.lab{position:absolute;left:60px;font-size:64px;font-variation-settings:"wght" 500;color:#FFF59D;text-shadow:0 0 3px rgba(0,0,0,.6),0 2px 10px rgba(0,0,0,.4);z-index:2}
.lab.a{top:60px}.lab.b{top:1020px}
.card{position:absolute;left:70px;right:70px;top:50%;transform:translateY(-50%);background:#fff;border-radius:34px;padding:44px 46px;z-index:2;color:#0f1419;font-variation-settings:"wght" 400}
.who{display:flex;align-items:center;gap:20px;margin-bottom:22px}
.av{width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#f9a8d4,#93c5fd)}
.nm{font-size:38px;font-variation-settings:"wght" 650}.hd{font-size:34px;color:#536471}
.tx{font-size:48px;line-height:1.3;white-space:pre-line}
.qt{margin-top:28px;border:2px solid #cfd9de;border-radius:24px;padding:26px 30px}.qt .nm{font-size:32px}.qt .tx{font-size:40px}
.meta{margin-top:26px;font-size:30px;color:#536471}
.th{position:absolute;left:50px;right:50px;top:50%;transform:translateY(-50%);z-index:2;display:flex;flex-direction:column;gap:18px}
.from{align-self:center;color:#fff;font-size:34px;font-variation-settings:"wght" 600;margin-bottom:10px;text-shadow:0 1px 6px rgba(0,0,0,.5)}
.bub{max-width:78%;padding:24px 32px;border-radius:44px;font-size:44px;line-height:1.28;font-variation-settings:"wght" 400}
.bub.them{align-self:flex-start;background:#e9e9eb;color:#000;border-bottom-left-radius:14px}
.bub.me{align-self:flex-end;background:#1d8cff;color:#fff;border-bottom-right-radius:14px}
`;

function slideHTML(s, base) {
  const bg = (p, extra = "") => `<div class="bg ${extra}" style="background-image:url('${url(base, p)}');${s.focus ? `background-position:${s.focus}` : ""}"></div>`;
  const hook = (pos = "top") => (s.text ? `<div class="t ${pos}">${esc(s.text)}</div>` : "");
  switch (s.type) {
    case "photo":
      return bg(s.bg) + hook(s.pos || "top");
    case "product":
      return bg(s.bg) + hook(s.pos || "bottom");
    case "split":
      return (
        `<div class="half a" style="background-image:url('${url(base, s.top)}')"></div>` +
        `<div class="half b" style="background-image:url('${url(base, s.bottom)}')"></div>` +
        (s.top_label ? `<div class="lab a">${esc(s.top_label)}</div>` : "") +
        (s.bottom_label ? `<div class="lab b">${esc(s.bottom_label)}</div>` : "") +
        hook(s.pos || "middle")
      );
    case "tweet": {
      const q = s.quote
        ? `<div class="qt"><div class="who"><div><div class="nm">${esc(s.quote.name)}</div><div class="hd">${esc(s.quote.handle)}</div></div></div><div class="tx">${esc(s.quote.text)}</div></div>`
        : "";
      return (
        bg(s.bg, "dim") +
        `<div class="card"><div class="who"><div class="av"></div><div><div class="nm">${esc(s.name)}</div><div class="hd">${esc(s.handle)}</div></div></div>` +
        `<div class="tx">${esc(s.text)}</div>${q}<div class="meta">${esc(s.meta || "9:41 PM · 4.2M Views")}</div></div>`
      );
    }
    case "thread":
      return (
        bg(s.bg, "dim") +
        `<div class="th"><div class="from">${esc(s.from)}</div>${s.messages
          .map((m) => `<div class="bub ${m.me ? "me" : "them"}">${esc(m.text)}</div>`)
          .join("")}</div>` +
        hook(s.pos || "top")
      );
    default:
      throw new Error("unknown slide type: " + s.type);
  }
}

(async () => {
  const [specPath, outDir] = process.argv.slice(2);
  if (!specPath || !outDir) throw new Error("usage: node slides/render.js <spec.json> <out-dir>");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const base = path.dirname(path.resolve(specPath));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  let n = 0;
  for (const post of spec.posts) {
    const dir = path.join(outDir, `post-${post.id}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [i, s] of post.slides.entries()) {
      const tmp = path.join(dir, `.slide-${i + 1}.html`);
      fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s">${slideHTML(s, base)}</div></body></html>`);
      await page.goto("file://" + tmp);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.screenshot({ path: path.join(dir, `${i + 1}.png`) });
      fs.unlinkSync(tmp);
      n++;
    }
  }
  await browser.close();
  console.log(`rendered ${n} slides for ${spec.posts.length} posts into ${outDir}`);
})();

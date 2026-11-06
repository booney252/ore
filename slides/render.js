// Turns a day's post list into TikTok photo-mode slides (1080x1920 PNGs).
//
//   node slides/render.js <spec.json> <out-dir>
//
// spec.json: {"posts": [{"id": "01", "slides": [<slide>, ...]}, ...]}
// Every slide has a "type":
//   photo   {bg, text, pos?: "top"|"middle"|"bottom", focus?: "50% 30%", fit?: "contain"}   photo with the hook text (contain: whole screenshot)
//   split   {top, bottom, top_label?, bottom_label?, text?}                  before / after, stacked
//   tweet   {name, handle, text, time?, retweets?, quotes?, likes?, avatar?, verified?, quote?, overlay?}  dark-mode X post screenshot
//   thread  {bg, from, messages: [{me: bool, text}], text?}                  iMessage thread over a dimmed photo
//   imessage {name, initial?, avatar?, time?, day?, unread?, battery?, read?, messages: [{me, text} | {me, cash}]}  full iPhone screenshot, dark mode
//   any slide: stroke?: true|false forces the black outline on overlay text (default: only on bright backgrounds)
//   product {bg, text}                                                       product photo with a caption line
// Paths in bg/top/bottom are relative to the spec file. Style: knowledge/brockstaaa/slide-style.md.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const FONT = path.resolve(__dirname, "../assets/slides/TikTokSans.ttf");
const EMOJI_DIR = path.resolve(__dirname, ".emoji");
const EMOJI_CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/";
const EMOJI_RE = /(?:\p{RI}\p{RI})|(?:[#*0-9]️?⃣)|(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu;
const hexOf = (e) => [...e].map((c) => c.codePointAt(0).toString(16)).join("-");
const emojiFile = (e) => {
  const h = hexOf(e);
  for (const n of [h, h.replace(/-fe0f/g, ""), h.includes("fe0f") ? null : h.replace(/^([0-9a-f]+)/, "$1-fe0f")]) {
    if (n && fs.existsSync(path.join(EMOJI_DIR, n + ".png"))) return path.join(EMOJI_DIR, n + ".png");
  }
  return null;
};
/** Download the Apple image for every emoji in a slide, once (iPhone emoji, not the font's). */
async function ensureEmoji(text) {
  fs.mkdirSync(EMOJI_DIR, { recursive: true });
  for (const e of new Set(String(text).match(EMOJI_RE) || [])) {
    if (emojiFile(e)) continue;
    const h = hexOf(e);
    for (const n of [h, h.replace(/-fe0f/g, ""), h.includes("fe0f") ? null : h.replace(/^([0-9a-f]+)/, "$1-fe0f")]) {
      if (!n) continue;
      const r = await fetch(EMOJI_CDN + n + ".png").catch(() => null);
      if (r && r.ok) {
        fs.writeFileSync(path.join(EMOJI_DIR, n + ".png"), Buffer.from(await r.arrayBuffer()));
        break;
      }
    }
  }
}
const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(EMOJI_RE, (e) => {
      const f = emojiFile(e);
      return f ? `<img class="emj" src="file://${encodeURI(f)}" alt="">` : e;
    });
const url = (base, p) => (p ? "file://" + encodeURI(path.resolve(base, p)).replace(/'/g, "%27") : "");

const CSS = `
@font-face{font-family:TT;src:url('file://${FONT}')}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#111}
.s{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:TT}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.dim::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.35)}
.t{position:absolute;left:50%;width:470px;margin-left:-235px;text-align:center;font-variation-settings:"wght" 500;font-size:42px;line-height:1.16;
   color:#FBEEA9;z-index:2;white-space:pre-line}
.stroke{-webkit-text-stroke:5px #000;paint-order:stroke fill}
.top{top:300px}.high{top:150px}.t.sm{font-size:33px;line-height:1.2}.middle{top:50%;transform:translateY(-50%)}.bottom{bottom:330px}
.half{position:absolute;left:0;right:0;height:960px;background-size:cover;background-position:center}
.half.a{top:0}.half.b{top:960px}
.lab{position:absolute;left:0;right:0;text-align:center;font-size:42px;font-variation-settings:"wght" 500;color:#FBEEA9;z-index:2}
.lab.a{top:440px}.lab.b{top:1400px}
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

/* iMessage, iOS dark mode, drawn at the iPhone's 1320px screenshot width and scaled to 1080 */
.ios{position:absolute;left:0;top:0;width:1320px;height:2347px;transform:scale(.81818);transform-origin:0 0;background:#000;color:#fff;
     font-family:Inter,"Inter Display",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.im-sb{position:absolute;top:58px;left:0;right:0;height:80px}
.im-sb .im-tm{position:absolute;left:160px;top:6px;font-size:47px;font-weight:600;letter-spacing:-.5px}
.im-sb .im-ic{position:absolute;right:120px;top:12px;display:flex;gap:16px;align-items:center}
.im-bat{display:inline-flex;align-items:center;gap:3px}.im-bat b{background:#fff;color:#000;border-radius:14px;font-size:30px;font-weight:700;padding:3px 9px;line-height:1.1}
.im-bat i{width:5px;height:14px;background:#777;border-radius:0 3px 3px 0}
.im-hd{position:absolute;top:160px;left:0;right:0;height:300px}
.im-back{position:absolute;left:60px;top:2px;height:100px;padding:0 26px;border-radius:50px;background:#1c1c1e;display:flex;align-items:center;gap:22px}
.im-back svg{width:26px;height:44px}.im-back b{background:#fff;color:#000;font-size:31px;font-weight:600;border-radius:22px;padding:2px 15px}
.im-vid{position:absolute;right:60px;top:-10px;width:128px;height:128px;border-radius:50%;background:#1c1c1e;display:grid;place-items:center}
.im-av{position:absolute;left:570px;top:-20px;width:180px;height:180px;border-radius:50%;background:linear-gradient(180deg,#5d5873,#3b3850);display:grid;place-items:center;font-size:92px;font-weight:600;color:#fff;background-size:cover;background-position:center}
.im-nm{position:absolute;left:0;right:0;top:190px;display:flex;justify-content:center}
.im-nm span{background:#1c1c1e;border-radius:50px;padding:16px 34px;font-size:48px;font-weight:600;display:flex;gap:12px;align-items:center}
.im-nm em{font-style:normal;color:#8e8e93;font-size:36px}
.im-meta{position:absolute;top:510px;left:0;right:0;text-align:center;color:#8e8e93;font-size:32px;line-height:1.3}
.im-day{text-align:center;color:#8e8e93;font-size:31px;margin:0 0 26px}.im-day b{font-weight:600}
.im-msgs{position:absolute;top:630px;left:60px;right:60px;display:flex;flex-direction:column}
.im-m{position:relative;max-width:900px;padding:24px 40px;border-radius:46px;font-size:42px;line-height:1.3;margin-top:8px}
.im-m.im-gap{margin-top:30px}
.im-compact .im-m{font-size:38px;padding:17px 34px;margin-top:5px;line-height:1.25}.im-compact .im-m.im-gap{margin-top:18px}
.im-m.im-them{align-self:flex-start;background:#262628}
.im-m.im-me{align-self:flex-end;background:#2f8cfa}
.im-m.im-tail.im-them::before{content:"";position:absolute;bottom:0;left:-12px;width:40px;height:34px;background:#262628;border-bottom-right-radius:30px}
.im-m.im-tail.im-them::after{content:"";position:absolute;bottom:0;left:-24px;width:24px;height:36px;background:#000;border-bottom-right-radius:20px}
.im-m.im-tail.im-me::before{content:"";position:absolute;bottom:0;right:-12px;width:40px;height:34px;background:#2f8cfa;border-bottom-left-radius:30px}
.im-m.im-tail.im-me::after{content:"";position:absolute;bottom:0;right:-24px;width:24px;height:36px;background:#000;border-bottom-left-radius:20px}
.im-m.im-cash{background:#1c1c1e;padding:34px 44px;width:560px}.im-m.im-cash small{display:block;color:#8e8e93;font-size:30px;margin-bottom:8px}.im-m.im-cash b{font-size:84px;font-weight:600}
.im-rd{align-self:flex-end;color:#8e8e93;font-size:30px;margin:10px 18px 0 0}.im-rd b{font-weight:600}
.im-bar{position:absolute;left:40px;right:40px;bottom:96px;display:flex;align-items:center;gap:22px}
.im-plus{width:96px;height:96px;border-radius:50%;background:#1c1c1e;display:grid;place-items:center;color:#c7c7cc;font-size:62px;font-weight:300;line-height:1}
.im-field{flex:1;height:96px;border-radius:48px;border:2px solid #2c2c2e;background:#0d0d0d;color:#5b5b60;font-size:40px;display:flex;align-items:center;padding:0 36px;justify-content:space-between}
.im-home{position:absolute;left:50%;bottom:22px;width:370px;margin-left:-185px;height:13px;border-radius:7px;background:#fff}

/* Apple emoji images inline with text */
.emj{height:1.12em;width:auto;vertical-align:-.2em;margin:0 .03em;display:inline-block}
/* X post screenshot, dark mode: the reference is 596px wide, drawn at 1.81x */
.x{position:absolute;inset:0;background:#000;display:flex;align-items:center;font-family:Inter,system-ui,sans-serif;color:#e7e9ea;-webkit-font-smoothing:antialiased}
.x-in{width:100%;padding:0 29px}
.x-who{display:flex;align-items:center;gap:22px;position:relative}
.x-av,.xq-av{width:87px;height:87px;border-radius:50%;background:#3e4144;background-size:cover;background-position:center;overflow:hidden;flex:none}
.x-av svg,.xq-av svg{width:100%;height:100%}
.x-nm{display:flex;flex-direction:column;gap:2px}.x-nm b{font-size:28px;font-weight:700;display:flex;align-items:center;gap:6px}.x-nm span{font-size:27px;color:#71767b}
.x-ck{width:30px;height:30px}
.x-more{position:absolute;right:6px;top:-6px;color:#71767b;font-size:30px;letter-spacing:2px}
.x-tx{font-size:42px;line-height:1.32;margin:34px 0 0;white-space:pre-line}
.xq{margin-top:26px;border:2px solid #2f3336;border-radius:29px;padding:22px 26px}
.xq-who{display:flex;align-items:center;gap:12px;font-size:27px}.xq-who b{font-weight:700}.xq-who span{color:#71767b}
.xq-av{width:42px;height:42px}
.xq-tx{font-size:30px;line-height:1.32;margin-top:10px;white-space:pre-line}
.x-time{font-size:27px;color:#71767b;margin:34px 0 0;padding-bottom:29px;border-bottom:2px solid #2f3336}
.x-stats{display:flex;gap:44px;font-size:27px;color:#71767b;padding:29px 0;border-bottom:2px solid #2f3336}.x-stats b{color:#e7e9ea;font-weight:700}
.x-acts{display:flex;justify-content:space-around;padding:26px 0 8px}.x-acts svg{width:44px;height:44px}
`;

function slideHTML(s, base) {
  const bg = (p, extra = "") => `<div class="bg ${extra}" style="background-image:url('${url(base, p)}');${s.focus ? `background-position:${s.focus};` : ""}${s.fit ? `background-size:${s.fit};background-repeat:no-repeat;background-color:#000;` : ""}"></div>`;
  const hook = (pos = "top") => (s.text ? `<div class="t ${pos}${s.size === "small" ? " sm" : ""}">${esc(s.text)}</div>` : ""); // size "small" for long lists
  switch (s.type) {
    case "photo":
      return bg(s.bg) + hook(s.pos || "middle");
    case "product":
      return bg(s.bg) + hook(s.pos || "top"); // above the product, not on it
    case "split":
      return (
        `<div class="half a" style="background-image:url('${url(base, s.top)}')"></div>` +
        `<div class="half b" style="background-image:url('${url(base, s.bottom)}')"></div>` +
        (s.top_label ? `<div class="lab a">${esc(s.top_label)}</div>` : "") +
        (s.bottom_label ? `<div class="lab b">${esc(s.bottom_label)}</div>` : "") +
        hook(s.pos || "middle")
      );
    case "tweet": {
      // a dark-mode X post screenshot: {name, handle, text, time?, retweets?, quotes?, likes?, avatar?, verified?, quote?: {name, handle, text, time?}}
      const av = (a, cls) => a ? `<div class="${cls}" style="background-image:url('${url(base, a)}')"></div>` : `<div class="${cls}"><svg viewBox="0 0 40 40"><circle cx="20" cy="15" r="7" fill="#8b98a5"/><path d="M6 36c1.5-8 7-12 14-12s12.5 4 14 12z" fill="#8b98a5"/></svg></div>`;
      const q = s.quote
        ? `<div class="xq"><div class="xq-who">${av(s.quote.avatar, "xq-av")}<b>${esc(s.quote.name)}</b><span>${esc(s.quote.handle)}${s.quote.time ? " · " + esc(s.quote.time) : ""}</span></div><div class="xq-tx">${esc(s.quote.text)}</div></div>`
        : "";
      const n = (v, d) => esc(v ?? d);
      return (
        `<div class="x"><div class="x-in"><div class="x-who">${av(s.avatar, "x-av")}<div class="x-nm"><b>${esc(s.name)}${s.verified ? ' <svg class="x-ck" viewBox="0 0 22 22"><path fill="#1d9bf0" d="M20.4 11c0-1.3-.8-2.4-2-2.9.4-1.2.1-2.6-.8-3.5s-2.3-1.2-3.5-.8C13.6 2.6 12.4 1.8 11 1.8s-2.6.8-3.1 2c-1.2-.4-2.6-.1-3.5.8s-1.2 2.3-.8 3.5c-1.2.5-2 1.6-2 2.9s.8 2.4 2 2.9c-.4 1.2-.1 2.6.8 3.5s2.3 1.2 3.5.8c.5 1.2 1.6 2 3.1 2s2.6-.8 3.1-2c1.2.4 2.6.1 3.5-.8s1.2-2.3.8-3.5c1.2-.5 2-1.6 2-2.9z"/><path fill="#fff" d="M9.6 14.6l-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3z"/></svg>' : ""}</b><span>${esc(s.handle)}</span></div><div class="x-more">···</div></div>` +
        `<div class="x-tx">${esc(s.text)}</div>${q}<div class="x-time">${esc(s.time || "12:00 PM · Nov 1, 2026")}</div>` +
        `<div class="x-stats"><span><b>${n(s.retweets, "50")}</b> Retweets</span><span><b>${n(s.quotes, "10")}</b> Quote Tweets</span><span><b>${n(s.likes, "1K")}</b> Likes</span></div>` +
        `<div class="x-acts"><svg viewBox="0 0 24 24"><path d="M12 3c5 0 9 3.6 9 8s-4 8-9 8c-1.2 0-2.4-.2-3.4-.6L4 20l1.3-3.6C4 15 3 13.1 3 11c0-4.4 4-8 9-8z" fill="none" stroke="#71767b" stroke-width="1.8"/></svg>` +
        `<svg viewBox="0 0 24 24"><path d="M4 9l3-3 3 3M7 6v9a3 3 0 003 3h5M20 15l-3 3-3-3M17 18V9a3 3 0 00-3-3H9" fill="none" stroke="#71767b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
        `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="none" stroke="#71767b" stroke-width="1.8" stroke-linejoin="round"/></svg>` +
        `<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" fill="none" stroke="#71767b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` +
        `</div></div>` + (s.overlay ? `<div class="t ${s.pos || "bottom"}">${esc(s.overlay)}</div>` : "")
      );
    }
    case "thread":
      return (
        bg(s.bg, "dim") +
        `<div class="th"><div class="from">${esc(s.from)}</div>${s.messages
          .map((m) => `<div class="bub ${m.me ? "me" : "them"}">${esc(m.text)}</div>`)
          .join("")}</div>` +
        hook(s.pos || "middle")
      );
    case "imessage": {
      // a real-looking iPhone screenshot: {name, initial?, avatar?, time?, day?, unread?, battery?, read?, messages: [{me, text} | {me, cash: "30.00"}]}
      // texting style: a mom, dad or guy capitalizes the first word; girls texting girls stay lowercase.
      // `sender: "adult" | "guy" | "girl"` sets it; otherwise it's guessed from the contact name.
      const nm = String(s.name || "").toLowerCase();
      const sender = s.sender || (/\b(mom|mum|mama|dad|papa|grandma|grandpa|him|bae|babe|hubby|husband|bf|boyfriend|situationship|tyler|jake)\b/.test(nm) ? "guy" : "girl");
      const firstUp = (t) => t.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
      const firstDown = (t) => (/^\s*[A-Z][a-z]/.test(t) && !/^\s*I\b/.test(t) ? t.replace(/^(\s*)([A-Z])/, (_, a, b) => a + b.toLowerCase()) : t);
      const ms = (s.messages || []).map((m) =>
        m.text == null ? m : { ...m, text: m.me ? firstDown(m.text) : sender === "girl" ? firstDown(m.text) : firstUp(m.text) });
      const lastMe = ms.map((x) => x.me).lastIndexOf(true);
      const bubbles = ms.map((m, i) => {
        const next = ms[i + 1], prev = ms[i - 1];
        const tail = !next || next.me !== m.me ? " im-tail" : "";
        const gap = prev && prev.me !== m.me ? " im-gap" : "";
        const body = m.cash ? `<small>Apple Cash</small><b>$${esc(m.cash)}</b>` : esc(m.text);
        const read = s.read && i === lastMe ? `<div class="im-rd"><b>Read</b> ${esc(s.read)}</div>` : "";
        return `<div class="im-m ${m.me ? "im-me" : "im-them"}${m.cash ? " im-cash" : tail}${gap}">${body}</div>${read}`;
      }).join("");
      const day = (s.day || "Today 11:10 AM").split(" ");
      const av = s.avatar
        ? `<div class="im-av" style="background-image:url('${url(base, s.avatar)}')"></div>`
        : `<div class="im-av">${esc(s.initial || (s.name || "?").trim()[0].toUpperCase())}</div>`;
      return (
        `<div class="ios${ms.length > 8 ? " im-compact" : ""}"><div class="im-sb"><div class="im-tm">${esc(s.time || "11:11")}</div><div class="im-ic">` +
        `<svg width="54" height="34" viewBox="0 0 54 34"><rect x="0" y="24" width="9" height="10" rx="2" fill="#fff"/><rect x="14" y="17" width="9" height="17" rx="2" fill="#fff"/><rect x="28" y="9" width="9" height="25" rx="2" fill="#fff"/><rect x="42" y="0" width="9" height="34" rx="2" fill="#fff"/></svg>` +
        `<svg width="50" height="36" viewBox="0 0 50 36"><path d="M25 36l7-8a10 10 0 0 0-14 0z" fill="#fff"/><path d="M25 18a18 18 0 0 1 12.7 5.3l4.2-4.7A24 24 0 0 0 8.1 18.6l4.2 4.7A18 18 0 0 1 25 18z" fill="#fff"/><path d="M25 6a30 30 0 0 1 21.2 8.8l4.2-4.7a36 36 0 0 0-50.8 0l4.2 4.7A30 30 0 0 1 25 6z" fill="#fff"/></svg>` +
        `<span class="im-bat"><b>${esc(s.battery || "98")}</b><i></i></span></div></div>` +
        `<div class="im-hd"><div class="im-back"><svg viewBox="0 0 26 44"><path d="M22 4L4 22l18 18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${esc(s.unread || "50")}</b></div>` +
        `${av}<div class="im-vid"><svg width="62" height="44" viewBox="0 0 62 44"><rect x="3" y="5" width="38" height="34" rx="8" stroke="#fff" stroke-width="5" fill="none"/><path d="M44 17l14-9v28l-14-9z" stroke="#fff" stroke-width="5" fill="none" stroke-linejoin="round"/></svg></div>` +
        `<div class="im-nm"><span>${esc(s.name)} <em>›</em></span></div></div>` +
        `<div class="im-meta">iMessage<br>🔒 Encrypted</div>` +
        `<div class="im-msgs"><div class="im-day"><b>${esc(day[0])}</b> ${esc(day.slice(1).join(" "))}</div>${bubbles}</div><div class="im-bar"><div class="im-plus">+</div><div class="im-field"><span>iMessage</span><span>🎙</span></div></div><div class="im-home"></div></div>` +
        hook(s.pos || "bottom")
      );
    }
    default:
      throw new Error("unknown slide type: " + s.type);
  }
}


/** A thin black outline on overlay text that sits on a bright part of the photo (it can't be read
 * otherwise). Plain text everywhere else, like the owner's own slides. `stroke` true/false on a slide
 * forces it on or off. */
async function autoStroke(page, force) {
  const els = await page.$$(".t, .lab");
  for (const el of els) {
    let on = force;
    if (on === undefined) {
      await el.evaluate((n) => (n.style.visibility = "hidden"));
      const box = await el.boundingBox();
      const shot = box ? await page.screenshot({ clip: { x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height) } }) : null;
      await el.evaluate((n) => (n.style.visibility = ""));
      if (!shot) continue;
      // share of bright pixels behind the text (measured in the page: a data: URL never taints the canvas)
      on = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        // pale yellow text needs a dark background: outline it on anything light (mean or lots of light pixels)
        let light = 0, sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 16) {
          const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (y > 145) light++;
          sum += y;
          n++;
        }
        return n > 0 && (sum / n > 125 || light / n > 0.25);
      }, shot.toString("base64"));
    }
    if (on) await el.evaluate((n) => n.classList.add("stroke"));
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
      await ensureEmoji(JSON.stringify(s));
      const tmp = path.join(dir, `.slide-${i + 1}.html`);
      fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s">${slideHTML(s, base)}</div></body></html>`);
      await page.goto("file://" + tmp);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle").catch(() => {});
      await autoStroke(page, s.stroke);
      await page.screenshot({ path: path.join(dir, `${i + 1}.png`) });
      fs.unlinkSync(tmp);
      n++;
    }
  }
  await browser.close();
  console.log(`rendered ${n} slides for ${spec.posts.length} posts into ${outDir}`);
})();

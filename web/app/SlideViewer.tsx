"use client";

import { useEffect, useRef, useState } from "react";

/** A slideshow (TikTok photo carousel): swipe or scroll through the slides like on the phone,
 * with arrows, a counter, and thumbnails to jump to any slide. */
export default function SlideViewer({ slides, alt }: { slides: string[]; alt: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(slides.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="slides">
      <div className="slides-frame">
        <div className="slides-track" ref={track}>
          {slides.map((src, i) => (
            <img key={src} src={src} alt={`${alt}, slide ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} />
          ))}
        </div>
        <span className="slides-count mono">
          {at + 1} / {slides.length}
        </span>
        {at > 0 && (
          <button type="button" className="slides-arrow prev" onClick={() => go(at - 1)} aria-label="Previous slide">
            ‹
          </button>
        )}
        {at < slides.length - 1 && (
          <button type="button" className="slides-arrow next" onClick={() => go(at + 1)} aria-label="Next slide">
            ›
          </button>
        )}
      </div>
      <ol className="film">
        {slides.map((src, i) => (
          <li key={src}>
            <button type="button" onClick={() => go(i)} className={i === at ? "on" : ""} aria-label={`Slide ${i + 1}`}>
              <img src={src} alt="" loading="lazy" />
            </button>
            <span className="mono">{i + 1}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

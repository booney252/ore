"use client";

import { useEffect, useRef } from "react";

const FRAG = "precision mediump float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float s;\nfloat blob(vec2 u,vec2 c,float k){vec2 d=u-c;return exp(-dot(d,d)*k);}\nvoid main(){vec2 uv=gl_FragCoord.xy/r;float a=r.x/r.y;vec2 u=vec2(uv.x*a,uv.y);\n vec3 col=mix(vec3(.34,.78,.95),vec3(.18,.56,.88),smoothstep(.1,.9,uv.x+.15*sin(t*.07)));\n col=mix(col,vec3(.27,.73,.93),smoothstep(.6,1.,uv.x));\n vec2 mm=(m-.5)*.12;float warm=mix(.45,1.,clamp(a,0.,1.));\n col=mix(col,vec3(.18,.39,.85),.9*blob(u,vec2(a*(.58+.06*sin(t*.11))+mm.x,.52+.08*cos(t*.13)),3.2));\n col=mix(col,vec3(.94,.42,.66),.55*warm*blob(u,vec2(a*(.30+.05*cos(t*.09))+mm.x,.62+.07*sin(t*.15)+mm.y),5.));\n col=mix(col,vec3(1.,.54,.30),.6*warm*blob(u,vec2(a*(.40+.06*sin(t*.12+1.))+mm.x,.40+.08*sin(t*.1)),5.5));\n float glow=0.;vec3 tint=vec3(0.);\n for(int i=0;i<4;i++){float fi=float(i);\n  for(int j=0;j<6;j++){float fj=float(j);\n   float x=uv.x;\n   float y=.46+.10*fi*.4+.17*sin(x*2.2+t*.22+fi*1.7+s*1.5)+.06*sin(x*5.1-t*.35+fi)+fj*.011*sin(x*3.+t*.3+fi)+mm.y;\n   float d=abs(uv.y-y);float w=.0025+.0012*fj;\n   float g=w/(d+w)*.16*(1.-fj*.12)*smoothstep(-.1,.35,x)*smoothstep(1.15,.55,x);\n   glow+=g;tint+=g*mix(vec3(1.,.82,.7),vec3(.85,.93,1.),fi/3.);}}\n col+=tint*mix(.35,.7,clamp(a,0.,1.));col=mix(col,vec3(1.),clamp(glow-.7,0.,.2));\n gl_FragColor=vec4(col,1.);}";
const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

/** The landing page's live glow: flowing light ribbons in Ore's colors, drawn in WebGL behind the band.
 *  Falls back to the band's CSS glow if WebGL isn't there; holds still for reduced motion. */
export default function GlowBg() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const host = c?.parentElement;
    if (!c || !host) return;
    const gl = c.getContext("webgl", { premultipliedAlpha: false, antialias: false });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const o = gl.createShader(type)!;
      gl.shaderSource(o, src);
      gl.compileShader(o);
      return o;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(pr, "r"), ut = gl.getUniformLocation(pr, "t"), um = gl.getUniformLocation(pr, "m"), us = gl.getUniformLocation(pr, "s");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 700;
    const scale = small ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
    const size = () => {
      c.width = Math.max(1, Math.round(host.clientWidth * scale));
      c.height = Math.max(1, Math.round(host.clientHeight * scale));
      gl.viewport(0, 0, c.width, c.height);
    };
    size();
    window.addEventListener("resize", size);
    let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, raf = 0, last = 0;
    const t0 = performance.now();
    const move = (e: PointerEvent) => { tx = e.clientX / window.innerWidth; ty = 1 - e.clientY / window.innerHeight; };
    window.addEventListener("pointermove", move, { passive: true });
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || (small && now - last < 33)) return;
      last = now;
      mx += (tx - mx) * 0.04;
      my += (ty - my) * 0.04;
      gl.uniform2f(ur, c.width, c.height);
      gl.uniform1f(ut, reduce ? 8 : (now - t0) / 1000);
      gl.uniform2f(um, mx, my);
      gl.uniform1f(us, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      c.classList.add("on");
      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", move);
    };
  }, []);
  return <canvas ref={ref} className="oa-gl" aria-hidden="true" />;
}

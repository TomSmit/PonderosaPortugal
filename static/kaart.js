(function(){
"use strict";
const V = window.VALLEI;
const $ = s => document.querySelector(s);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} } };
const lang = ["pt","en"].includes(document.documentElement.lang) ? document.documentElement.lang : "nl";
const ROOT = window.ROOT || "";
/* De teksten en plekken komen uit de map inhoud/ en worden door bouw.py in de pagina gezet. */
const K = window.KAART;
const CONTENT = { [lang]: { ui:K.teksten, title:K.titel, sub:K.ondertitel, places:K.plaatsnamen, spots:K.plekken } };
const SPOTS = window.PUNTEN.map(p=>({ id:p.id, lat:p.lat, lon:p.lon, main:!!p.hoofdplek }));
const PLACES = [
  { id:"corujeira", lat:40.50689, lon:-7.33855 },
  { id:"meios",     lat:40.49390, lon:-7.36029 },
  { id:"mondego",   lat:40.50985, lon:-7.37330, water:true },
  { id:"albufeira", lat:40.52300, lon:-7.32870, water:true }
];
/* Gebouwen op de quinta, afgeleid van de satellietfoto. Rivierhuis en Pisão iets van de rivier af geschoven, omdat de rivierlijn in OpenStreetMap hier niet precies klopt. b = breedte, d = diepte in meters, hoek in graden. */
const QUINTA_BUILDINGS = [
  { naam:"Theater",       lat:40.514346, lon:-7.353098, b:19, d:8,   hoek:23, dak:"grijs" },
  { naam:"Huis van Mirjam", lat:40.513407, lon:-7.351765, b:9,  d:8.5, hoek:-8 },
  { naam:"Rivierhuis",    lat:40.513427, lon:-7.351547, b:9,  d:6.5, hoek:-8 },
  { naam:"Pisão",         lat:40.513358, lon:-7.351405, b:9,  d:9,   hoek:-8 },
  { naam:"Buitenkeuken",  lat:40.513307, lon:-7.351667, b:5,  d:4,   hoek:-8, open:true }
];
const SMALL = Math.min(innerWidth, innerHeight) < 600;

/* ================= geografie ================= */
const [MZ, CX0, CX1, CY0, CY1] = V.merc, NT=Math.pow(2,MZ);
function frac(lat, lon){
  const x=(lon+180)/360*NT, r=lat*Math.PI/180;
  const y=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*NT;
  return [(x-CX0)/(CX1-CX0), (y-CY0)/(CY1-CY0)];
}
function unfrac(fx, fy){
  const x=CX0+fx*(CX1-CX0), y=CY0+fy*(CY1-CY0);
  return [Math.atan(Math.sinh(Math.PI*(1-2*y/NT)))*180/Math.PI, x/NT*360-180];
}
const W=V.n, H=V.n, SX=V.size, SZ=V.size, BASE=V.base, EXAG=1.35, STEP=20, BOTTOM=BASE-80;
const RAD=V.r;                     // straal van de ronde maquette in meters
const RF=RAD/SX;                   // straal in kaartfracties
const inCircle=(fx,fy,k=1)=>Math.hypot(fx-0.5,fy-0.5)<=RF*k;
const raw = Uint8Array.from(atob(V.elev), c=>c.charCodeAt(0));
const dv = new DataView(raw.buffer);
const elev = new Float32Array(W*H);
for(let i=0;i<W*H;i++) elev[i] = dv.getUint16(i*2,true)/50 + BASE;
function hGrid(x, y){ // x,y in rastereenheden
  x=Math.min(Math.max(x,0),W-1.001); y=Math.min(Math.max(y,0),H-1.001);
  const i=x|0, j=y|0, u=x-i, v=y-j, k=j*W+i;
  return (elev[k]*(1-u)+elev[k+1]*u)*(1-v) + (elev[k+W]*(1-u)+elev[k+W+1]*u)*v;
}
const heightAt = (fx, fy) => hGrid(fx*W-0.5, fy*H-0.5);
const yAt = (fx, fy) => (heightAt(fx,fy)-BASE)*EXAG;
const toWorld = (fx, fy, lift=0) => [(fx-0.5)*SX, yAt(fx,fy)+lift, (fy-0.5)*SZ];

/* zon uit het westzuidwesten, ongeveer 38 graden hoog */
const SUN = (()=>{ const v=[-0.70,0.62,0.36]; const l=Math.hypot(...v); return v.map(x=>x/l); })();
const SUNH = (()=>{ const l=Math.hypot(SUN[0],SUN[2]); return [SUN[0]/l, SUN[2]/l]; })();
const TANE = SUN[1]/Math.hypot(SUN[0],SUN[2]);

/* ================= licht vooraf berekenen: slagschaduw en holtes ================= */
let MAXH=0; for(let i=0;i<W*H;i++) if(elev[i]>MAXH) MAXH=elev[i];
function bakeLight(){
  const out=new Uint8Array(W*H*4);
  const dx=SX/W, dz=SZ/H;
  const cs=Math.min(dx,dz);                 // stap in meters
  const gx=SUNH[0]*cs/dx, gz=SUNH[1]*cs/dz; // stap in rastereenheden
  const dirs=[]; for(let a=0;a<8;a++){ const t=a/8*Math.PI*2; dirs.push([Math.cos(t), Math.sin(t)]); }
  const aoD=[14,30,55,90,140,210,300];
  for(let j=0;j<H;j++) for(let i=0;i<W;i++){
    const k=j*W+i, h0=elev[k]*EXAG;
    if(!inCircle((i+0.5)/W,(j+0.5)/H,1.03)){ out[k*4]=255; out[k*4+1]=255; out[k*4+3]=255; continue; }
    // slagschaduw met zachte rand
    let occ=-1;
    for(let s=1;s<150;s++){
      const x=i+gx*s, y=j+gz*s; if(x<0||y<0||x>W-1||y>H-1) break;
      const d=s*cs, e=(hGrid(x,y)*EXAG - h0 - d*TANE)/d;
      if(e>occ) occ=e; if(h0+d*TANE > MAXH*EXAG) break;
    }
    const light=1-Math.min(Math.max((occ+0.02)/0.10,0),1);
    // holtes (ambient occlusion)
    let sum=0;
    for(const [ux,uz] of dirs){
      let m=0;
      for(const d of aoD){
        const x=i+ux*d/dx, y=j+uz*d/dz; if(x<0||y<0||x>W-1||y>H-1) break;
        const t=(hGrid(x,y)*EXAG-h0)/d; if(t>m) m=t;
      }
      sum+=Math.atan(m)/(Math.PI/2);
    }
    const ao=1-Math.min(sum/8*1.8,1);
    out[k*4]=light*255; out[k*4+1]=ao*255; out[k*4+2]=0; out[k*4+3]=255;
  }
  return out;
}

/* ================= tekst ================= */
function T(){ return CONTENT[lang]; }
function applyText(){
  const c=T();
  $("#b-home").textContent=c.ui.home; $("#b-north").setAttribute("aria-label", c.ui.north);
  $("#p-close").setAttribute("aria-label", c.ui.close);
  $("#credit-text").innerHTML=c.ui.credit; $("#credit-i").setAttribute("aria-label",c.ui.sources||"Bronnen");
  $("#b-places").textContent=c.ui.places;
  const lt=$("#loading-t"); if(lt) lt.textContent=c.ui.loading;
  pins.forEach(p=>{ p.btn.textContent=c.spots[p.id].name; p.w=0; });
  places.forEach(p=>{ p.el.textContent=c.places[p.id]; });
}

/* ================= vlaggetjes ================= */
const labelLayer=$("#labels");
const pins = SPOTS.map(s=>{
  const el=document.createElement("div"); el.className="pin"+(s.main?" main":"");
  el.innerHTML='<span class="stem"></span><span class="foot"></span>';
  const btn=document.createElement("button"); btn.type="button";
  btn.addEventListener("click", e=>{ e.stopPropagation(); goSpot(s.id); });
  btn.style.setProperty("--rot", ((SPOTS.indexOf(s)*37%7)-3)*0.8+"deg");
  el.appendChild(btn); labelLayer.appendChild(el);
  const f=frac(s.lat,s.lon);
  return { id:s.id, el, btn, f, pos:toWorld(f[0],f[1],2) };
});
const places = PLACES.map(s=>{
  const el=document.createElement("div"); el.className="place"+(s.water?" water":"");
  labelLayer.appendChild(el);
  const f=frac(s.lat,s.lon);
  return { id:s.id, el, f, pos:toWorld(f[0],f[1],s.water?25:45), water:!!s.water };
});

/* ================= aquarel op de ondergrond ================= */
const OW=SMALL?2048:3072, OH=OW, mPerPx=SX/OW;
const overlay=document.createElement("canvas"); overlay.width=OW; overlay.height=OH;
const ox=overlay.getContext("2d");
let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
function vhash(x,y){ const s=Math.sin(x*127.1+y*311.7)*43758.5453; return s-Math.floor(s); }
function vnoise(x,y){ const i=Math.floor(x), j=Math.floor(y); let u=x-i, v=y-j; u=u*u*(3-2*u); v=v*v*(3-2*v);
  const a=vhash(i,j), b=vhash(i+1,j), c=vhash(i,j+1), d=vhash(i+1,j+1); return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v; }
function wobblePath(flat, close, jitPx, phase, keep){
  // lijnen opdelen en licht laten golven, zoals een penseel dat nooit precies de lijn volgt
  if(!keep) ox.beginPath();
  const n=flat.length/2; let first=true;
  const f=0.035;
  for(let i=0;i<n-(close?0:1);i++){
    const ax=flat[i*2]*OW, ay=flat[i*2+1]*OH, j=(i+1)%n, bx=flat[j*2]*OW, by=flat[j*2+1]*OH;
    const len=Math.hypot(bx-ax,by-ay), seg=Math.max(1,Math.ceil(len/7));
    for(let s=0;s<seg;s++){
      const t=s/seg, x=ax+(bx-ax)*t, y=ay+(by-ay)*t;
      const wx=x+(vnoise(x*f+phase,y*f)-.5)*2*jitPx, wy=y+(vnoise(x*f,y*f+phase+50)-.5)*2*jitPx;
      if(first){ ox.moveTo(wx,wy); first=false; } else ox.lineTo(wx,wy);
    }
  }
  if(!close && n){ const x=flat[(n-1)*2]*OW, y=flat[(n-1)*2+1]*OH; ox.lineTo(x,y); }
  if(close) ox.closePath();
}
function polyPath(rings, jitPx, phase){
  // een vlak kan uit meerdere ringen bestaan (gaten, zoals eilandjes in het stuwmeer)
  ox.beginPath(); rings.forEach(r=>{ if(jitPx) wobblePath(r,true,jitPx,phase,true); else { for(let i=0;i<r.length;i+=2){ const x=r[i]*OW,y=r[i+1]*OH; i?ox.lineTo(x,y):ox.moveTo(x,y);} ox.closePath(); } });
}
function wash(name, rgb, alpha, jitM, inkA){
  const L=V.layers[name]||[], jit=jitM/mPerPx;
  ox.save();
  for(let p=0;p<3;p++){
    ox.globalAlpha=alpha*(p===0?0.6:0.32); ox.fillStyle="rgb("+rgb+")";
    L.forEach(poly=>{ polyPath(poly,jit*(0.6+p*0.5),p*17.3); ox.fill("evenodd"); });
  }
  const dark=rgb.split(",").map(v=>Math.round(v*0.72)).join(",");
  ox.globalAlpha=alpha*0.6; ox.strokeStyle="rgb("+dark+")"; ox.lineWidth=2; ox.lineJoin="round";
  L.forEach(poly=>{ polyPath(poly,jit*0.6,0); ox.stroke(); });
  if(inkA){ // fijne inktlijn om het veld, net niet precies op de verfrand
    ox.globalAlpha=inkA; ox.strokeStyle="rgb(52,40,32)"; ox.lineWidth=1.3;
    L.forEach(poly=>{ polyPath(poly,jit*0.9,31); ox.stroke(); });
  }
  ox.restore();
}
function line(name, color, widthM, opts={}){
  const L=V.layers[name]||[];
  ox.save(); ox.strokeStyle=color; ox.lineWidth=Math.max(widthM/mPerPx,0.8); ox.lineCap="round"; ox.lineJoin="round";
  if(opts.alpha!=null) ox.globalAlpha=opts.alpha;
  if(opts.dash) ox.setLineDash(opts.dash.map(d=>d/mPerPx));
  if(opts.dx) ox.translate(opts.dx,opts.dy);
  L.forEach(l=>{ if(opts.jit){ wobblePath(l,false,opts.jit/mPerPx,opts.phase||0); } else { ox.beginPath(); for(let i=0;i<l.length;i+=2){ const x=l[i]*OW,y=l[i+1]*OH; i?ox.lineTo(x,y):ox.moveTo(x,y);} } ox.stroke(); });
  ox.restore();
}
function fill(name, color, dx=0, dy=0, poly=false){
  ox.save(); ox.fillStyle=color; ox.translate(dx,dy);
  (V.layers[name]||[]).forEach(l=>{ if(poly){ polyPath(l,0,0); ox.fill("evenodd"); } else { ox.beginPath(); for(let i=0;i<l.length;i+=2){ const x=l[i]*OW,y=l[i+1]*OH; i?ox.lineTo(x,y):ox.moveTo(x,y);} ox.closePath(); ox.fill(); } });
  ox.restore();
}

/* ================= bomen plaatsen ================= */
function maskOf(names){
  const mw=1024, mh=1024;
  const c=document.createElement("canvas"); c.width=mw; c.height=mh; const g=c.getContext("2d");
  g.fillStyle="#000";
  names.forEach(n=>(V.layers[n]||[]).forEach(poly=>{
    g.beginPath();
    (Array.isArray(poly[0])?poly:[poly]).forEach(l=>{ for(let i=0;i<l.length;i+=2){ const x=l[i]*mw,y=l[i+1]*mh; i?g.lineTo(x,y):g.moveTo(x,y);} g.closePath(); });
    g.fill("evenodd");
  }));
  const d=g.getImageData(0,0,mw,mh).data;
  return (fx,fy)=>{ const x=Math.floor(fx*mw), y=Math.floor(fy*mh); if(x<0||y<0||x>=mw||y>=mh) return false; return d[(y*mw+x)*4+3]>0; };
}
function scatter(mask, spacingM, maxN, s0){
  seed=s0; const pts=[]; const sf=spacingM/SX, sfz=spacingM/SZ;
  for(let fy=0; fy<1; fy+=sfz) for(let fx=0; fx<1; fx+=sf){
    const x=fx+(rnd()-.5)*sf*1.1, y=fy+(rnd()-.5)*sfz*1.1;
    if(inCircle(x,y,0.995)&&mask(x,y)) pts.push([x,y,rnd(),rnd()]);
  }
  if(pts.length>maxN){ const keep=maxN/pts.length; return pts.filter(()=>rnd()<keep); }
  return pts;
}
let TREES=[], BUSHES=[];
/* ================= dorpshuisjes langs de straten van Trinta ================= */
let VILLAGE_HOUSES=[];
function inRing(x,y,r){ let c=false; const n=r.length/2; for(let i=0,j=n-1;i<n;j=i++){ const xi=r[i*2],yi=r[i*2+1],xj=r[j*2],yj=r[j*2+1]; if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) c=!c; } return c; }
function fillVillage(lat, lon, s0){
  const f=frac(lat,lon);
  const poly=(V.layers.village||[]).find(p=>inRing(f[0],f[1],p[0])); if(!poly) return;
  const ring=poly[0];
  const M=(fx,fy)=>[(fx-0.5)*SX,(fy-0.5)*SZ];                 // kaartfractie naar meters
  const roads=[]; ["minor","road","track"].forEach(n=>(V.layers[n]||[]).forEach(l=>{ for(let i=0;i<l.length-2;i+=2) roads.push([M(l[i],l[i+1]),M(l[i+2],l[i+3]),n]); }));
  const segDist=(p,a,b)=>{ const vx=b[0]-a[0], vz=b[1]-a[1], L=vx*vx+vz*vz||1; let t=((p[0]-a[0])*vx+(p[1]-a[1])*vz)/L; t=Math.max(0,Math.min(1,t)); return Math.hypot(p[0]-a[0]-t*vx, p[1]-a[1]-t*vz); };
  const existing=(V.layers.building||[]).map(b=>{ let x=0,z=0,n=b.length/2; for(let i=0;i<b.length;i+=2){ x+=b[i]; z+=b[i+1]; } return M(x/n,z/n); });
  const placed=[]; seed=s0;
  const free=(c,r)=>existing.every(e=>Math.hypot(e[0]-c[0],e[1]-c[1])>r+5) && placed.every(h=>Math.hypot(h.x-c[0],h.z-c[1])>r+h.r+1.5) && roads.every(([a,b,n])=>segDist(c,a,b)>(n==="track"?3:5)+r*0.55);
  const walls=[[0.98,0.96,0.90],[0.97,0.93,0.82],[0.96,0.86,0.78],[0.80,0.78,0.74],[0.99,0.97,0.93],[0.93,0.88,0.72]];
  const roofs=[[0.90,0.42,0.22],[0.84,0.38,0.22],[0.93,0.50,0.28],[0.78,0.34,0.20]];
  roads.forEach(([a,b,n])=>{
    if(n==="track") return;
    const vx=b[0]-a[0], vz=b[1]-a[1], L=Math.hypot(vx,vz); if(L<1) return;
    const ux=vx/L, uz=vz/L, ang=Math.atan2(uz,ux);
    for(let t=4; t<L; t+=11+rnd()*5){
      for(const side of [-1,1]){
        if(rnd()<0.22) continue;                                  // af en toe een tuintje of een gat
        const w=7+rnd()*5, d=6+rnd()*3, off=5+d/2+rnd()*2;
        const c=[a[0]+ux*t - uz*off*side, a[1]+uz*t + ux*off*side];
        const fx=c[0]/SX+0.5, fy=c[1]/SZ+0.5;
        if(!inRing(fx,fy,ring)) continue;
        const r=Math.hypot(w,d)/2;
        if(!free(c,r)) continue;
        placed.push({x:c[0], z:c[1], w, d, ang, r, wall:walls[Math.floor(rnd()*walls.length)], roof:roofs[Math.floor(rnd()*roofs.length)], h:5.5+rnd()*2.5});
      }
    }
  });
  VILLAGE_HOUSES=VILLAGE_HOUSES.concat(placed);
}
function placeTrees(){
  VILLAGE_HOUSES=[]; fillVillage(40.5038,-7.35498, 61);
  TREES=scatter(maskOf(["wood"]), SMALL?20:13, SMALL?12000:48000, 3);
  const clear=QUINTA_BUILDINGS.map(b=>{ const f=frac(b.lat,b.lon); return [f[0],f[1],Math.max(b.b,b.d)*0.7+7]; });
  TREES=TREES.filter(p=>clear.every(([x,y,r])=>Math.hypot((p[0]-x)*SX,(p[1]-y)*SZ)>r));
  TREES=TREES.filter(p=>{ const x=(p[0]-0.5)*SX, z=(p[1]-0.5)*SZ; return VILLAGE_HOUSES.every(h=>Math.hypot(h.x-x,h.z-z)>h.r+4); });
  BUSHES=scatter(maskOf(["scrub","meadow"]), SMALL?45:28, SMALL?2500:9000, 5);
  // losse struiken op de open hellingen, zodat lege stukken niet kaal ogen
  const taken=maskOf(["wood","scrub","meadow","farm","village","building","water","rock","dam"]);
  BUSHES=BUSHES.concat(scatter((x,y)=>!taken(x,y), SMALL?110:65, SMALL?1800:6000, 9));
}

function paintOverlay(){
  ox.clearRect(0,0,OW,OH);
  ox.save(); ox.beginPath(); ox.arc(OW/2, OH/2, RF*OW*1.01, 0, Math.PI*2); ox.clip();
  const INK="rgb(46,36,30)";
  // velden, weides en bos in verzadigde waterverf met inktranden
  wash("scrub",  "150,170,70", 0.42, 8, 0);
  wash("meadow", "120,196,72", 0.6, 6, 0.45);
  wash("farm",   "245,206,82", 0.72, 6, 0.6);
  wash("rock",   "196,178,150", 0.6, 5, 0.5);
  wash("wood",   "58,128,58", 0.55, 8, 0.35);
  wash("village","240,158,124", 0.5, 5, 0.5);
  // akkers krijgen een paar voren, zoals met potlood ingetekend
  ox.save(); ox.strokeStyle="rgba(170,120,40,0.35)"; ox.lineWidth=1;
  (V.layers.farm||[]).forEach(poly=>{
    ox.save(); polyPath(poly,0,0); ox.clip("evenodd");
    const r=poly[0]; let mx=1,my=1,Mx=0,My=0; for(let i=0;i<r.length;i+=2){ mx=Math.min(mx,r[i]);Mx=Math.max(Mx,r[i]);my=Math.min(my,r[i+1]);My=Math.max(My,r[i+1]); }
    const ang=vhash(mx*99,my*99)*Math.PI, ca=Math.cos(ang), sa=Math.sin(ang), cx=(mx+Mx)/2*OW, cy=(my+My)/2*OH, ext=Math.max(Mx-mx,My-my)*OW;
    ox.beginPath(); for(let k=-ext;k<ext;k+=7/mPerPx*1.0+3){ ox.moveTo(cx+ca*k-sa*ext, cy+sa*k+ca*ext); ox.lineTo(cx+ca*k+sa*ext, cy+sa*k-ca*ext); } ox.stroke();
    ox.restore();
  });
  ox.restore();
  // schaduw van bomen en struiken op de grond
  const sx=-SUNH[0], sz=-SUNH[1];
  ox.save(); ox.fillStyle="rgba(80,70,150,0.22)";
  const dab=(p,r,hgt)=>{ const off=hgt/TANE/mPerPx; ox.beginPath(); ox.ellipse(p[0]*OW+sx*off, p[1]*OH+sz*off, Math.max(r/mPerPx*1.15,0.8), Math.max(r/mPerPx*0.9,0.6), 0, 0, Math.PI*2); ox.fill(); };
  TREES.forEach(p=>dab(p, 4.5+p[2]*2.5, 11));
  BUSHES.forEach(p=>dab(p, 2.5+p[2]*1.5, 3));
  ox.restore();
  // water: stuwmeer met lichte oever en inktrand
  ox.save(); ox.globalAlpha=0.5; ox.strokeStyle="rgb(175,222,246)"; ox.lineWidth=18/mPerPx; ox.lineJoin="round";
  (V.layers.water||[]).forEach(p=>{ polyPath(p,0,0); ox.stroke(); }); ox.restore();
  fill("water","rgba(58,140,214,0.92)",0,0,true);
  ox.save(); ox.globalAlpha=0.3; ox.fillStyle="rgb(30,92,170)";
  (V.layers.water||[]).forEach(p=>{ polyPath(p,5/mPerPx,5); ox.fill("evenodd"); }); ox.restore();
  ox.save(); ox.strokeStyle="rgba(255,255,255,0.7)"; ox.lineWidth=1.4; ox.lineCap="round";
  seed=77; (V.layers.water||[]).forEach(poly=>{ const r=poly[0]; for(let k=0;k<r.length;k+=12){ const x=r[k]*OW, y=r[k+1]*OH; } }); ox.restore();
  ox.save(); ox.strokeStyle=INK; ox.globalAlpha=0.85; ox.lineWidth=1.8; ox.lineJoin="round";
  (V.layers.water||[]).forEach(p=>{ polyPath(p,2/mPerPx,11); ox.stroke(); }); ox.restore();
  // beekjes en de Mondego: inktoevers, helderblauw water, lichte stroomlijn
  line("stream", INK, 4.6, {alpha:0.75, jit:1.4, phase:2});
  line("stream", "rgb(70,150,220)", 2.6, {jit:1.4, phase:2});
  line("canal",  "rgb(80,150,215)", 2.2, {alpha:0.8, dash:[7,4]});
  line("river",  "rgb(160,210,240)", 34, {alpha:0.35});
  line("river",  INK, 17, {alpha:0.9, jit:2.2, phase:3});
  line("river",  "rgb(56,138,214)", 13.5, {jit:2.2, phase:3});
  line("river",  "rgb(40,110,196)", 8, {alpha:0.5, jit:1.8, phase:9});
  line("river",  "rgb(205,234,250)", 3, {alpha:0.8, jit:1.4, phase:21, dash:[14,9]});
  // dam
  fill("dam","rgb(226,222,210)",0,0,true);
  ox.save(); ox.strokeStyle=INK; ox.lineWidth=1.6; (V.layers.dam||[]).forEach(p=>{ polyPath(p,0,0); ox.stroke(); }); ox.restore();
  // wegen als zandkleurige linten met een inktrand, karrensporen gestippeld
  line("track", "rgba(150,104,62,0.75)", 2.4, {dash:[5,3.5], jit:0.8, phase:4});
  line("path",  "rgba(46,36,30,0.7)", 1.8, {dash:[0.1,5]});
  line("minor", INK, 7.5, {alpha:0.85, jit:0.8, phase:6});
  line("minor", "rgb(240,228,198)", 4.6, {jit:0.8, phase:6});
  line("road",  INK, 11, {alpha:0.9, jit:0.8, phase:8});
  line("road",  "rgb(236,222,186)", 7.5, {jit:0.8, phase:8});
  line("road",  "rgba(255,255,255,0.75)", 0.9, {dash:[6,6], jit:0.8, phase:8});
  // de passadiços: houten plankenpad
  line("boardwalk", INK, 7, {alpha:0.9});
  line("boardwalk", "rgb(204,146,84)", 4.8);
  line("boardwalk", "rgba(110,70,36,0.8)", 4.8, {dash:[0.6,1.6]});
  // schaduw van huizen
  fill("building","rgba(80,70,150,0.28)", sx*9/TANE/mPerPx, sz*9/TANE/mPerPx);
  ox.save(); ox.fillStyle="rgba(80,70,150,0.26)";
  VILLAGE_HOUSES.forEach(h=>{ const off=(h.h+2)/TANE/mPerPx; ox.save(); ox.translate((h.x/SX+0.5)*OW+sx*off, (h.z/SZ+0.5)*OH+sz*off); ox.rotate(h.ang); ox.fillRect(-h.w/2/mPerPx,-h.d/2/mPerPx,h.w/mPerPx,h.d/mPerPx); ox.restore(); });
  ox.restore();
  ox.restore();
}

/* ================= WebGL ================= */
let renderer=null, scene, camera, tex, lightTex, terrainMat;
function webglOK(){ try{ const c=document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2")||c.getContext("webgl"))); }catch(e){ return false; } }

const NOISE=`
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
float lineAA(float v, float w){ float d=abs(fract(v-0.5)-0.5)/max(fwidth(v),1e-4); return 1.0-smoothstep(w-0.5, w+0.5, d); }
`;
const LIGHTING=`
uniform sampler2D uLight; uniform vec2 uLGrid; uniform vec2 uSize; uniform vec3 uS; uniform vec3 uBg;
vec2 lightUV(vec2 uv){ return uv; }
vec3 paint(vec3 col, float lam, float sh, float ao, vec3 wp){
  float direct=lam*sh;
  float shadowAmt=1.0-smoothstep(0.08,0.6,direct);
  // warm licht, koele paarsblauwe schaduw zoals in aquarel
  col*=0.86+0.24*direct;
  col=mix(col, col*vec3(0.66,0.62,1.0)+vec3(0.0,0.0,0.03), shadowAmt*0.45);
  // kleurpotloodarcering in de schaduw
  float hv=(wp.x+wp.z)*0.085 + (noise(wp.xz*0.015)-0.5)*1.6;
  float hatch=lineAA(hv,0.55)*(1.0-smoothstep(0.18,0.45,fwidth(hv)));
  col=mix(col, col*vec3(0.55,0.50,0.88), hatch*shadowAmt*0.5);
  col*=mix(0.78,1.0,ao);
  float d=length(wp-cameraPosition);
  col=mix(col, uBg, smoothstep(9000.0,24000.0,d)*0.35);
  return col;
}
`;
const TERRAIN_VS=`
attribute float aH; attribute float aSide; attribute float aTop;
uniform float uExag, uBase;
varying vec3 vPos; varying vec3 vN; varying vec2 vUv; varying float vH; varying float vSide; varying float vTop;
void main(){
  vec3 p=vec3(position.x,(aH-uBase)*uExag,position.z);
  vPos=p; vN=normal; vUv=uv; vH=aH; vSide=aSide; vTop=aTop;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;
const TERRAIN_FS=`
precision highp float;
uniform sampler2D uMap; uniform float uStep, uBase;
varying vec3 vPos; varying vec3 vN; varying vec2 vUv; varying float vH; varying float vSide; varying float vTop;
${NOISE}
${LIGHTING}
void main(){
  vec3 S=normalize(uS);
  vec3 fn=normalize(cross(dFdx(vPos),dFdy(vPos)));
  if(dot(fn, cameraPosition-vPos)<0.0) fn=-fn;
  if(vSide>0.5){
    // doorsnede van de aarde: gras, bruine grond, lagen en steentjes
    float depth=vTop-vH;
    float wob=(noise(vec2(atan(vPos.z,vPos.x)*90.0, vH*0.05))-0.5)*18.0;
    vec3 col=mix(vec3(0.66,0.47,0.30), vec3(0.47,0.32,0.22), smoothstep(40.0,520.0,depth+wob));
    col=mix(col, vec3(0.45,0.70,0.26), 1.0-smoothstep(5.0,9.0,depth+wob*0.3));
    float strata=lineAA((vH+wob)/38.0,0.7)*(1.0-smoothstep(0.15,0.4,fwidth((vH+wob)/38.0)));
    col=mix(col, vec3(0.25,0.17,0.13), strata*0.45*step(9.0,depth));
    float pebble=step(0.82,noise(vec2(atan(vPos.z,vPos.x)*260.0, vH*0.09)));
    col=mix(col, vec3(0.80,0.74,0.66), pebble*0.55*step(12.0,depth));
    col*=0.78+0.30*max(dot(fn,S),0.0);
    gl_FragColor=vec4(col,1.0); return;
  }
  vec3 n=normalize(vN);
  float lam=max(dot(n,S),0.0);
  vec4 lb=texture2D(uLight, lightUV(vUv));
  // grondverf: geelgroen in het dal, oker en olijf op de toppen
  vec2 q=vPos.xz*0.003; float w=fbm(q*1.6);
  float kk=clamp((vH-600.0)/560.0+(w-0.5)*0.35,0.0,1.0);
  vec3 col=mix(vec3(0.60,0.79,0.33), vec3(0.83,0.79,0.45), smoothstep(0.3,0.95,kk));
  col*=0.92+0.16*fbm(q*4.0+7.0);
  col=mix(col, vec3(0.99,0.97,0.90), smoothstep(0.64,0.82,fbm(q*6.0+3.0))*0.22);
  // grasstipjes en korte streepjes, zoals met fineliner ingetekend
  vec2 cell=floor(vPos.xz/7.0); vec2 rp=(vec2(hash(cell),hash(cell+3.7))*0.7+0.15)*7.0+cell*7.0;
  float dd=length(vPos.xz-rp); float pxw=fwidth(vPos.x)+fwidth(vPos.z);
  float dotm=(1.0-smoothstep(0.55,0.55+pxw,dd))*step(0.55,hash(cell+9.1))*(1.0-smoothstep(0.6,1.6,pxw));
  col=mix(col, col*vec3(0.55,0.68,0.42), dotm*0.85);
  vec4 ov=texture2D(uMap, vUv);
  col=mix(col, ov.rgb, ov.a);
  col=paint(col, lam, lb.r, lb.g, vPos);
  gl_FragColor=vec4(col,1.0);
}`;
const OBJ_VS=`
attribute vec3 aTint;
varying vec3 vWP; varying vec3 vTint;
void main(){
  #ifdef USE_INSTANCING
    vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);
  #else
    vec4 wp=modelMatrix*vec4(position,1.0);
  #endif
  vWP=wp.xyz; vTint=aTint;
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
const OBJ_FS=`
precision highp float;
varying vec3 vWP; varying vec3 vTint;
${NOISE}
${LIGHTING}
void main(){
  vec3 S=normalize(uS);
  vec3 fn=normalize(cross(dFdx(vWP),dFdy(vWP)));
  if(dot(fn, cameraPosition-vWP)<0.0) fn=-fn;
  float lam=max(dot(fn,S),0.0);
  vec2 uv=vec2(vWP.x/uSize.x+0.5, vWP.z/uSize.y+0.5);
  vec4 lb=texture2D(uLight, lightUV(uv));
  vec3 col=vTint*(0.90+0.18*fn.y);
  col=mix(col, col*1.25+vec3(0.06,0.06,0.0), lam*lb.r*0.45);   // zonnige kant lichter en geler
  col=paint(col, lam, lb.r, mix(lb.g,1.0,0.5), vWP);
  gl_FragColor=vec4(col,1.0);
}`;
/* inktlijnen: randen opzoeken in de diepte van het beeld, met een licht trillende pen */
const INK_VS=`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
const INK_FS=`
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear, uFar, uScale;
varying vec2 vUv;
${NOISE.split("float lineAA")[0]}
float lin(float d){ float z=d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }
void main(){
  vec2 px=1.0/uRes;
  vec2 jit=(vec2(noise(vUv*uRes*0.02), noise(vUv*uRes*0.02+17.0))-0.5)*1.4*px*uScale;
  vec2 uv=vUv+jit;
  float d0=texture2D(tDepth,uv).r, c0=lin(d0);
  float e=0.0;
  float o=uScale*(0.9+0.5*noise(vUv*uRes*0.05));
  for(int i=0;i<4;i++){
    vec2 dd = i==0?vec2(o,0.0):i==1?vec2(-o,0.0):i==2?vec2(0.0,o):vec2(0.0,-o);
    float dn=texture2D(tDepth,uv+dd*px).r;
    float cn=lin(dn);
    float rel=abs(cn-c0)/min(cn,c0);
    e=max(e, rel);
  }
  float ink=smoothstep(0.018,0.05,e);
  vec4 col=texture2D(tColor,vUv);
  float a=max(col.a, ink*0.9);
  vec3 rgb=mix(col.rgb, vec3(0.17,0.13,0.11), ink*0.85);
  gl_FragColor=vec4(rgb*a, a);
}`;

function sharedUniforms(){
  return {
    uLight:{value:lightTex}, uLGrid:{value:new THREE.Vector2(W,H)}, uSize:{value:new THREE.Vector2(SX,SZ)},
    uS:{value:new THREE.Vector3(...SUN)}, uBg:{value:new THREE.Vector3(0.94,0.925,0.89)}
  };
}

function buildTerrain(){
  // rond terrein: ringen rond het middelpunt, zodat de rand een zuivere cirkel is
  const NR=SMALL?130:246, NS=SMALL?640:1024;
  const nv=1+NR*NS;
  const pos=new Float32Array(nv*3), uv=new Float32Array(nv*2), ah=new Float32Array(nv), as=new Float32Array(nv);
  const put=(k,x,z)=>{ const fx=x/SX+0.5, fy=z/SZ+0.5, h=heightAt(fx,fy);
    pos[k*3]=x; pos[k*3+1]=(h-BASE)*EXAG; pos[k*3+2]=z; uv[k*2]=fx; uv[k*2+1]=fy; ah[k]=h; };
  put(0,0,0);
  for(let i=1;i<=NR;i++){ const r=RAD*i/NR; for(let j=0;j<NS;j++){ const a=j/NS*Math.PI*2; put(1+(i-1)*NS+j, r*Math.cos(a), r*Math.sin(a)); } }
  const idx=new Uint32Array(NS*3 + (NR-1)*NS*6); let p=0;
  for(let j=0;j<NS;j++){ idx[p++]=0; idx[p++]=1+(j+1)%NS; idx[p++]=1+j; }
  for(let i=1;i<NR;i++) for(let j=0;j<NS;j++){
    const a=1+(i-1)*NS+j, b=1+(i-1)*NS+(j+1)%NS, c=a+NS, d=b+NS;
    idx[p++]=a; idx[p++]=b; idx[p++]=c; idx[p++]=b; idx[p++]=d; idx[p++]=c;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos,3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv,2));
  g.setAttribute("aH", new THREE.BufferAttribute(ah,1));
  g.setAttribute("aSide", new THREE.BufferAttribute(as,1));
  g.setAttribute("aTop", new THREE.BufferAttribute(ah,1));
  g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeVertexNormals();
  if(g.attributes.normal.array[1]<0){ for(let k=0;k<idx.length;k+=3){ const t=idx[k+1]; idx[k+1]=idx[k+2]; idx[k+2]=t; } g.index.needsUpdate=true; g.computeVertexNormals(); }
  scene.add(new THREE.Mesh(g, terrainMat));

  // sokkel: een ronde wand van gestapeld karton
  const sp=new Float32Array((NS+1)*2*3), sh=new Float32Array((NS+1)*2), ss=new Float32Array((NS+1)*2).fill(1), st=new Float32Array((NS+1)*2);
  for(let j=0;j<=NS;j++){
    const a=j/NS*Math.PI*2, x=RAD*Math.cos(a), z=RAD*Math.sin(a);
    sp.set([x,0,z],j*6); sp.set([x,0,z],j*6+3); const ht=heightAt(x/SX+0.5,z/SZ+0.5); sh[j*2]=ht; sh[j*2+1]=BOTTOM; st[j*2]=ht; st[j*2+1]=ht;
  }
  const si=[]; for(let k=0;k<NS;k++){ const a=k*2,b=a+1,c=a+2,d=a+3; si.push(a,b,c,c,b,d); }
  const sg=new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp,3));
  sg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((NS+1)*4),2));
  sg.setAttribute("aH", new THREE.BufferAttribute(sh,1));
  sg.setAttribute("aSide", new THREE.BufferAttribute(ss,1));
  sg.setAttribute("aTop", new THREE.BufferAttribute(st,1));
  sg.setAttribute("normal", new THREE.BufferAttribute(new Float32Array((NS+1)*6),3));
  sg.setIndex(si);
  const sideMat=terrainMat.clone(); sideMat.uniforms=terrainMat.uniforms; sideMat.side=THREE.DoubleSide;
  scene.add(new THREE.Mesh(sg, sideMat));
}

function buildTable(){
  // zachte ronde schaduw van de maquette op de tafel
  const c=document.createElement("canvas"); c.width=c.height=512; const g=c.getContext("2d");
  const gr=g.createRadialGradient(256,256,120,256,256,256);
  gr.addColorStop(0,"rgba(70,80,130,0.30)"); gr.addColorStop(0.62,"rgba(70,80,130,0.20)"); gr.addColorStop(1,"rgba(70,80,130,0)");
  g.fillStyle=gr; g.fillRect(0,0,512,512);
  const t=new THREE.CanvasTexture(c);
  const geo=new THREE.PlaneGeometry(RAD*2.5, RAD*2.5); geo.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false}));
  const off=(BASE-BOTTOM)*EXAG/TANE*1.2;
  mesh.position.set(-SUNH[0]*off, (BOTTOM-BASE)*EXAG-1, -SUNH[1]*off);
  scene.add(mesh);
}

function objMaterial(instanced){
  return new THREE.ShaderMaterial({ vertexShader:OBJ_VS, fragmentShader:OBJ_FS, uniforms:sharedUniforms(),
    extensions:{derivatives:true}, side: instanced ? THREE.FrontSide : THREE.DoubleSide });
}
function buildTrees(){
  // lollipopboompjes met stammetje, dennen als puntmutsen
  const round=new THREE.IcosahedronGeometry(1,1);
  const cone=new THREE.ConeGeometry(1,1,7); cone.translate(0,0.5,0);
  const trunk=new THREE.CylinderGeometry(0.5,0.65,1,5); trunk.translate(0,0.5,0);
  const roundPal=[[0.36,0.63,0.22],[0.50,0.73,0.24],[0.27,0.52,0.22],[0.62,0.77,0.27],[0.42,0.60,0.19],[0.70,0.74,0.26]];
  const pinePal=[[0.16,0.42,0.29],[0.21,0.49,0.31],[0.19,0.38,0.25]];
  const bushPal=[[0.62,0.74,0.30],[0.52,0.68,0.27],[0.74,0.72,0.33]];
  const rounds=[], pines=[];
  TREES.forEach(p=> (p[3]<0.33 ? pines : rounds).push(p));
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), s=new THREE.Vector3(), v=new THREE.Vector3();
  function make(geo, list, pal, kind){
    const mesh=new THREE.InstancedMesh(geo, objMaterial(true), list.length);
    const tint=new Float32Array(list.length*3);
    list.forEach((p,i)=>{
      const [x,y,z]=toWorld(p[0],p[1]); const r=p[2];
      if(kind==="pine"){ const rad=2.8+r*1.6; s.set(rad, rad*3.6, rad); v.set(x,y-1,z); }
      else if(kind==="bush"){ const rad=1.8+r*1.4; s.set(rad*1.2, rad*0.85, rad*1.2); v.set(x,y+rad*0.4,z); }
      else if(kind==="trunk"){ const rad=4.2+r*2.6; s.set(rad*0.16, 3.2+rad*0.4, rad*0.16); v.set(x,y-1,z); }
      else { const rad=4.2+r*2.6; s.set(rad, rad*1.05, rad); v.set(x,y+2.2+rad*0.4+rad,z); }
      e.set(0, r*6.28, 0); q.setFromEuler(e); m4.compose(v,q,s); mesh.setMatrixAt(i,m4);
      const c=pal[Math.floor(r*977)%pal.length], jit=0.92+((r*7919)%1)*0.16;
      tint.set([c[0]*jit,c[1]*jit,c[2]*jit], i*3);
    });
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint,3));
    mesh.frustumCulled=false; scene.add(mesh);
  }
  make(round, rounds, roundPal, "round");
  make(trunk, rounds, [[0.48,0.31,0.19],[0.42,0.27,0.17]], "trunk");
  make(cone, pines, pinePal, "pine");
  make(new THREE.IcosahedronGeometry(1,0), BUSHES, bushPal, "bush");
}
function buildHouses(){
  const P=[], C=[];
  const push=(a,b,c,col)=>{ P.push(...a,...b,...c); C.push(...col,...col,...col); };
  function house(flat, ruin, opt={}){
    let pts=[]; for(let i=0;i<flat.length;i+=2) pts.push([flat[i],flat[i+1]]);
    if(pts.length>3 && Math.abs(pts[0][0]-pts[pts.length-1][0])<1e-7 && Math.abs(pts[0][1]-pts[pts.length-1][1])<1e-7) pts.pop();
    if(pts.length<3 || !pts.every(([fx,fy])=>inCircle(fx,fy,0.998))) return;
    let g=Infinity; const w=pts.map(([fx,fy])=>{ const yy=yAt(fx,fy); if(yy<g) g=yy; return [(fx-0.5)*SX,(fy-0.5)*SZ]; });
    const base=g-2, top=g+(opt.h||(ruin?3:7.5));
    const wall=ruin?[0.78,0.74,0.70]:(opt.wall||[0.98,0.95,0.86]), roof=ruin?[0.70,0.66,0.62]:(opt.roof||[0.90,0.42,0.22]);
    for(let i=0;i<w.length;i++){
      const a=w[i], b=w[(i+1)%w.length];
      push([a[0],base,a[1]],[b[0],base,b[1]],[b[0],top,b[1]],wall);
      push([a[0],base,a[1]],[b[0],top,b[1]],[a[0],top,a[1]],wall);
    }
    const tri=THREE.ShapeUtils.triangulateShape(w.map(p=>new THREE.Vector2(p[0],p[1])),[]);
    tri.forEach(([a,b,c])=>push([w[a][0],top,w[a][1]],[w[b][0],top,w[b][1]],[w[c][0],top,w[c][1]],roof));
  }
  (V.layers.building||[]).forEach(l=>house(l,false));
  (V.layers.ruin||[]).forEach(l=>house(l,true));
  // de gebouwen van de quinta, naar de satellietfoto
  QUINTA_BUILDINGS.forEach(b=>{
    const [cx,cy]=frac(b.lat,b.lon), a=(b.hoek||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a), out=[];
    [[-b.b/2,-b.d/2],[b.b/2,-b.d/2],[b.b/2,b.d/2],[-b.b/2,b.d/2]].forEach(([x,z])=>{ out.push(cx+(x*c-z*s)/SX, cy+(x*s+z*c)/SZ); });
    house(out,false, b.dak==="grijs" ? {roof:[0.62,0.62,0.66], h:8} : b.open ? {roof:[0.62,0.44,0.28], wall:[0.72,0.55,0.38], h:3.5} : {});
  });
  // dorpshuisjes met een zadeldak
  VILLAGE_HOUSES.forEach(h=>{
    const c=Math.cos(h.ang), s=Math.sin(h.ang);
    const pt=(x,z,y)=>[h.x+x*c-z*s, y, h.z+x*s+z*c];
    let g0=Infinity; [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([i,j])=>{ const q=pt(i*h.w/2,j*h.d/2,0); const yy=yAt(q[0]/SX+0.5,q[2]/SZ+0.5); if(yy<g0) g0=yy; });
    const y0=g0-2, y1=g0+h.h, y2=y1+h.d*0.42, W2=h.w/2, D2=h.d/2;
    const A=pt(-W2,-D2,y0), B=pt(W2,-D2,y0), Cc=pt(W2,D2,y0), Dd=pt(-W2,D2,y0);
    const A1=pt(-W2,-D2,y1), B1=pt(W2,-D2,y1), C1=pt(W2,D2,y1), D1=pt(-W2,D2,y1);
    const R1=pt(-W2,0,y2), R2=pt(W2,0,y2);
    const quad=(p1,p2,p3,p4,col)=>{ push(p1,p2,p3,col); push(p1,p3,p4,col); };
    quad(A,B,B1,A1,h.wall); quad(B,Cc,C1,B1,h.wall); quad(Cc,Dd,D1,C1,h.wall); quad(Dd,A,A1,D1,h.wall);
    push(A1,R1,D1,h.wall); push(B1,C1,R2,h.wall);                 // puntgevels
    quad(A1,B1,R2,R1,h.roof); quad(D1,R1,R2,C1,h.roof);           // dakvlakken
  });
  const g=new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P),3));
  g.setAttribute("aTint", new THREE.BufferAttribute(new Float32Array(C),3));
  scene.add(new THREE.Mesh(g, objMaterial(false)));
}

let inkRT=null, inkScene, inkCam, inkMat;
function setupInk(){
  inkRT=new THREE.WebGLRenderTarget(4,4,{minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat});
  inkRT.depthTexture=new THREE.DepthTexture(4,4); inkRT.depthTexture.type=THREE.UnsignedIntType;
  inkMat=new THREE.ShaderMaterial({ vertexShader:INK_VS, fragmentShader:INK_FS, transparent:true, depthTest:false, depthWrite:false,
    blending:THREE.CustomBlending, blendSrc:THREE.OneFactor, blendDst:THREE.OneMinusSrcAlphaFactor,
    uniforms:{ tColor:{value:inkRT.texture}, tDepth:{value:inkRT.depthTexture}, uRes:{value:new THREE.Vector2(4,4)}, uNear:{value:10}, uFar:{value:80000}, uScale:{value:1} } });
  inkScene=new THREE.Scene(); inkCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  inkScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), inkMat));
}
function sizeInk(){
  const v=new THREE.Vector2(); renderer.getDrawingBufferSize(v);
  const ss = (renderer.getPixelRatio()<1.5 && !SMALL) ? 1.5 : 1;   // bij lage resolutie iets groter tekenen voor gladde lijnen
  inkRT.setSize(Math.round(v.x*ss), Math.round(v.y*ss));
  inkMat.uniforms.uRes.value.set(v.x*ss, v.y*ss);
  inkMat.uniforms.uScale.value=Math.max(1, renderer.getPixelRatio()*ss*0.85);
}
function renderAll(){
  renderer.setRenderTarget(inkRT); renderer.setClearColor(0x000000,0); renderer.clear(); renderer.render(scene,camera);
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(inkScene,inkCam);
}
function buildScene(){
  const canvas=$("#gl");
  renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, SMALL?1.6:2));
  renderer.setClearColor(0x000000,0); renderer.autoClear=false;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(36, 1, 10, 80000);

  lightTex=new THREE.DataTexture(bakeLight(), W, H, THREE.RGBAFormat);
  lightTex.magFilter=THREE.LinearFilter; lightTex.minFilter=THREE.LinearFilter; lightTex.needsUpdate=true;
  paintOverlay();
  tex=new THREE.CanvasTexture(overlay); tex.flipY=false;
  tex.anisotropy=renderer.capabilities.getMaxAnisotropy(); tex.minFilter=THREE.LinearMipmapLinearFilter;

  terrainMat=new THREE.ShaderMaterial({
    vertexShader:TERRAIN_VS, fragmentShader:TERRAIN_FS,
    uniforms:Object.assign(sharedUniforms(), { uMap:{value:tex}, uStep:{value:STEP}, uExag:{value:EXAG}, uBase:{value:BASE} }),
    extensions:{derivatives:true}
  });
  setupInk();
  buildTerrain();
  buildTable();
  buildTrees();
  buildHouses();
}

/* ================= camera ================= */
const cam={ tx:0, ty:0, tz:0, dist:3000, az:Math.PI, pol:0.95 };
let goal=null;
const HOME=(()=>{ const f=[0.5,0.56]; const w=toWorld(f[0],f[1]); return { tx:w[0], ty:Math.max(w[1]-80,250), tz:w[2], dist:SMALL?15500:8600, az:Math.PI+0.12, pol:0.95 }; })();
const INTRO={ tx:0, ty:300, tz:0, dist:SMALL?26000:17000, pol:0.38, az:Math.PI+0.85 };
function applyCam(){
  const sp=Math.sin(cam.pol), cp=Math.cos(cam.pol);
  camera.position.set(cam.tx+cam.dist*sp*Math.sin(cam.az), cam.ty+cam.dist*cp, cam.tz+cam.dist*sp*Math.cos(cam.az));
  camera.lookAt(cam.tx,cam.ty,cam.tz);
  $("#needle").style.transform="rotate("+((Math.PI-cam.az)*180/Math.PI)+"deg)";
}
function clampCam(){
  cam.pol=Math.min(Math.max(cam.pol,0.12),1.30);
  cam.dist=Math.min(Math.max(cam.dist,260),28000);
  const r=Math.hypot(cam.tx,cam.tz); if(r>RAD){ cam.tx*=RAD/r; cam.tz*=RAD/r; }
}
function flyTo(g, ms){
  if(reduced||ms===0||!renderer){ Object.assign(cam,g); goal=null; need(); return; }
  let da=g.az-cam.az; while(da>Math.PI) da-=2*Math.PI; while(da<-Math.PI) da+=2*Math.PI;
  goal={ from:{...cam}, to:{...g, az:cam.az+da}, t0:performance.now(), ms:ms||1400 };
  need();
}
let dirty=true; function need(){ dirty=true; }

/* ================= bronvermelding ================= */
function creditOpen(on){ const c=$("#credit"); if(!c) return; c.classList.toggle("open",on); $("#credit-i").setAttribute("aria-expanded",on?"true":"false"); }
$("#credit-i").addEventListener("click",()=>creditOpen(!$("#credit").classList.contains("open")));

/* ================= invoer ================= */
function setupInput(){
  const el=$("#gl"); const pts=new Map(); let pinch=null;
  el.addEventListener("pointerdown",()=>creditOpen(false),{once:true}); el.addEventListener("wheel",()=>creditOpen(false),{once:true,passive:true});
  el.addEventListener("pointerdown",e=>{ el.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY,b:e.button}); goal=null; el.classList.add("grab"); });
  el.addEventListener("pointermove",e=>{
    if(!pts.has(e.pointerId)){ hoverQueued=e; return; }
    const prev=pts.get(e.pointerId); const dx=e.clientX-prev.x, dy=e.clientY-prev.y;
    prev.x=e.clientX; prev.y=e.clientY;
    if(pts.size===1){
      if(prev.b===2 || e.shiftKey) pan(dx,dy);
      else { cam.az-=dx*0.006; cam.pol-=dy*0.005; }
    } else if(pts.size===2){
      const [a,b]=[...pts.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
      if(pinch){ cam.dist*=pinch.d/d; pan(mx-pinch.mx, my-pinch.my); }
      pinch={d,mx,my};
    }
    clampCam(); need();
  });
  const up=e=>{ pts.delete(e.pointerId); pinch=null; if(!pts.size) el.classList.remove("grab"); };
  el.addEventListener("pointerup",up); el.addEventListener("pointercancel",up);
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("wheel",e=>{ e.preventDefault(); goal=null; cam.dist*=Math.exp(e.deltaY*0.0012); clampCam(); need(); },{passive:false});
  function pan(dx,dy){
    const s=cam.dist*0.0011, ca=Math.cos(cam.az), sa=Math.sin(cam.az);
    cam.tx+=(-dx*ca - dy*sa)*s; cam.tz+=( dx*sa - dy*ca)*s; clampCam();
    cam.ty=yAt(cam.tx/SX+0.5, cam.tz/SZ+0.5)-40;
  }
  addEventListener("keydown",e=>{
    if(e.target.closest && e.target.closest("aside")){ if(e.key==="Escape") closePanel(); return; }
    const k=e.key; let hit=true;
    if(k==="ArrowLeft") cam.az+=0.08; else if(k==="ArrowRight") cam.az-=0.08;
    else if(k==="ArrowUp") cam.pol-=0.05; else if(k==="ArrowDown") cam.pol+=0.05;
    else if(k==="+"||k==="=") cam.dist*=0.88; else if(k==="-") cam.dist*=1.13;
    else if(k==="Escape") closePanel(); else hit=false;
    if(hit){ goal=null; clampCam(); need(); }
  });
}
/* straal door het hoogteveld, voor de hoogte onder de muis en verborgen vlaggetjes */
function terrainHit(o, d, maxT){
  let t=0; const st=Math.max(4, cam.dist/500);
  for(let i=0;i<2000 && t<maxT;i++){
    t+=st; const x=o.x+d.x*t, y=o.y+d.y*t, z=o.z+d.z*t;
    const fx=x/SX+0.5, fy=z/SZ+0.5;
    if(!inCircle(fx,fy)){ if(y<0) return null; continue; }
    if(y<=yAt(fx,fy)) return [fx,fy,t];
  }
  return null;
}
const ray=new THREE.Vector3(), ndc=new THREE.Vector2(); let hoverQueued=null;
function doHover(){
  if(!hoverQueued) return; const e=hoverQueued; hoverQueued=null;
  const r=$("#gl").getBoundingClientRect();
  ndc.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
  ray.set(ndc.x,ndc.y,0.5).unproject(camera).sub(camera.position).normalize();
  const hit=terrainHit(camera.position, ray, 40000), out=$("#readout");
  if(!hit){ out.textContent=""; return; }
  const [lat,lon]=unfrac(hit[0],hit[1]);
  out.textContent=lat.toFixed(4)+"° N   "+Math.abs(lon).toFixed(4)+"° W   "+T().ui.height+" "+Math.round(heightAt(hit[0],hit[1]))+" m";
}

/* ================= labels projecteren ================= */
const tmp=new THREE.Vector3(), dir=new THREE.Vector3();
function placeLabels(){
  const r=$("#gl").getBoundingClientRect();
  const boxes=[];
  const far=cam.dist>6500;
  const on=pins.filter(p=>p.el.classList.contains("on"));
  const order=[...on, ...pins.filter(p=>p.el.classList.contains("main")&&!on.includes(p)), ...pins.filter(p=>!p.el.classList.contains("main")&&!on.includes(p)), ...places];
  order.forEach(p=>{
    tmp.set(p.pos[0],p.pos[1],p.pos[2]).project(camera);
    let vis=tmp.z<1 && Math.abs(tmp.x)<1.05 && Math.abs(tmp.y)<1.05;
    let dim=false;
    if(vis){
      dir.set(p.pos[0],p.pos[1]+4,p.pos[2]).sub(camera.position); const L=dir.length(); dir.normalize();
      if(terrainHit(camera.position, dir, L-30)){ if(p.btn) dim=true; else vis=false; }
    }
    if(!p.btn && far) vis=false;   // plaatsnamen pas tonen als je inzoomt
    const x=(tmp.x*0.5+0.5)*r.width, y=(-tmp.y*0.5+0.5)*r.height;
    if(vis){
      // vlaggetjes die over een ander vlaggetje vallen, worden even kleiner
      if(p.btn && !p.el.classList.contains("mini") && p.btn.offsetWidth>20) p.w=p.btn.offsetWidth;
      const w=p.btn ? (p.w||140) : (p.el.offsetWidth||80), h=p.btn ? 34 : 18;
      const bx= p.btn ? x : x-w/2, by= p.btn ? y-(p.el.classList.contains("main")?52:34)-h : y-h/2;
      const box=[bx-4,by-4,bx+w+4,by+h+4];
      const hit=boxes.some(b=>!(box[2]<b[0]||box[0]>b[2]||box[3]<b[1]||box[1]>b[3]));
      if(hit){ if(p.btn) p.el.classList.add("mini"); else vis=false; }
      else { if(p.btn) p.el.classList.remove("mini"); boxes.push(box); }
    }
    p.el.style.opacity = dim ? 0.45 : "";
    p.el.style.transform="translate("+x.toFixed(1)+"px,"+y.toFixed(1)+"px)"+(p.btn?"":" translate(-50%,-50%)");
    p.el.classList.toggle("off",!vis);
  });
}

/* ================= paneel ================= */
let panelState=null;
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function openPanel(state, silent){
  panelState=state; const c=T(); const P=$("#panel");
  let eyebrow="", title="", sub="", body="";
  if(state.type==="spot"){
    const s=c.spots[state.id], sp=SPOTS.find(x=>x.id===state.id), f=frac(sp.lat,sp.lon);
    eyebrow=sp.lat.toFixed(4)+"° N · "+Math.abs(sp.lon).toFixed(4)+"° W · "+Math.round(heightAt(f[0],f[1]))+" m";
    title=s.name; sub=s.sub; body="";
    if(s.fotos && s.fotos.length) body+='<div class="fotos">'+s.fotos.map((f,k)=>'<figure style="--r:'+(((k*53)%7)-3)*0.7+'deg" data-foto="'+k+'"><img src="'+esc(ROOT+f.src)+'" alt="'+esc(f.tekst)+'" loading="lazy" decoding="async"><figcaption>'+esc(f.tekst)+'</figcaption></figure>').join("")+'</div>';
    body+=s.tekst.map(t=>"<p>"+esc(t)+"</p>").join("");
    if(s.nog_schrijven) body+='<p class="note">'+esc(c.ui.todo)+'</p>';
    const i=SPOTS.findIndex(x=>x.id===state.id), nx=SPOTS[(i+1)%SPOTS.length].id, pv=SPOTS[(i-1+SPOTS.length)%SPOTS.length].id;
    body+='<div class="nav"><button class="btn" type="button" data-go="'+pv+'">← '+esc(c.spots[pv].name)+'</button><button class="btn solid" type="button" data-go="'+nx+'">'+esc(c.spots[nx].name)+' →</button></div>';
    pins.forEach(p=>p.el.classList.toggle("on",p.id===state.id));
  } else {
    eyebrow=c.ui.hint; title=c.ui.places;
    body='<ul class="list">'+SPOTS.map(s=>'<li><button type="button" data-go="'+s.id+'"><span>'+esc(c.spots[s.id].name)+'</span><small>'+esc(c.spots[s.id].sub)+'</small></button></li>').join("")+"</ul>";
  }
  $("#p-eyebrow").textContent=eyebrow; $("#p-title").textContent=title;
  $("#p-sub").textContent=sub; $("#p-sub").hidden=!sub; $("#p-body").innerHTML=body; $("#p-body").scrollTop=0;
  P.classList.add("open"); P.setAttribute("aria-hidden","false");
  if(!silent) setTimeout(()=>$("#p-close").focus({preventScroll:true}), 60);
}
function closePanel(){ if(panelState && panelState.type==="spot") history.replaceState(null,"",location.pathname+location.search); panelState=null; const P=$("#panel"); P.classList.remove("open"); P.setAttribute("aria-hidden","true"); pins.forEach(p=>p.el.classList.remove("on")); }
$("#p-body").addEventListener("click",e=>{ const b=e.target.closest("[data-go]"); if(b) goSpot(b.dataset.go);
  const ft=e.target.closest("[data-foto]"); if(ft && panelState && panelState.type==="spot") openFoto(T().spots[panelState.id].fotos[+ft.dataset.foto]); });
/* foto groot bekijken */
const LB=$("#lightbox");
function openFoto(f){ if(!f||!LB) return; LB.querySelector("img").src=ROOT+f.src; LB.querySelector("img").alt=f.tekst; LB.querySelector("p").textContent=f.tekst; LB.hidden=false; }
if(LB){ LB.addEventListener("click",()=>{ LB.hidden=true; }); addEventListener("keydown",e=>{ if(e.key==="Escape" && !LB.hidden) LB.hidden=true; }); }
$("#p-close").addEventListener("click",closePanel);
$("#b-places").addEventListener("click",()=>openPanel({type:"list"}));
function goSpot(id){
  const p=pins.find(x=>x.id===id); if(!p) return;
  openPanel({type:"spot", id}); history.replaceState(null,"","#"+id);
  if(!renderer) return;
  const mobile=innerWidth<=700, ca=Math.cos(cam.az), sa=Math.sin(cam.az), d=mobile?1500:1000;
  let ox=0, oz=0;
  if(!mobile){ const s=d*0.0011*200; ox=ca*s; oz=-sa*s; }   // plek naar links, weg van het paneel
  else { const s=d*0.0011*150; ox=sa*s; oz=ca*s; }          // plek omhoog, boven het paneel
  flyTo({ tx:p.pos[0]+ox, ty:p.pos[1]-6, tz:p.pos[2]+oz, dist:d, pol:0.9, az:cam.az }, 1600);
}
$("#b-home").addEventListener("click",()=>{ closePanel(); flyTo(HOME,1500); });
$("#b-north").addEventListener("click",()=>flyTo({...cam, az:0, pol:Math.min(cam.pol,0.9)},900));

/* ================= reserve: kaart van bovenaf ================= */
function drawFallback(){
  paintOverlay();
  const c=document.createElement("canvas"); c.width=OW/2; c.height=OH/2; const g=c.getContext("2d");
  const img=g.createImageData(c.width,c.height);
  for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++){
    const fx=x/c.width, fy=y/c.height, e=1/W;
    const s=Math.max(0.45, Math.min(1.12, 0.88+((heightAt(fx+e,fy)-heightAt(fx-e,fy))+(heightAt(fx,fy+e)-heightAt(fx,fy-e)))*0.01));
    const k=(y*c.width+x)*4; img.data[k]=246*s; img.data[k+1]=242*s; img.data[k+2]=232*s; img.data[k+3]=255;
  }
  g.putImageData(img,0,0); g.drawImage(overlay,0,0,c.width,c.height);
  const fb=document.createElement("div"); fb.id="fallback"; $("#stage").prepend(fb);
  const im=new Image(); im.alt=""; fb.appendChild(im);
  const place=()=>{ const r=im.getBoundingClientRect(); [...pins,...places].forEach(p=>{ p.el.style.transform="translate("+(r.left+p.f[0]*r.width)+"px,"+(r.top+p.f[1]*r.height)+"px)"+(p.btn?"":" translate(-50%,-50%)"); }); };
  im.onload=place; addEventListener("resize",place); im.src=c.toDataURL();
}

/* ================= aquarellucht ================= */
function paintSky(){
  const c=$("#sky"), w=innerWidth, h=innerHeight, dpr=Math.min(devicePixelRatio||1,2);
  c.width=w*dpr; c.height=h*dpr; const g=c.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0);
  const gr=g.createLinearGradient(0,0,0,h);
  gr.addColorStop(0,"#9fcdec"); gr.addColorStop(0.45,"#d3eaf3"); gr.addColorStop(0.8,"#f7efd6"); gr.addColorStop(1,"#f3e3c3");
  g.fillStyle=gr; g.fillRect(0,0,w,h);
  seed=41;
  // roze en lila wolkjes: platte lagen natte verf met een donkerder droogrand
  const clouds=[[0.70,0.15,1.0,"240,170,204"],[0.90,0.30,0.75,"196,176,232"],[0.10,0.50,0.9,"242,182,212"],[0.33,0.08,0.6,"210,190,238"],[0.97,0.60,0.7,"244,190,212"],[0.52,0.04,0.45,"236,186,220"]];
  clouds.forEach(([cx,cy,sc,rgb])=>{
    const X=cx*w, Y=cy*h, S=Math.min(w,h)*0.11*sc;
    const blobs=[]; for(let k=0;k<9;k++) blobs.push([X+(rnd()-0.5)*S*3.4, Y+(rnd()-0.3)*S*0.7, S*(0.32+rnd()*0.5)]);
    for(let pass=0;pass<3;pass++){
      g.save(); g.translate((rnd()-0.5)*S*0.25,(rnd()-0.5)*S*0.15);
      g.beginPath(); blobs.forEach(([x,y,r])=>{ g.moveTo(x+r,y); g.arc(x,y,r*(0.9+pass*0.06),0,Math.PI*2); });
      g.fillStyle="rgba("+rgb+","+(pass?0.16:0.28)+")"; g.fill();
      g.restore();
    }
    // lichte bovenkant
    g.beginPath(); blobs.forEach(([x,y,r])=>{ g.moveTo(x+r*0.6,y-r*0.3); g.arc(x,y-r*0.3,r*0.6,0,Math.PI*2); });
    g.fillStyle="rgba(255,250,252,0.22)"; g.fill();
  });
  // gouden sterretjes
  g.fillStyle="#efc04a"; g.strokeStyle="rgba(150,110,30,.6)"; g.lineWidth=0.8;
  for(let k=0;k<16;k++){
    const x=rnd()*w, y=rnd()*h*0.42, r=3+rnd()*6;
    g.beginPath();
    for(let a=0;a<8;a++){ const ang=a*Math.PI/4, rr=a%2?r*0.32:r; g.lineTo(x+Math.cos(ang)*rr, y+Math.sin(ang)*rr); }
    g.closePath(); g.fill(); g.stroke();
  }
}

/* ================= start ================= */
function resize(){ if(!renderer) return; renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); sizeInk(); paintSky(); need(); }
const ease=t=>t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
function frame(now){
  requestAnimationFrame(frame);
  if(goal){
    const t=Math.min((now-goal.t0)/goal.ms,1), e=ease(t);
    for(const k of ["tx","ty","tz","dist","az","pol"]) cam[k]=goal.from[k]+(goal.to[k]-goal.from[k])*e;
    if(t>=1) goal=null; dirty=true;
  }
  doHover();
  if(!dirty) return; dirty=false;
  applyCam(); renderAll(); placeLabels();
}
function start(){
  applyText();
  if(window.THREE && webglOK()){
    try{
      placeTrees(); buildScene(); setupInput(); resize(); addEventListener("resize",resize);
      Object.assign(cam, reduced?HOME:INTRO);
      requestAnimationFrame(frame);
      const deep=location.hash.slice(1);
      if(pins.some(p=>p.id===deep)) setTimeout(()=>goSpot(deep), 600);
      else if(!reduced) setTimeout(()=>flyTo(HOME, 3400), 500);
    }catch(err){ console.error(err); renderer=null; }
  }
  if(!renderer){ paintSky(); $("#gl").hidden=true; document.body.classList.add("nogl"); if(!TREES.length) placeTrees(); drawFallback(); $("#t-sub").textContent=T().ui.nogl; }
  const L=$("#loading"); L.style.opacity=0; setTimeout(()=>L.remove(),900); setTimeout(()=>creditOpen(false),5000);
}
// eerst de laadmelding tekenen, dan pas het zware rekenwerk
applyText();
requestAnimationFrame(()=>setTimeout(start, 30));
})();

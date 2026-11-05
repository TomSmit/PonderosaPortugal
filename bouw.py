#!/usr/bin/env python3
"""
Bouwt de website van Ponderosa Portugal.

Teksten staan in de map inhoud/, foto's in fotos/ en de vaste onderdelen
(kaart, opmaak) in static/. Dit script zet alles om naar gewone HTML in de
map _site/. Op GitHub gebeurt dat automatisch bij elke wijziging; je hoeft
het zelf niet te draaien.

Lokaal proberen:  python bouw.py   (nodig: pip install pyyaml markdown)
"""
import html, json, os, re, shutil, sys
import yaml, markdown

HIER = os.path.dirname(os.path.abspath(__file__))
UIT = os.path.join(HIER, "_site")
TALEN = ["nl", "pt", "en"]
VOORVOEGSEL = {"nl": "", "pt": "pt/", "en": "en/"}
LOCALE = {"nl": "nl_NL", "pt": "pt_PT", "en": "en_GB"}
TAALNAAM = {"nl": "Taal", "pt": "Língua", "en": "Language"}
OVERSLAAN = {"nl": "Naar de inhoud", "pt": "Ir para o conteúdo", "en": "Skip to content"}
NIET_GEVONDEN = {"nl": ("Deze pagina bestaat niet", "Misschien is hij verhuisd. Op de kaart vind je alles terug."),
                 "pt": ("Esta página não existe", "Talvez tenha mudado de sítio. No mapa encontras tudo."),
                 "en": ("This page does not exist", "Perhaps it has moved. You can find everything on the map.")}
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Almendra:ital,wght@0,400;0,700;1,400'
         '&family=Patrick+Hand&family=Andika:ital,wght@0,400;0,700;1,400&display=swap">')

e = lambda s: html.escape(str(s), quote=True)
waarschuwingen = []


def lees_yaml(pad):
    with open(pad, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def lees_pagina(pad):
    with open(pad, encoding="utf-8") as f:
        tekst = f.read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", tekst, re.S)
    if not m:
        sys.exit(f"Bovenstuk (tussen de --- regels) ontbreekt in {pad}")
    kop = yaml.safe_load(m.group(1)) or {}
    kop["_tekst"] = m.group(2)
    kop["_bestand"] = os.path.relpath(pad, HIER)
    return kop


def md(tekst):
    h = markdown.markdown(tekst, extensions=["sane_lists"])
    # In een citaat is de laatste regel de bron: "Albert Camus"
    def bron(m):
        delen = re.findall(r"<p>.*?</p>", m.group(1), re.S)
        if len(delen) < 2:
            return m.group(0)
        laatste = delen[-1].replace("<p>", '<p class="bron">', 1)
        return "<blockquote>\n" + "\n".join(delen[:-1] + [laatste]) + "\n</blockquote>"
    return re.sub(r"<blockquote>\s*(.*?)\s*</blockquote>", bron, h, flags=re.S)


def schrijf(rel, inhoud):
    pad = os.path.join(UIT, rel)
    os.makedirs(os.path.dirname(pad), exist_ok=True)
    with open(pad, "w", encoding="utf-8") as f:
        f.write(inhoud)


def naar_root(rel_map):
    diepte = len([d for d in rel_map.split("/") if d])
    return "../" * diepte


# ---------------------------------------------------------------- inlezen
inst = lees_yaml(os.path.join(HIER, "instellingen.yml"))
ADRES = inst.get("adres", "").rstrip("/")
LIVE = bool(inst.get("live", False))
punten = lees_yaml(os.path.join(HIER, "inhoud", "plekken.yml"))

T = {}
for L in TALEN:
    d = os.path.join(HIER, "inhoud", L)
    paginas = [lees_pagina(os.path.join(d, "paginas", f)) for f in os.listdir(os.path.join(d, "paginas")) if f.endswith(".md")]
    paginas.sort(key=lambda p: p.get("volgorde", 99))
    T[L] = {"algemeen": lees_yaml(os.path.join(d, "algemeen.yml")),
            "kaart": lees_yaml(os.path.join(d, "kaart.yml")),
            "plekken": lees_yaml(os.path.join(d, "plekken.yml")),
            "paginas": paginas}

def pagina_map(L, p=None):
    return VOORVOEGSEL[L] + (p["adres"].strip("/") + "/" if p else "")

def zoek(L, pid):
    for p in T[L]["paginas"]:
        if p.get("pagina") == pid:
            return p
    return None


# ---------------------------------------------------------------- stukjes
def kop(L, titel, beschrijving, rel_map, varianten, extra=""):
    root = naar_root(rel_map)
    regels = [
        "<!doctype html>", f'<html lang="{L}">', "<head>", '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
        f"<title>{e(titel)}</title>", f'<meta name="description" content="{e(beschrijving)}">',
    ]
    if not LIVE:
        regels.append('<meta name="robots" content="noindex,nofollow">')
    if ADRES:
        regels.append(f'<link rel="canonical" href="{e(ADRES + "/" + rel_map)}">')
        for t, m in varianten.items():
            regels.append(f'<link rel="alternate" hreflang="{t}" href="{e(ADRES + "/" + m)}">')
        if "nl" in varianten:
            regels.append(f'<link rel="alternate" hreflang="x-default" href="{e(ADRES + "/" + varianten["nl"])}">')
    regels += [
        f'<meta property="og:title" content="{e(titel)}">',
        f'<meta property="og:description" content="{e(beschrijving)}">',
        '<meta property="og:type" content="website">', f'<meta property="og:locale" content="{LOCALE[L]}">',
        '<meta property="og:site_name" content="Ponderosa Portugal">',
        '<meta name="theme-color" content="#fbf6e9">',
        f'<link rel="icon" href="{root}assets/icoon.svg" type="image/svg+xml">',
        FONTS, f'<link rel="stylesheet" href="{root}assets/stijl.css">', extra, "</head>",
    ]
    return "\n".join(r for r in regels if r)


def taalknoppen(L, varianten, rel_map):
    root = naar_root(rel_map)
    knoppen = "".join(
        f'<a href="{root}{varianten[t]}" hreflang="{t}" lang="{t}" aria-current="{"true" if t == L else "false"}">{t.upper()}</a>'
        for t in TALEN if t in varianten)
    return f'<nav class="seg" aria-label="{TAALNAAM[L]}">{knoppen}</nav>'


# ---------------------------------------------------------------- kaart
def bouw_kaart(L):
    K, A = T[L]["kaart"], T[L]["algemeen"]
    rel = pagina_map(L)
    root = naar_root(rel)
    varianten = {t: pagina_map(t) for t in TALEN}
    eerste = T[L]["paginas"][0]
    plekken = {}
    for pt in punten:
        tekst = T[L]["plekken"].get(pt["id"])
        if not tekst:
            waarschuwingen.append(f"inhoud/{L}/plekken.yml: geen tekst voor plek '{pt['id']}'")
            tekst = {"naam": pt["id"], "onder": "", "tekst": []}
        fotos = []
        for f in pt.get("fotos") or []:
            bestand = f.get("bestand", "")
            if not os.path.exists(os.path.join(HIER, "fotos", bestand)):
                waarschuwingen.append(f"inhoud/plekken.yml: foto fotos/{bestand} bestaat niet")
                continue
            fotos.append({"src": "fotos/" + bestand, "tekst": f.get(L) or f.get("nl") or ""})
        plekken[pt["id"]] = {"name": tekst.get("naam", ""), "sub": tekst.get("onder", ""),
                             "tekst": tekst.get("tekst") or [], "nog_schrijven": bool(tekst.get("nog_schrijven")),
                             "fotos": fotos}
    data = {"titel": K["titel"], "ondertitel": K["ondertitel"], "teksten": K["teksten"],
            "plaatsnamen": K["plaatsnamen"], "plekken": plekken}
    teksten = K["teksten"]
    kopstuk = kop(L, "Ponderosa Portugal · " + K["titel"] if K["titel"] != "Ponderosa Portugal" else "Ponderosa Portugal",
                  K["ondertitel"], rel, varianten)
    lichaam = f'''<body class="kaart">
<div id="stage">
  <canvas id="sky" aria-hidden="true"></canvas>
  <canvas id="gl" role="img" aria-label="{e(K.get("kaartlabel", K["titel"]))}"></canvas>
  <div id="grain"></div>
  <div id="labels"></div>
</div>
<div id="loading"><div id="loading-t">{e(teksten.get("loading", ""))}</div></div>

<header class="top">
  <p class="kicker">Quinta Dionisio · Trinta</p>
  <h1 id="t-title">{e(K["titel"])}</h1>
  <p class="sub" id="t-sub">{e(K["ondertitel"])}</p>
  <div class="row">
    <a class="btn solid" id="b-traject" href="{root}{pagina_map(L, eerste)}">{e(K["knop"])}</a>
    <button class="btn" id="b-places" type="button">{e(teksten.get("places", ""))}</button>
  </div>
</header>

<div class="dock">
  <div class="controls">
    {taalknoppen(L, varianten, rel)}
    <button class="compass" id="b-north" type="button" aria-label="{e(teksten.get("north", ""))}">
      <svg viewBox="0 0 30 30" id="needle" aria-hidden="true"><path d="M15 2.5 L19.5 15 L15 13 L10.5 15 Z" fill="var(--flame)" stroke="var(--ink)" stroke-width="1.2" stroke-linejoin="round"/><path d="M15 27.5 L10.5 15 L15 17 L19.5 15 Z" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.2" stroke-linejoin="round"/></svg>
    </button>
    <button class="btn" id="b-home" type="button">{e(teksten.get("home", ""))}</button>
  </div>
  <div class="meta">
    <div class="readout" id="readout" aria-live="off"></div>
    <div class="credit open" id="credit"><span class="credit-text" id="credit-text"></span><button type="button" class="credit-i" id="credit-i" aria-expanded="true" aria-controls="credit-text">i</button></div>
  </div>
</div>

<aside class="panel" id="panel" aria-hidden="true" aria-labelledby="p-title">
  <div class="swatch" aria-hidden="true"></div>
  <div class="head">
    <div>
      <div class="eyebrow" id="p-eyebrow"></div>
      <h2 id="p-title"></h2>
      <p class="sub" id="p-sub"></p>
    </div>
    <button class="close" id="p-close" type="button" aria-label="{e(teksten.get("close", ""))}">×</button>
  </div>
  <div class="body" id="p-body"></div>
</aside>
<div id="lightbox" hidden><img alt=""><p></p></div>

<script>window.ROOT={json.dumps(root)};window.KAART={json.dumps(data, ensure_ascii=False)};window.PUNTEN={json.dumps(punten, ensure_ascii=False)};</script>
<script src="{root}assets/three.min.js"></script>
<script src="{root}assets/vallei-data.js"></script>
<script src="{root}assets/kaart.js"></script>
</body>
</html>
'''
    schrijf(rel + "index.html", kopstuk + "\n" + lichaam)
    return rel


# ---------------------------------------------------------------- pagina's
def contactkaart(A):
    C = A["contact"]
    tel = re.sub(r"[^\d+]", "", C["telefoon"])
    return (f'<div class="card"><dl>'
            f'<dt>{e(C["bellen"])}</dt><dd><a href="tel:{tel}">{e(C["telefoon"])}</a></dd>'
            f'<dt>{e(C["email"])}</dt><dd><a href="mailto:{e(C["info"])}">{e(C["info"])}</a> ({e(C["info_uitleg"])})<br>'
            f'<a href="mailto:{e(C["aanmelden"])}">{e(C["aanmelden"])}</a> ({e(C["aanmelden_uitleg"])})</dd>'
            f'<dt>{e(C["zomergroep"])}</dt><dd>{e(C["zomergroep_tekst"])}</dd></dl></div>')


def formulier(A):
    F = A["formulier"]
    rollen = "".join(f"<option>{e(r)}</option>" for r in F["rollen"])
    return (f'<h2>{e(F["titel"])}</h2><form id="apply-form" novalidate>'
            f'<label for="f-name">{e(F["naam"])}<input id="f-name" name="name" autocomplete="name" required></label>'
            f'<label for="f-role">{e(F["rol"])}<select id="f-role" name="role">{rollen}</select></label>'
            f'<div class="row2"><label for="f-email">{e(F["email"])}<input id="f-email" name="email" type="email" autocomplete="email" required></label>'
            f'<label for="f-phone">{e(F["telefoon"])}<input id="f-phone" name="phone" type="tel" autocomplete="tel"></label></div>'
            f'<div class="row2"><label for="f-gemeente">{e(F["gemeente"])}<input id="f-gemeente" name="gemeente"></label>'
            f'<label for="f-age">{e(F["leeftijd"])}<input id="f-age" name="age" inputmode="numeric"></label></div>'
            f'<label for="f-why">{e(F["waarom"])}<textarea id="f-why" name="why" rows="5"></textarea></label>'
            f'<p class="formnote">{e(F["privacy"])}</p>'
            f'<div><button class="btn solid" type="submit">{e(F["versturen"])}</button></div>'
            f'<div id="f-sent" hidden class="sent" role="status"></div></form>'
            f'<script>document.getElementById("apply-form").addEventListener("submit",function(ev){{ev.preventDefault();'
            f'var m=document.getElementById("f-sent");m.textContent={json.dumps(F["verstuurd"], ensure_ascii=False)};m.hidden=false;}});</script>')


def bouw_pagina(L, p):
    A = T[L]["algemeen"]
    rel = pagina_map(L, p)
    root = naar_root(rel)
    varianten = {}
    for t in TALEN:
        q = zoek(t, p.get("pagina"))
        varianten[t] = pagina_map(t, q) if q else pagina_map(t)
    huidig = ' aria-current="page"'
    tabs = "".join(
        f'<a href="{root}{pagina_map(L, q)}"{huidig if q is p else ""}>{e(q["menu"])}</a>'
        for q in T[L]["paginas"])
    stukken = []
    if p.get("feiten"):
        stukken.append('<dl class="facts">' + "".join(f"<dt>{e(f['wat'])}</dt><dd>{e(f['waarde'])}</dd>" for f in p["feiten"]) + "</dl>")
    if p["_tekst"].strip():
        stukken.append(md(p["_tekst"]))
    if p.get("vragen"):
        stukken.append('<div class="qa">' + "".join(f"<div><h3>{e(v['vraag'])}</h3><p>{e(v['antwoord'])}</p></div>" for v in p["vragen"]) + "</div>")
    if p.get("contactgegevens"):
        stukken.append(contactkaart(A))
    if p.get("aanmeldformulier"):
        stukken.append(formulier(A))
    lijst = T[L]["paginas"]
    volgende = lijst[(lijst.index(p) + 1) % len(lijst)]
    kopstuk = kop(L, f'{p["titel"]} · Ponderosa Portugal', p.get("intro", "")[:300], rel, varianten)
    lichaam = f'''<body class="pagina">
<a class="skip" href="#inhoud">{OVERSLAAN[L]}</a>
<div id="page">
  <div class="pg-bar">
    <a class="pg-brand" href="{root}{pagina_map(L)}">Ponderosa Portugal</a>
    <nav class="pg-tabs" aria-label="{e(A.get("menu", "Menu"))}">{tabs}</nav>
    <div class="pg-tools">
      {taalknoppen(L, varianten, rel)}
      <a class="btn solid" href="{root}{pagina_map(L)}">{e(A["naar_kaart"])}</a>
    </div>
  </div>
  <main class="pg" id="inhoud">
    <p class="kicker">{e(p.get("boventitel", ""))}</p>
    <h1>{e(p["titel"])}</h1>
    <p class="intro">{e(p.get("intro", ""))}</p>
    {"".join(stukken)}
    <div class="next"><span>{e(A["lees_verder"])}</span><a class="btn solid" href="{root}{pagina_map(L, volgende)}">{e(volgende["titel"])} →</a></div>
  </main>
</div>
</body>
</html>
'''
    schrijf(rel + "index.html", kopstuk + "\n" + lichaam)
    return rel


def bouw_404():
    L = "nl"
    titel, uitleg = NIET_GEVONDEN[L]
    regels = []
    for t in TALEN:
        tt, uu = NIET_GEVONDEN[t]
        regels.append(f'<p lang="{t}"><strong>{e(tt)}.</strong> {e(uu)} <a href="/{VOORVOEGSEL[t]}">{e(T[t]["algemeen"]["naar_kaart"])}</a></p>')
    schrijf("404.html", kop(L, titel, uitleg, "", {}).replace(f'<link rel="canonical" href="{ADRES}/">', "") +
            '\n<body class="pagina"><div id="page"><main class="pg"><h1>' + e(titel) + "</h1>" + "".join(regels) + "</main></div></body></html>\n")


# ---------------------------------------------------------------- alles
if os.path.isdir(UIT):
    shutil.rmtree(UIT)
os.makedirs(UIT)
shutil.copytree(os.path.join(HIER, "static"), os.path.join(UIT, "assets"))
if os.path.isdir(os.path.join(HIER, "fotos")):
    shutil.copytree(os.path.join(HIER, "fotos"), os.path.join(UIT, "fotos"),
                    ignore=shutil.ignore_patterns("LEESMIJ*", ".*"))

alle = []
for L in TALEN:
    alle.append(("kaart", L, bouw_kaart(L)))
    for p in T[L]["paginas"]:
        for veld in ["pagina", "adres", "menu", "titel"]:
            if not p.get(veld):
                sys.exit(f'{p["_bestand"]}: het veld "{veld}" ontbreekt bovenin')
        alle.append((p["pagina"], L, bouw_pagina(L, p)))
bouw_404()

# sitemap en robots
if ADRES:
    regels = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for pid, L, rel in alle:
        regels.append(f"<url><loc>{e(ADRES + '/' + rel)}</loc>")
        for pid2, L2, rel2 in alle:
            if pid2 == pid:
                regels.append(f'<xhtml:link rel="alternate" hreflang="{L2}" href="{e(ADRES + "/" + rel2)}"/>')
        regels.append("</url>")
    regels.append("</urlset>")
    schrijf("sitemap.xml", "\n".join(regels) + "\n")
schrijf("robots.txt", ("User-agent: *\nAllow: /\n" + (f"Sitemap: {ADRES}/sitemap.xml\n" if ADRES else ""))
        if LIVE else "User-agent: *\nDisallow: /\n")
if inst.get("domein") and LIVE:
    schrijf("CNAME", inst["domein"].strip() + "\n")
schrijf(".nojekyll", "")

print(f"Klaar: {len(alle)} pagina's in _site/")
for w in dict.fromkeys(waarschuwingen):
    print("Let op:", w)

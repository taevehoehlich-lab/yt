#!/usr/bin/env python3
"""Analysiert das heutige Fernsehprogramm und erzeugt eine interaktive HTML-Seite.

Datenquelle: XMLTV (URL oder Datei, .xml oder .xml.gz).
Anreicherung (optional): Erscheinungsjahr und Bewertung über TMDB oder OMDb.

    python3 tvprogramm.py --demo --open            # Demo-Daten, ohne Netzwerk
    python3 tvprogramm.py --open                   # Live-Daten (Standard-XMLTV-Quelle)
    TMDB_API_KEY=... python3 tvprogramm.py --open  # mit Bewertungen
"""
import argparse
import datetime as dt
import gzip
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_XMLTV = "https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz"
CACHE_FILE = os.path.join(HERE, ".bewertungs_cache.json")

DEFAULT_CHANNELS = [
    "Das Erste", "ZDF", "RTL", "SAT.1", "ProSieben", "RTL Zwei", "VOX", "kabel eins",
    "ARTE", "3sat", "ZDFneo", "ONE", "phoenix", "KiKA", "SPORT1", "DMAX", "NITRO",
    "sixx", "WELT", "tagesschau24",
]

# Reihenfolge = Priorität. Schlüsselwörter deutsch und englisch (XMLTV-Quellen mischen beides).
CATEGORIES = [
    ("Kinder", ["kinder", "children", "kids", "zeichentrick", "cartoon", "animation"]),
    ("Nachrichten", ["nachricht", "news", "magazin", "politik", "current affairs", "wetter", "weather"]),
    ("Sport", ["sport", "fußball", "fussball", "football", "bundesliga", "formel 1", "tennis"]),
    ("Film", ["film", "movie", "spielfilm", "kino", "thriller", "krimi film", "horror", "western", "komödie", "comedy film"]),
    ("Serie", ["serie", "series", "soap", "telenovela", "sitcom", "episode"]),
    ("Doku", ["dokumentation", "doku", "documentary", "reportage", "natur", "wissen", "history", "geschichte", "science", "reise"]),
    ("Unterhaltung", ["show", "unterhaltung", "entertainment", "talk", "quiz", "game", "reality", "musik", "music", "comedy", "casting"]),
]
CAT_ORDER = [c for c, _ in CATEGORIES] + ["Sonstiges"]


# ----------------------------------------------------------------- Laden

def read_source(src):
    if re.match(r"^https?://", src):
        req = urllib.request.Request(src, headers={"User-Agent": "tvprogramm/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
    else:
        with open(src, "rb") as f:
            raw = f.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return raw


def parse_time(s):
    s = s.strip()
    if " " in s:
        return dt.datetime.strptime(s, "%Y%m%d%H%M%S %z")
    return dt.datetime.strptime(s[:14], "%Y%m%d%H%M%S").astimezone()  # ohne Zone: Ortszeit


def norm(name):
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("ß", "ss"))


def load_xmltv(src, wanted, day_start, day_end, all_channels):
    root = ET.fromstring(read_source(src))
    names = {}
    for ch in root.findall("channel"):
        dn = [d.text.strip() for d in ch.findall("display-name") if d.text]
        if dn:
            names[ch.get("id")] = dn

    if all_channels:
        chosen = {cid: dn[0] for cid, dn in names.items()}
    else:
        chosen = {}
        for w in wanted:
            nw = norm(w)
            for cid, dn in names.items():
                if cid in chosen.values():
                    continue
                if any(norm(d) == nw or norm(d).startswith(nw + "hd") or norm(cid).startswith(nw) for d in dn):
                    chosen[cid] = w
                    break

    progs = []
    for p in root.findall("programme"):
        cid = p.get("channel")
        if cid not in chosen:
            continue
        try:
            start, stop = parse_time(p.get("start")), parse_time(p.get("stop") or p.get("start"))
        except (ValueError, TypeError):
            continue
        if stop <= day_start or start >= day_end or stop <= start:
            continue
        txt = lambda tag: next((e.text.strip() for e in p.findall(tag) if e.text), "")
        year = None
        m = re.search(r"(19|20)\d{2}", txt("date"))
        if m:
            year = int(m.group(0))
        progs.append({
            "channel": chosen[cid],
            "title": txt("title"),
            "sub": txt("sub-title"),
            "start": int(start.timestamp() * 1000),
            "stop": int(stop.timestamp() * 1000),
            "rawcat": ", ".join(e.text.strip() for e in p.findall("category") if e.text),
            "desc": txt("desc"),
            "year": year,
            "episode": bool(p.find("episode-num") is not None),
        })
    return progs


# ----------------------------------------------------------------- Analyse

def categorize(p):
    minutes = (p["stop"] - p["start"]) / 60000
    hay = (p["rawcat"] + " " + p["title"]).lower()
    for cat, words in CATEGORIES:
        if any(w in hay for w in words):
            # "Magazin" in Titeln ist meist Unterhaltung/Doku, nicht Nachrichten
            return cat
    if p["year"] and minutes >= 70:
        return "Film"
    if p["episode"]:
        return "Serie"
    return "Sonstiges"


def load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "tvprogramm/1.0"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)


def lookup_tmdb(key, title, year, kind):
    ep = "movie" if kind == "Film" else "tv"
    q = {"api_key": key, "query": title, "language": "de-DE"}
    if year:
        q["year" if ep == "movie" else "first_air_date_year"] = year
    res = http_json(f"https://api.themoviedb.org/3/search/{ep}?" + urllib.parse.urlencode(q)).get("results") or []
    if not res:
        return None
    r = res[0]
    date = r.get("release_date") or r.get("first_air_date") or ""
    return {"year": int(date[:4]) if date[:4].isdigit() else None,
            "rating": round(r.get("vote_average", 0), 1) or None,
            "votes": r.get("vote_count"), "source": "TMDB"}


def lookup_omdb(key, title, year, kind):
    q = {"apikey": key, "t": title, "type": "movie" if kind == "Film" else "series"}
    if year:
        q["y"] = year
    r = http_json("https://www.omdbapi.com/?" + urllib.parse.urlencode(q))
    if r.get("Response") != "True":
        return None
    y = re.match(r"\d{4}", r.get("Year", ""))
    try:
        rating = float(r["imdbRating"])
    except (KeyError, ValueError):
        rating = None
    return {"year": int(y.group(0)) if y else None, "rating": rating,
            "votes": int(r["imdbVotes"].replace(",", "")) if r.get("imdbVotes", "N/A") != "N/A" else None,
            "source": "IMDb"}


def enrich(progs):
    tmdb, omdb = os.environ.get("TMDB_API_KEY"), os.environ.get("OMDB_API_KEY")
    if not (tmdb or omdb):
        print("Hinweis: Ohne TMDB_API_KEY / OMDB_API_KEY gibt es keine Bewertungen "
              "(Erscheinungsjahr nur, wenn die Programmdaten es enthalten).", file=sys.stderr)
        return
    cache = load_cache()
    todo = {(p["title"], p["year"], p["cat"]) for p in progs if p["cat"] in ("Film", "Serie") and p["title"]}
    for i, (title, year, cat) in enumerate(sorted(todo, key=str), 1):
        k = f"{cat}|{title}|{year}"
        if k not in cache:
            try:
                cache[k] = (lookup_tmdb(tmdb, title, year, cat) if tmdb else lookup_omdb(omdb, title, year, cat))
            except Exception as e:  # Netzwerk-/Quota-Fehler dürfen den Lauf nicht abbrechen
                print(f"  Lookup fehlgeschlagen für '{title}': {e}", file=sys.stderr)
                continue
        print(f"\rBewertungen: {i}/{len(todo)}", end="", file=sys.stderr)
    print(file=sys.stderr)
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
    except OSError:
        pass
    for p in progs:
        info = cache.get(f"{p['cat']}|{p['title']}|{p['year']}")
        if info:
            p["year"] = p["year"] or info["year"]
            p["rating"], p["votes"], p["rating_src"] = info["rating"], info["votes"], info["source"]


# ----------------------------------------------------------------- Demo

def demo_programmes(day_start):
    base = day_start.replace(hour=0, minute=0, second=0, microsecond=0)

    def t(h, m=0):
        return int((base + dt.timedelta(hours=h, minutes=m)).timestamp() * 1000)

    # (Sender, Start-h, Start-min, Ende-h, Ende-min, Titel, Untertitel, Kategorie, Jahr, Bewertung, Stimmen)
    rows = [
        ("Das Erste", 0, 0, 5, 30, "Nachtprogramm", "", "Sonstiges", None, None, None),
        ("Das Erste", 5, 30, 9, 0, "Morgenmagazin", "", "Nachrichten", None, None, None),
        ("Das Erste", 9, 0, 12, 0, "Live nach Neun", "", "Unterhaltung", None, None, None),
        ("Das Erste", 12, 0, 15, 0, "Rote Rosen", "Folge 3921", "Serie", 2006, 6.4, 210),
        ("Das Erste", 15, 0, 18, 0, "Sportschau", "Bundesliga live", "Sport", None, None, None),
        ("Das Erste", 18, 0, 20, 0, "Tagesschau & Wetter", "", "Nachrichten", None, None, None),
        ("Das Erste", 20, 15, 22, 0, "Der Pass", "Thriller", "Serie", 2019, 7.8, 5200),
        ("Das Erste", 22, 0, 23, 45, "Tagesthemen", "", "Nachrichten", None, None, None),
        ("ZDF", 6, 0, 10, 0, "Volle Kanne", "", "Unterhaltung", None, None, None),
        ("ZDF", 10, 0, 14, 0, "Die Rosenheim-Cops", "Wiederholung", "Serie", 2002, 6.9, 480),
        ("ZDF", 14, 0, 17, 0, "Terra X", "Die Alpen", "Doku", 2023, 7.6, 320),
        ("ZDF", 17, 0, 20, 15, "heute / Wetter", "", "Nachrichten", None, None, None),
        ("ZDF", 20, 15, 22, 0, "Der Bergdoktor", "Familienbande", "Serie", 2008, 7.1, 1900),
        ("ZDF", 22, 0, 23, 59, "Das Boot", "Kriegsfilm", "Film", 1981, 8.4, 255000),
        ("RTL", 6, 0, 12, 0, "Frühstücksfernsehen", "", "Unterhaltung", None, None, None),
        ("RTL", 12, 0, 16, 0, "Die Superhändler", "", "Unterhaltung", None, None, None),
        ("RTL", 16, 0, 19, 0, "Gute Zeiten, schlechte Zeiten", "", "Serie", 1992, 5.8, 900),
        ("RTL", 19, 0, 20, 15, "RTL Aktuell", "", "Nachrichten", None, None, None),
        ("RTL", 20, 15, 23, 0, "Gladiator", "Historienfilm", "Film", 2000, 8.5, 1520000),
        ("RTL", 23, 0, 23, 59, "Nachtjournal", "", "Nachrichten", None, None, None),
        ("SAT.1", 6, 0, 12, 0, "Sat.1 Frühstücksfernsehen", "", "Unterhaltung", None, None, None),
        ("SAT.1", 12, 0, 17, 0, "Auf Streife", "", "Serie", 2008, 5.2, 120),
        ("SAT.1", 17, 0, 20, 15, "Newstime / Das Sat.1 Magazin", "", "Nachrichten", None, None, None),
        ("SAT.1", 20, 15, 22, 40, "Fack ju Göhte", "Komödie", "Film", 2013, 7.0, 130000),
        ("SAT.1", 22, 40, 23, 59, "Genial daneben", "Comedy-Quiz", "Unterhaltung", None, None, None),
        ("ProSieben", 8, 0, 14, 0, "The Big Bang Theory", "Sitcom-Marathon", "Serie", 2007, 8.2, 880000),
        ("ProSieben", 14, 0, 18, 0, "Galileo", "Wissen", "Doku", None, None, None),
        ("ProSieben", 18, 0, 20, 15, "Die Simpsons", "", "Kinder", 1989, 8.7, 440000),
        ("ProSieben", 20, 15, 23, 15, "Avengers: Endgame", "Marvel-Blockbuster", "Film", 2019, 8.4, 1300000),
        ("ProSieben", 23, 15, 23, 59, "Late Night Berlin", "", "Unterhaltung", None, None, None),
        ("VOX", 8, 0, 14, 0, "Hot oder Schrott", "", "Unterhaltung", None, None, None),
        ("VOX", 14, 0, 18, 0, "Shopping Queen", "", "Unterhaltung", None, None, None),
        ("VOX", 18, 0, 20, 15, "Das perfekte Dinner", "", "Unterhaltung", None, None, None),
        ("VOX", 20, 15, 22, 40, "Forrest Gump", "Drama", "Film", 1994, 8.8, 2300000),
        ("VOX", 22, 40, 23, 59, "Medical Detectives", "", "Doku", None, None, None),
        ("ARTE", 6, 0, 14, 0, "Re: Reportage & Doku-Reihe", "", "Doku", None, None, None),
        ("ARTE", 14, 0, 18, 0, "Mit offenen Karten", "", "Doku", None, None, None),
        ("ARTE", 18, 0, 20, 15, "ARTE Journal", "", "Nachrichten", None, None, None),
        ("ARTE", 20, 15, 22, 15, "Metropolis", "Stummfilm-Klassiker", "Film", 1927, 8.3, 175000),
        ("ARTE", 22, 15, 23, 59, "Stadt Land Kunst", "", "Doku", None, None, None),
        ("KiKA", 6, 0, 12, 0, "Die Sendung mit der Maus", "", "Kinder", None, None, None),
        ("KiKA", 12, 0, 19, 0, "Pippi Langstrumpf", "Zeichentrick", "Kinder", 1997, 6.8, 3200),
        ("KiKA", 19, 0, 21, 0, "Logo!", "Kindernachrichten", "Nachrichten", None, None, None),
        ("SPORT1", 8, 0, 14, 0, "Darts-WM Highlights", "", "Sport", None, None, None),
        ("SPORT1", 14, 0, 23, 59, "Tennis ATP Masters", "Finale", "Sport", None, None, None),
        ("kabel eins", 10, 0, 15, 0, "Abenteuer Leben", "", "Doku", None, None, None),
        ("kabel eins", 15, 0, 20, 15, "Navy CIS", "Serien-Marathon", "Serie", 2003, 7.8, 130000),
        ("kabel eins", 20, 15, 22, 40, "Stirb langsam", "Actionfilm", "Film", 1988, 8.2, 850000),
        ("kabel eins", 22, 40, 23, 59, "Mission: Impossible", "Actionfilm", "Film", 1996, 7.1, 440000),
    ]
    return [{
        "channel": ch, "title": ti, "sub": sub, "start": t(sh, sm), "stop": t(eh, em),
        "rawcat": cat, "desc": "", "year": yr, "episode": cat == "Serie",
        "cat": cat, "rating": rt, "votes": vt, "rating_src": "Demo" if rt else None,
    } for ch, sh, sm, eh, em, ti, sub, cat, yr, rt, vt in rows]


# ----------------------------------------------------------------- Ausgabe

def build_stats(progs):
    cats = {c: 0 for c in CAT_ORDER}
    for p in progs:
        cats[p["cat"]] += (p["stop"] - p["start"]) / 60000
    films = [p for p in progs if p["cat"] == "Film"]
    rated = [p for p in progs if p.get("rating")]
    years = [p["year"] for p in films if p["year"]]
    return {
        "minutes_by_cat": cats,
        "n_programmes": len(progs),
        "n_films": len(films),
        "avg_rating": round(sum(p["rating"] for p in rated) / len(rated), 1) if rated else None,
        "oldest_film": min(years) if years else None,
        "newest_film": max(years) if years else None,
    }


def render(progs, day_start, source_label, out_path):
    channels = []
    for p in progs:
        if p["channel"] not in channels:
            channels.append(p["channel"])
    data = {
        "day_start": int(day_start.timestamp() * 1000),
        "date_label": day_start.strftime("%d.%m.%Y"),
        "source": source_label,
        "categories": CAT_ORDER,
        "channels": channels,
        "programmes": sorted(progs, key=lambda p: (channels.index(p["channel"]), p["start"])),
        "stats": build_stats(progs),
    }
    with open(os.path.join(HERE, "template.html"), encoding="utf-8") as f:
        html = f.read()
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html.replace("/*__DATA__*/null", blob))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default=DEFAULT_XMLTV, help="XMLTV-URL oder -Datei (.xml/.xml.gz)")
    ap.add_argument("--channels", help="Kommagetrennte Senderliste (Standard: ~20 große deutsche Sender)")
    ap.add_argument("--all-channels", action="store_true", help="Alle Sender der Quelle verwenden")
    ap.add_argument("--demo", action="store_true", help="Demo-Daten statt Live-Daten")
    ap.add_argument("-o", "--output", default=os.path.join(HERE, "tvprogramm.html"))
    ap.add_argument("--open", action="store_true", help="Ergebnis im Browser öffnen")
    a = ap.parse_args()

    day_start = dt.datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + dt.timedelta(days=1)

    if a.demo:
        progs, label = demo_programmes(day_start), "Demo-Daten (keine echten Sendungen)"
    else:
        wanted = [c.strip() for c in a.channels.split(",")] if a.channels else DEFAULT_CHANNELS
        try:
            progs = load_xmltv(a.source, wanted, day_start, day_end, a.all_channels)
        except Exception as e:
            sys.exit(f"Programmdaten konnten nicht geladen werden ({e}).\n"
                     "Prüfe Internetverbindung/--source oder probiere --demo.")
        if not progs:
            sys.exit("Keine Sendungen für heute gefunden (Senderliste/Quelle prüfen, ggf. --all-channels).")
        label = a.source
        for p in progs:
            p["cat"] = categorize(p)
        enrich(progs)

    render(progs, day_start, label, a.output)
    print(f"{len(progs)} Sendungen, {len({p['channel'] for p in progs})} Sender → {a.output}")
    if a.open:
        webbrowser.open("file://" + os.path.abspath(a.output))


if __name__ == "__main__":
    main()

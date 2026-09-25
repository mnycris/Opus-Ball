"""Stage 1: resolve the 2026/27 football world from the EA FC 27 + FC 26 datasets.

Outputs scripts/data/out/world_stage1.json with clubs (+league), players (merged), and diagnostics.
"""
import csv
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from common import SRC, best_match, norm, sim  # noqa: E402
from leagues import LEAGUES, ROW_COUNTRY  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

p27 = list(csv.DictReader(open(f"{SRC}/ea-fc/data/dataset_ea_fc_27.csv", encoding="utf-8-sig")))
p26 = list(csv.DictReader(open(f"{SRC}/EAFC26-DataHub/data/players.csv", encoding="utf-8")))
by26 = {p["player_id"]: p for p in p26}

clubs27 = Counter(p["club_name"] for p in p27 if p["club_name"])
club26_info = {}
for p in p26:
    if p["club_name"]:
        club26_info.setdefault(p["club_name"], dict(team_id=p["club_team_id"], league_id=p["league_id"],
                                                     league=p["league_name"], level=p["league_level"]))

# ---- map FC27 club -> FC26 club (same entity) ----
votes = defaultdict(Counter)
for p in p27:
    q = by26.get(p["sofifa_id"])
    if q and p["club_name"]:
        votes[p["club_name"]][q["club_name"]] += 1

map27to26 = {}
for c, n in clubs27.items():
    if c in club26_info:
        map27to26[c] = c
        continue
    v = votes.get(c, Counter())
    cands = [k for k in v if k]
    # 1) strong name similarity among clubs that share players
    best, score = best_match(c, cands, 0.86) if cands else (None, 0)
    if best:
        map27to26[c] = best
        continue
    # 2) moderate name similarity backed by a real share of the squad
    if v:
        top, cnt = v.most_common(1)[0]
        if top and cnt >= 4 and cnt >= 0.2 * n and sim(c, top) >= 0.6:
            map27to26[c] = top
            continue
    # 3) global exact-ish name match
    best, score = best_match(c, list(club26_info), 0.92)
    if best:
        map27to26[c] = best

fc26_league_members = defaultdict(list)
for c27, c26 in map27to26.items():
    li = club26_info[c26]["league_id"]
    if li:
        fc26_league_members[int(float(li))].append(c27)

# ---- resolve 2026/27 league membership ----
logos_dir = f"{SRC}/football-logos/logos"
assigned = {}  # club27 -> league id
diag = []
all27 = list(clubs27)

# reference-list name -> FC 27 name, for names fuzzy matching gets wrong
ALIASES = {
    "RCD Espanyol Barcelona": "RCD Espanyol", "CD Nacional": "CD Nacional", "SCR Altach": "SC Rheindorf Altach",
    "Rapid Vienna": "SK Rapid", "Austria Vienna": "FK Austria Wien", "Aarhus GF": "Aarhus Gymnastikforening",
    "FC Copenhagen": "FC København", "Petrolul Ploiesti": "Asociația Clubul Sportiv Petrolul 52",
    "FC Rapid 1923": "Rapid Bucuresti", "FC Dinamo 1948": "Dinamo Bucureşti", "Celta de Vigo": "RC Celta",
    "Athletic Bilbao": "Athletic Club", "Atlético de Madrid": "Atlético Madrid", "Bayern Munich": "Bayern München",
    "Inter Milan": "Inter Milan", "Olympique Lyon": "Olympique Lyonnais", "Olympique Marseille": "Olympique de Marseille",
    "LOSC Lille": "Lille OSC", "FC Toulouse": "Toulouse FC", "Stade Rennais FC": "Stade Rennais",
    "SC Braga": "Sporting Clube de Braga", "Vitória Guimarães SC": "Vitória SC", "CS Marítimo": "Marítimo",
    "Académico Viseu FC": "Academico Viseu", "CD Santa Clara": "Santa Clara", "CF Estrela Amadora": "Estrela da Amadora",
    "FC Alverca": "Alverca", "Casa Pia AC": "Casa Pia", "FC Famalicão": "Famalicão", "SL Benfica": "SL Benfica",
    "Ajax Amsterdam": "Ajax", "PSV Eindhoven": "PSV", "Excelsior Rotterdam": "Excelsior", "FC Twente Enschede": "FC Twente",
    "SC Cambuur Leeuwarden": "SC Cambuur", "SC Telstar": "Telstar", "Willem II Tilburg": "Willem II",
    "Feyenoord Rotterdam": "Feyenoord", "SK Beveren": "Waasland-Beveren", "Royal Charleroi SC": "Royal Charleroi Sporting Club",
    "Standard Liège": "Standard de Liège", "Cercle Brugge": "Cercle Brugge KSV", "Zulte Waregem": "SV Zulte Waregem",
    "Heart of Midlothian FC": "Heart of Midlothian FC", "Hibernian FC": "Hibernian", "St. Johnstone FC": "St Johnstone FC",
    "St. Mirren FC": "St. Mirren", "Basaksehir FK": "Medipol Başakşehir FK", "Besiktas JK": "Beşiktaş JK",
    "Caykur Rizespor": "Çaykur Rizespor", "Corum FK": "Çorum FK", "Fenerbahce": "Fenerbahçe SK", "Galatasaray": "Galatasaray SK",
    "Genclerbirligi Ankara": "Gençlerbirliği SK", "Göztepe": "Göztepe SK", "Kasimpasa": "Kasımpaşa SK",
    "Red Bull Salzburg": "FC Red Bull Salzburg", "LASK": "LASK Linz", "SC Austria Lustenau": "Austria Lustenau",
    "Bröndby IF": "Brøndby IF", "FC Nordsjaelland": "FC Nordsjælland", "Sönderjyske Fodbold": "Sønderjyske Fodbold",
    "FK BodøGlimt": "FK Bodø/Glimt", "Vålerenga Fotball Elite": "Vålerenga Fotball", "Hammarby IF": "Hammarby Fotboll",
    "Jagiellonia Bialystok": "Jagiellonia Białystok", "Lech Poznan": "Lech Poznań", "Pogon Szczecin": "Pogoń Szczecin",
    "Slask Wroclaw": "Śląsk Wrocław", "Widzew Lodz": "Widzew Łódź", "Wieczysta Krakow": "Wieczysta Kraków",
    "Wisla Kraków": "Wisła Kraków", "Wisla Plock": "Wisła Płock", "Zaglebie Lubin": "Zagłębie Lubin",
    "ACSC FC Arges": "FC Argeș", "FC Botosani": "FC Botoşani", "FC Universitatea Cluj": "Universitatea Cluj",
    "FCV Farul Constanta": "FCV Farul Constanța", "FK Csikszereda Miercurea Ciuc": "Csíkszereda Miercurea Ciuc",
    "SC Otelul Galati": "Oțelul Galați", "Sepsi OSK Sf. Gheorghe": "Sepsi OSK", "Universitatea Craiova": "Universitatea Craiova",
    "Grasshopper Club Zurich": "Grasshopper Club Zürich", "FC Zürich": "FC Zürich",
    "GNK Dinamo Zagreb": "GNK Dinamo Zagreb", "HNK Hajduk Split": "Hajduk Split",
    "AC Sparta Prague": "Sparta Praha", "SK Slavia Prague": "SK Slavia Praha", "FC Viktoria Plzen": "Viktoria Plzeň",
    "Olympiacos Piraeus": "Olympiacos FC", "PAOK Thessaloniki": "PAOK", "Panathinaikos": "Panathinaikos FC",
    "AEK Athens": "AEK Athens", "Ludogorets Razgrad": "Ludogorets",
}


def resolve(nm, threshold=0.72):
    if nm in ALIASES:
        return ALIASES[nm] if ALIASES[nm] in clubs27 else None, 1.0
    if nm in clubs27:
        return nm, 1.0
    return best_match(nm, all27, threshold)



def take(league_id, club):
    if club in assigned and assigned[club] != league_id:
        diag.append(f"CONFLICT {club}: {assigned[club]} vs {league_id}")
    assigned[club] = league_id


for lg in LEAGUES:
    kind, arg = lg["ref"]
    members = []
    if kind == "logos":
        names = [f[:-4] for f in sorted(os.listdir(os.path.join(logos_dir, arg))) if f.endswith(".png")]
        # candidates: clubs whose FC26 league shares the country, or unknown clubs
        for nm in names:
            best, score = resolve(nm, 0.72)
            if best:
                members.append(best)
            else:
                diag.append(f"[{lg['short']}] logo team not in FC27: {nm} ({score:.2f})")
    elif kind == "explicit":
        for nm in arg:
            if nm in clubs27:
                members.append(nm)
            else:
                best, score = resolve(nm, 0.8)
                if best:
                    members.append(best)
                else:
                    diag.append(f"[{lg['short']}] explicit team not in FC27: {nm}")
    elif kind == "fc26":
        members = list(fc26_league_members.get(arg, []))
        for nm in lg.get("remove", []):
            best, _ = best_match(nm, members, 0.8)
            if best:
                members.remove(best)
            else:
                diag.append(f"[{lg['short']}] remove not found: {nm}")
        for nm in lg.get("add", []):
            best, score = resolve(nm, 0.8)
            if best and best not in members:
                members.append(best)
            elif not best:
                diag.append(f"[{lg['short']}] add not found: {nm}")
    lg["members"] = members

# Priority: explicit/logos leagues win over fc26-derived leagues; lower-level derived after top.
order = sorted(LEAGUES, key=lambda l: (0 if l["ref"][0] in ("logos", "explicit") else 1, l["level"]))
for lg in order:
    for c in lg["members"]:
        if c in assigned:
            if lg["ref"][0] == "fc26":
                continue  # already claimed by an authoritative list
        take(lg["id"], c)
for lg in LEAGUES:
    lg["members"] = [c for c in lg["members"] if assigned.get(c) == lg["id"]]

for lg in LEAGUES:
    n = len(lg["members"])
    flag = "" if n == lg["teams"] else f"   <-- expected {lg['teams']}"
    print(f"{lg['id']:>5} {lg['short']:<22} {n:>3}{flag}")

unassigned = sorted([(c, clubs27[c], club26_info.get(map27to26.get(c, ''), {}).get('league', '?')) for c in all27
                     if c not in assigned], key=lambda x: -x[1])
print("\nUnassigned clubs (->Rest of World or dropped):", len(unassigned))
for c, n, l in unassigned:
    print(f"   {c} ({n}) fc26={l}")
print("\nDiagnostics:")
for d in diag:
    print("  ", d)

json.dump(dict(
    assigned=assigned,
    map27to26=map27to26,
    club26_info=club26_info,
    leagues=[{k: v for k, v in lg.items()} for lg in LEAGUES],
    unassigned=[u[0] for u in unassigned],
), open(os.path.join(OUT, "stage1.json"), "w"), ensure_ascii=False, indent=1)

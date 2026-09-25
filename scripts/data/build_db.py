"""Stage 2: build the compact app database + badge manifest from stage 1.

Writes:
  public/data/world.json          (leagues, clubs, nations, managers, fixtures, uefa, history, players)
  scripts/data/out/badges.json    (clubId -> source image path) consumed by process_badges.mjs
"""
import csv
import datetime as dt
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from common import PUBLIC, SRC, best_match, norm, sim  # noqa: E402
from leagues import HOLDERS_2026, LEAGUES, UEFA_2026  # noqa: E402
from nations import EXTRA_ROW_COUNTRY, FC26_LEAGUE_COUNTRY, NATIONS  # noqa: E402

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "out")
st1 = json.load(open(os.path.join(OUT, "stage1.json")))
assigned = st1["assigned"]
map27to26 = st1["map27to26"]
club26_info = st1["club26_info"]
league_by_id = {lg["id"]: lg for lg in LEAGUES}
for lg in st1["leagues"]:
    league_by_id[lg["id"]]["members"] = lg["members"]

p27 = list(csv.DictReader(open(f"{SRC}/ea-fc/data/dataset_ea_fc_27.csv", encoding="utf-8-sig")))
p26 = list(csv.DictReader(open(f"{SRC}/EAFC26-DataHub/data/players.csv", encoding="utf-8")))
by26 = {p["player_id"]: p for p in p26}


def h(s, mod):
    return int(hashlib.md5(s.encode()).hexdigest(), 16) % mod


# ------------------------------------------------------------------ curated club metadata
curated = {}
for f in sorted(glob.glob(os.path.join(HERE, "curated", "clubs_*.txt"))):
    for line in open(f, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) != 11:
            print("BAD CURATED LINE", f, line)
            continue
        name, disp, short, abbr, stad, cap, city, founded, c1, c2, c3 = parts
        curated[name] = dict(display=disp, short=short, abbr=abbr, stadium=stad, capacity=int(cap), city=city,
                             founded=int(founded), kit=[c1, c2], theme=c3)

managers = {}
for line in open(os.path.join(HERE, "curated", "managers.txt"), encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    club, name, nat, age, form, vision = line.split("|")
    managers[club] = dict(name=name, nationality=nat, age=int(age), formation=form, vision=vision)

rivalries = []
for line in open(os.path.join(HERE, "curated", "rivalries.txt"), encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    a, b, nm, inten = line.split("|")
    rivalries.append((a, b, nm, int(inten)))

# ------------------------------------------------------------------ clubs
clubs27 = Counter(p["club_name"] for p in p27 if p["club_name"])
used_ids = set()
club_id = {}
for c in sorted(clubs27):
    c26 = map27to26.get(c)
    tid = None
    if c26 and club26_info.get(c26, {}).get("team_id"):
        tid = int(float(club26_info[c26]["team_id"]))
    if tid is None or tid in used_ids:
        tid = 900000 + h(c, 90000)
        while tid in used_ids:
            tid += 1
    used_ids.add(tid)
    club_id[c] = tid

FREE_AGENT_CLUB = 0


def club_country(c):
    lid = assigned.get(c)
    if lid:
        return league_by_id[lid]["country"]
    if c in EXTRA_ROW_COUNTRY:
        return EXTRA_ROW_COUNTRY[c]
    c26 = map27to26.get(c)
    if c26:
        li = club26_info[c26].get("league_id")
        if li:
            return FC26_LEAGUE_COUNTRY.get(int(float(li)), None)
    return None


def auto_abbr(name):
    toks = [t for t in re.split(r"[\s\-\.]+", norm(name, keep_all=True)) if t]
    toks2 = [t for t in norm(name).split() if t]
    base = toks2 or toks
    if len(base) >= 3:
        s = base[0][0] + base[1][0] + base[2][0]
    elif len(base) == 2:
        s = base[0][:2] + base[1][0] if len(base[0]) > 2 else base[0][0] + base[1][:2]
    else:
        s = base[0][:3]
    return s.upper()


# ------------------------------------------------------------------ badge index
logo_index = []  # (name, path, priority)
for d in sorted(glob.glob(f"{SRC}/football-logos/logos/*")):
    for f in glob.glob(os.path.join(d, "*.png")):
        logo_index.append((os.path.basename(f)[:-4], f, 0, os.path.basename(d)))
for season in sorted(os.listdir(f"{SRC}/football-logos/history"), reverse=True):
    for d in glob.glob(f"{SRC}/football-logos/history/{season}/*"):
        for f in glob.glob(os.path.join(d, "*.png")):
            logo_index.append((os.path.basename(f)[:-4], f, 1, os.path.basename(d)))

hab_root = f"{SRC}/habereet_team-league-competition-logos"
hab_files = subprocess.run(["git", "-C", hab_root, "ls-tree", "-r", "--name-only", "HEAD"], capture_output=True,
                           text=True).stdout.splitlines()
hab_index = []
for f in hab_files:
    f = f.strip('"')
    if f.startswith("Soccer/Club Teams and Leagues/") and f.endswith(".svg") and "Logo" not in os.path.basename(f):
        nm = re.sub(r"\s*\(.*?\)", "", os.path.basename(f)[:-4])
        hab_index.append((nm, f))

fcl_root = f"{SRC}/FCLOGO_fclogo.top"
fcl_files = open("/tmp/claude-0/fclogo_files.txt").read().splitlines()
fcl_by_club = defaultdict(list)
FED_COUNTRY = {"SAFF": "Saudi Arabia", "USSF": "United States", "AFA": "Argentina", "CBF": "Brazil", "DFB": "Germany",
               "FA": "Australia", "FFF": "France", "FIGC": "Italy", "FMF": "Mexico", "KFA": "Korea Republic", "RFEF": "Spain",
               "theFA": "England", "CFA": "China PR", "JFA": "Japan", "OEFB": "Austria", "FPF": "Portugal", "UAE": "United Arab Emirates",
               "TFF": "Türkiye", "FRMF": "Morocco", "EFA": "Egypt", "HKFA": "Hong Kong", "NZF": "New Zealand", "SAFA": "South Africa",
               "FCRF": "Costa Rica"}
for f in fcl_files:
    m = re.match(r"src/data/logos/([^/]+)/clubs/(?:.*/)?([^/]+)/svg/([^/]+\.svg)$", f)
    if m and "-mono" not in m.group(3) and "-kits" not in m.group(3):
        nm = re.sub(r"^\d+[-_ ]+", "", m.group(2)).replace("-", " ").strip()
        fcl_by_club[(FED_COUNTRY.get(m.group(1), m.group(1)), nm)].append(f)


def fcl_pick(files):
    def ver(f):
        m = re.search(r"-v(\d{4})", f)
        return int(m.group(1)) if m else 0
    return sorted(files, key=lambda f: (ver(f), -len(f)))[-1]


BADGE_ALIASES = {
    "Bayern München": "Bayern Munich", "Inter Milan": "Inter Milan", "RCD Espanyol": "RCD Espanyol Barcelona",
    "RC Celta": "Celta de Vigo", "Atlético Madrid": "Atlético de Madrid", "Athletic Club": "Athletic Bilbao",
    "Olympique Lyonnais": "Olympique Lyon", "Olympique de Marseille": "Olympique Marseille", "Lille OSC": "LOSC Lille",
    "Toulouse FC": "FC Toulouse", "Stade Rennais": "Stade Rennais FC", "Sporting Clube de Braga": "SC Braga",
    "Vitória SC": "Vitória Guimarães SC", "Ajax": "Ajax Amsterdam", "PSV": "PSV Eindhoven", "FC Twente": "FC Twente Enschede",
    "SK Rapid": "Rapid Vienna", "FK Austria Wien": "Austria Vienna", "SC Rheindorf Altach": "SCR Altach",
    "FC København": "FC Copenhagen", "Aarhus Gymnastikforening": "Aarhus GF", "Rapid Bucuresti": "FC Rapid 1923",
    "Dinamo Bucureşti": "FC Dinamo 1948", "Asociația Clubul Sportiv Petrolul 52": "Petrolul Ploiesti",
    "Medipol Başakşehir FK": "Basaksehir FK", "Fenerbahçe SK": "Fenerbahce", "Galatasaray SK": "Galatasaray",
    "Waasland-Beveren": "SK Beveren", "Royal Charleroi Sporting Club": "Royal Charleroi SC",
    "Standard de Liège": "Standard Liège", "Hibernian": "Hibernian FC", "St. Mirren": "St. Mirren FC",
    "St Johnstone FC": "St. Johnstone FC", "Hammarby Fotboll": "Hammarby IF", "Vålerenga Fotball": "Vålerenga Fotball Elite",
    "FK Bodø/Glimt": "FK BodøGlimt", "Olympiacos FC": "Olympiacos Piraeus", "PAOK": "PAOK Thessaloniki",
    "Panathinaikos FC": "Panathinaikos", "SK Slavia Praha": "SK Slavia Prague", "Sparta Praha": "AC Sparta Prague",
    "Viktoria Plzeň": "FC Viktoria Plzen", "Hajduk Split": "HNK Hajduk Split", "Ludogorets": "Ludogorets Razgrad",
    "CD Nacional": "CD Nacional", "Wolverhampton Wanderers": "Wolverhampton Wanderers", "Werder Bremen": "SV Werder Bremen",
    "Schalke 04": "FC Schalke 04", "SV Elversberg": "SV 07 Elversberg", "Hellas Verona FC": "Hellas Verona",
    "Monza": "AC Monza", "Frosinone": "Frosinone Calcio", "Parma Calcio": "Parma Calcio 1913", "Bologna FC": "Bologna FC 1909",
    "Fiorentina": "ACF Fiorentina", "Sassuolo": "US Sassuolo", "Lecce": "US Lecce", "Genoa": "Genoa CFC",
    "Cagliari": "Cagliari Calcio", "Como": "Como 1907", "Cremonese": "US Cremonese", "Pisa": "AC Pisa 1909",
    "Empoli": "FC Empoli", "Sampdoria": "UC Sampdoria", "Dynamo Kyiv": "Dynamo Kyiv", "GNK Dinamo Zagreb": "GNK Dinamo Zagreb",
    "FC Red Bull Salzburg": "Red Bull Salzburg", "LASK Linz": "LASK", "Austria Lustenau": "SC Austria Lustenau",
    "RC Deportivo A Coruña": "Deportivo A Coruña", "Real Sporting de Gijón": "Sporting Gijón",
    "Real Valladolid CF": "Real Valladolid", "Cádiz CF": "Cádiz CF", "Academico Viseu": "Académico Viseu FC",
    "Marítimo": "CS Marítimo", "Santa Clara": "CD Santa Clara", "Estrela da Amadora": "CF Estrela Amadora",
    "Alverca": "FC Alverca", "Casa Pia": "Casa Pia AC", "Famalicão": "FC Famalicão", "Excelsior": "Excelsior Rotterdam",
    "SC Cambuur": "SC Cambuur Leeuwarden", "Telstar": "SC Telstar", "Willem II": "Willem II Tilburg",
    "Feyenoord": "Feyenoord Rotterdam", "Cercle Brugge KSV": "Cercle Brugge", "SV Zulte Waregem": "Zulte Waregem",
    "Beşiktaş JK": "Besiktas JK", "Çaykur Rizespor": "Caykur Rizespor", "Çorum FK": "Corum FK",
    "Gençlerbirliği SK": "Genclerbirligi Ankara", "Göztepe SK": "Göztepe", "Kasımpaşa SK": "Kasimpasa",
    "Brøndby IF": "Bröndby IF", "FC Nordsjælland": "FC Nordsjaelland", "Sønderjyske Fodbold": "Sönderjyske Fodbold",
    "Jagiellonia Białystok": "Jagiellonia Bialystok", "Lech Poznań": "Lech Poznan", "Pogoń Szczecin": "Pogon Szczecin",
    "Śląsk Wrocław": "Slask Wroclaw", "Widzew Łódź": "Widzew Lodz", "Wieczysta Kraków": "Wieczysta Krakow",
    "Wisła Płock": "Wisla Plock", "Zagłębie Lubin": "Zaglebie Lubin", "FC Argeș": "ACSC FC Arges",
    "FC Botoşani": "FC Botosani", "Universitatea Cluj": "FC Universitatea Cluj", "FCV Farul Constanța": "FCV Farul Constanta",
    "Csíkszereda Miercurea Ciuc": "FK Csikszereda Miercurea Ciuc", "Oțelul Galați": "SC Otelul Galati",
    "Sepsi OSK": "Sepsi OSK Sf. Gheorghe", "Grasshopper Club Zürich": "Grasshopper Club Zurich",
    "Shakhtar Donetsk": "Shakhtar Donetsk", "Heart of Midlothian FC": "Heart of Midlothian FC",
    "Middlesbrough FC": "Middlesbrough", "Millwall FC": "Millwall", "Southampton FC": "Southampton",
    "Leicester City": "Leicester City", "Brentford": "Brentford FC", "Burnley": "Burnley FC", "Watford": "Watford FC",
    "Luton Town": "Luton Town", "Sheffield United": "Sheffield United", "Norwich City": "Norwich City",
    "Wolverhampton Wanderers ": "Wolverhampton Wanderers",
    "Bolton Wanderers": "Bolton", "Birmingham City": "Birmingham", "DSC Arminia Bielefeld": "Arminia Bielefeld",
    "VfL Bochum 1848": "Bochum", "SpVgg Greuther Fürth": "Greuther", "Los Angeles FC": "LA FC",
    "Estudiantes de La Plata": "Estudiantes", "Gimnasia y Esgrima La Plata": "Gimnasia LP", "Newell's Old Boys": "Newell's",
    "Belgrano de Córdoba": "Belgrano", "Instituto Atlético Central Córdoba": "Instituto", "San Lorenzo de Almagro": "San Lorenzo",
    "Club Atlético Sarmiento": "Sarmiento", "RC Celta Fortuna": "Celta de Vigo", "Real Sociedad de Fútbol B": "Real Sociedad",
    "TSG 1899 Hoffenheim II": "TSG 1899 Hoffenheim", "VfB Stuttgart II": "VfB Stuttgart", "Inter Miami": "Inter Miami CF",
    "Minnesota United FC": "Minnesota United", "New York City FC": "New York City", "Seattle Sounders FC": "Seattle Sounders",
    "St. Louis CITY SC": "St. Louis City SC", "CF Montréal": "CF Montreal", "Vancouver Whitecaps FC": "Vancouver Whitecaps",
    "Houston Dynamo": "Houston Dynamo", "Al Ahli SFC": "Al Ahli", "Al Qadsiah FC": "Al Qadsiah", "Al Taawoun FC": "Al Taawoun",
    "Ulsan HD FC": "Ulsan HD", "Jeonbuk Hyundai Motors": "Jeonbuk Hyundai", "Daejeon Citizen": "Daejeon Hana Citizen",
    "Incheon United FC": "Incheon United", "Gimcheon Sangmu FC": "Gimcheon Sangmu", "Jeju United FC": "Jeju United",
    "Melbourne City FC": "Melbourne City FC", "Monterrey": "CF Monterrey", "Pachuca": "CF Pachuca", "Club León": "Club Leon",
    "CA Aldosivi": "Aldosivi", "CA Banfield": "Banfield", "Racing Club": "Racing", "Borussia Mönchengladbach": "Borussia Mönchengladbach",
}

badge_src = {}
badge_miss = []


def find_badge(c):
    target = BADGE_ALIASES.get(c, c)
    country = club_country(c)
    # 1) luukhopman (current season first, then history), same country folder only
    cands = [(nm, path) for nm, path, pri, folder in logo_index if not country or folder.startswith(country_folder(country))]
    m, sc = strict_match(target, [n for n, _ in cands])
    if m:
        return ("png", next(p for n, p in cands if n == m))
    # 2) habereet svg (same country folder)
    cands = [(n, p) for n, p in hab_index if not country or p.split("/")[2].startswith(country_folder(country))]
    m, sc = strict_match(target, [n for n, _ in cands])
    if m:
        return ("hab", dict(cands)[m])
    # 3) FCLOGO svg (same federation country)
    cands = {nm: key for key in fcl_by_club for nm in [key[1]] if not country or key[0] == country}
    m, sc = strict_match(target, list(cands))
    if m:
        return ("fcl", fcl_pick(fcl_by_club[cands[m]]))
    return None


GENERIC = {"fc", "sfc", "cf", "sc", "club", "de", "afc", "calcio", "hd", "motors", "fk", "hana", "ac", "as", "ssc", "us",
           "rc", "sv", "1", "cd", "ud", "sd", "kv", "krc", "kaa", "osc", "hsc", "aj", "ogc", "bk", "if", "sk", "fsv", "tsg",
           "vfb", "vfl", "rcd", "cfc", "bc", "acf", "ksv", "vv", "ca", "fbc", "hnk", "gnk", "jk", "the", "1846", "1893",
           "1879", "1909", "1913", "1907", "1899", "1900", "1904", "05", "04", "07", "98", "96", "29", "63", "38", "sco"}


def strict_match(target, names):
    """Exact normalized match, strong ratio, or subset where the only extra tokens are generic suffixes."""
    nt = set(norm(target, keep_all=True).split())
    best, bs = None, 0
    for n in names:
        nn = set(norm(n, keep_all=True).split())
        if not nn:
            continue
        if nn == nt:
            return n, 1.0
        extra = (nt - nn) | (nn - nt)
        if (nn <= nt or nt <= nn) and extra <= GENERIC:
            s = 0.95
        else:
            from difflib import SequenceMatcher
            r = SequenceMatcher(None, norm(target, keep_all=True), norm(n, keep_all=True)).ratio()
            s = r if r >= 0.9 else 0
        if s > bs:
            best, bs = n, s
    return (best, bs) if bs >= 0.9 else (None, bs)


COUNTRY_FOLDER = {"Türkiye": "Türkiye", "Republic of Ireland": "Ireland", "Czechia": "Czech Republic"}


def country_folder(country):
    return COUNTRY_FOLDER.get(country, country)


for c in sorted(clubs27):
    r = find_badge(c)
    if r:
        badge_src[club_id[c]] = r
    else:
        badge_miss.append(c)

# fetch needed blobs from the blob-less clones
need_hab = [p for k, p in badge_src.values() if k == "hab"]
need_fcl = [p for k, p in badge_src.values() if k == "fcl"]
if need_hab:
    subprocess.run(["git", "-C", hab_root, "checkout", "HEAD", "--"] + need_hab, check=True)
for i in range(0, len(need_fcl), 50):
    subprocess.run(["git", "-C", fcl_root, "checkout", "HEAD", "--"] + need_fcl[i:i + 50], check=True)

manifest = {}
for cid, (kind, p) in badge_src.items():
    full = p if kind == "png" else os.path.join(hab_root if kind == "hab" else fcl_root, p)
    manifest[str(cid)] = full
json.dump(manifest, open(os.path.join(OUT, "badges.json"), "w"), ensure_ascii=False, indent=0)
print(f"badges: {len(badge_src)} local, {len(badge_miss)} runtime-only")
print("   runtime-only:", ", ".join(badge_miss[:200]))

# ------------------------------------------------------------------ players
ATTR27 = ["crossing", "finishing", "heading_accuracy", "short_passing", "volleys", "dribbling_stat", "curve", "fk_accuracy",
          "long_passing", "ball_control", "acceleration", "sprint_speed", "agility", "reactions", "balance", "shot_power",
          "jumping", "stamina", "strength", "long_shots", "aggression", "interceptions", "positioning", "vision",
          "penalties", "composure", "defensive_awareness", "standing_tackle", "sliding_tackle", "gk_diving",
          "gk_handling", "gk_kicking", "gk_positioning", "gk_reflexes"]
FACE6 = ["pace", "shooting", "passing", "dribbling", "defending", "physical"]
START = dt.date(2026, 7, 1)


def num(v, d=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return d


def derive_sm(p):
    d = (num(p["dribbling_stat"]) + num(p["agility"]) + num(p["ball_control"]) + num(p["balance"])) / 4
    pos = p["positions"].split(",")[0].strip()
    if pos == "GK":
        return 1
    if d >= 86: return 5
    if d >= 78: return 4
    if d >= 68: return 3
    if d >= 55: return 2
    return 1


def dob_from_age(pid, age):
    latest = dt.date(START.year - age, START.month, START.day)
    offset = h(pid + "dob", 364)
    return (latest - dt.timedelta(days=offset)).isoformat()


players = []
nat_names = defaultdict(lambda: [Counter(), Counter()])
missing_nat = Counter()
for p in p27:
    pid = p["sofifa_id"]
    q = by26.get(pid)
    club = p["club_name"]
    cid = club_id.get(club, FREE_AGENT_CLUB) if club else FREE_AGENT_CLUB
    same_club = bool(q and club and map27to26.get(club) == q["club_name"])
    age = num(p["age"])
    dob = q["dob"] if q and q.get("dob") else dob_from_age(pid, age)
    if q and q.get("dob"):
        # keep FC26 dob only if consistent with FC27 age
        b = dt.date.fromisoformat(q["dob"])
        a = START.year - b.year - ((START.month, START.day) < (b.month, b.day))
        if abs(a - age) > 1:
            dob = dob_from_age(pid, age)
    if cid == FREE_AGENT_CLUB:
        contract, joined = 0, None
    elif same_club and q.get("club_contract_valid_until_year"):
        contract = num(q["club_contract_valid_until_year"])
        joined = q.get("club_joined_date") or None
        if contract <= 2026:
            contract = 2027 + h(pid + "ext", 3)
    else:
        yrs = 5 if age <= 23 else 4 if age <= 28 else 3 if age <= 31 else 2 if age <= 33 else 1
        contract = 2026 + yrs
        joined = "2026-07-01"
    nat = p["nationality"]
    if nat not in NATIONS:
        missing_nat[nat] += 1
    positions = [x.strip() for x in p["positions"].split(",") if x.strip()]
    wf = num(q["weak_foot"]) if q and q.get("weak_foot") else 2 + h(pid + "wf", 3)
    sm = num(q["skill_moves"]) if q and q.get("skill_moves") else derive_sm(p)
    ir = num(q["international_reputation"]) if q and q.get("international_reputation") else (
        5 if num(p["overall"]) >= 89 else 4 if num(p["overall"]) >= 85 else 3 if num(p["overall"]) >= 80 else 2 if num(p["overall"]) >= 74 else 1)
    wr = q["work_rate"] if q and q.get("work_rate") else ""
    jersey = num(q["club_jersey_number"]) if same_club and q.get("club_jersey_number") else 0
    rc = num(q["release_clause_eur"]) if same_club and q.get("release_clause_eur") else 0
    natpos = q["nation_position"] if q and q.get("nation_position") else ""
    body = q["body_type"] if q and q.get("body_type") else ""
    realface = (q["real_face"] == "Yes") if q and q.get("real_face") else (num(p["overall"]) >= 75)
    attrs = [num(p[a]) for a in ATTR27]
    face6 = [num(p[a]) for a in FACE6]
    # name pools for regens
    parts = p["long_name"].split()
    if len(parts) >= 2 and nat:
        nat_names[nat][0][parts[0]] += 1
        nat_names[nat][1][parts[-1]] += 1
    players.append([
        int(pid), p["alias"] or p["short_name"], p["long_name"], p["short_name"], nat, cid, "|".join(positions), dob,
        num(p["height_cm"]), num(p["weight_kg"]), 1 if p["preferred_foot"] == "Left" else 0, num(p["overall"]),
        num(p["potential"]), num(p["value_eur"]), num(p["wage_eur"]), wf, sm, ir, wr, contract, joined, jersey, rc,
        natpos, body, 1 if realface else 0, p["playstyles"], p["playstyles_plus"], face6, attrs,
    ])
print("players", len(players), "missing nationality mapping:", dict(missing_nat))

PLAYER_FIELDS = ["id", "name", "fullName", "shortName", "nation", "clubId", "positions", "dob", "height", "weight",
                 "leftFoot", "ovr", "pot", "value", "wage", "weakFoot", "skillMoves", "intlRep", "workRate",
                 "contractUntil", "joined", "jersey", "releaseClause", "nationPosition", "bodyType", "realFace",
                 "playstyles", "playstylesPlus", "face6", "attrs"]

# ------------------------------------------------------------------ club output
club_players = defaultdict(list)
for pl in players:
    club_players[pl[5]].append(pl)

rival_map = defaultdict(list)
for a, b, nm, inten in rivalries:
    if a in club_id and b in club_id:
        rival_map[club_id[a]].append([club_id[b], nm, inten])
        rival_map[club_id[b]].append([club_id[a], nm, inten])
    else:
        print("rivalry club missing:", a if a not in club_id else b)

missing_cur = []
clubs_out = []
for c in sorted(clubs27, key=lambda x: club_id[x]):
    cid = club_id[c]
    cur = curated.get(c)
    lid = assigned.get(c)
    lg = league_by_id.get(lid)
    sq = sorted(club_players[cid], key=lambda x: -x[11])
    top = [x[11] for x in sq[:16]]
    avg = sum(top) / max(1, len(top))
    value = sum(x[13] for x in sq)
    wages = sum(x[14] for x in sq)
    if not cur:
        missing_cur.append(c)
    mgr = managers.get(c)
    clubs_out.append(dict(
        id=cid, name=cur["display"] if cur else c, dbName=c, short=cur["short"] if cur else c,
        abbr=cur["abbr"] if cur else auto_abbr(c), leagueId=lid or 0, country=club_country(c) or "",
        stadium=cur["stadium"] if cur else "", capacity=cur["capacity"] if cur else 0, city=cur["city"] if cur else "",
        founded=cur["founded"] if cur else 0, kit=cur["kit"] if cur else None, theme=cur["theme"] if cur else None,
        badge=str(cid) in manifest, sofifaTeamId=cid if cid < 900000 else 0,
        rivals=rival_map.get(cid, []), squadAvg=round(avg, 1), squadValue=value, wageBill=wages,
        manager=mgr,
    ))
print("clubs", len(clubs_out), "without curated metadata:", len(missing_cur))

# ------------------------------------------------------------------ fixtures (real openfootball 2026-27)
OF_NAME_FIX = {
    "Club Atlético de Madrid": "Atlético Madrid", "Real Madrid CF": "Real Madrid", "RC Celta de Vigo": "RC Celta",
    "RC Deportivo La Coruña": "RC Deportivo A Coruña", "RCD Espanyol de Barcelona": "RCD Espanyol",
    "Rayo Vallecano de Madrid": "Rayo Vallecano", "Real Racing Club de Santander": "Racing Santander",
    "Real Sociedad de Fútbol": "Real Sociedad", "FC Bayern München": "Bayern München", "SV Werder Bremen": "Werder Bremen",
    "FC Schalke 04": "Schalke 04", "SV 07 Elversberg": "SV Elversberg", "FC Internazionale Milano": "Inter Milan",
    "US Sassuolo Calcio": "Sassuolo", "ACF Fiorentina": "Fiorentina", "Genoa CFC": "Genoa", "US Lecce": "Lecce",
    "AC Monza": "Monza", "Frosinone Calcio": "Frosinone", "Parma Calcio 1913": "Parma Calcio", "Bologna FC 1909": "Bologna FC",
    "Cagliari Calcio": "Cagliari", "Como 1907": "Como", "AS Monaco FC": "AS Monaco", "Paris Saint-Germain FC": "Paris Saint-Germain",
    "Racing Club de Lens": "RC Lens", "Stade Rennais FC 1901": "Stade Rennais", "AFC Ajax": "Ajax", "AZ": "AZ Alkmaar",
    "FC Twente '65": "FC Twente", "Feyenoord Rotterdam": "Feyenoord", "NEC": "NEC Nijmegen", "SBV Excelsior": "Excelsior",
    "SC Cambuur-Leeuwarden": "SC Cambuur", "Telstar 1963": "Telstar", "Willem II Tilburg": "Willem II",
    "Académico de Viseu FC": "Academico Viseu", "CD Santa Clara": "Santa Clara", "CF Estrela da Amadora": "Estrela da Amadora",
    "CS Marítimo": "Marítimo", "Casa Pia AC": "Casa Pia", "FC Alverca": "Alverca", "FC Famalicão": "Famalicão",
    "Sport Lisboa e Benfica": "SL Benfica", "Sporting Clube de Portugal": "Sporting CP", "Vitória Guimarães": "Vitória SC",
    "Aston Villa FC": "Aston Villa", "Brighton & Hove Albion FC": "Brighton & Hove Albion", "Hull City AFC": "Hull City",
    "Swansea City AFC": "Swansea City", "Wrexham AFC": "Wrexham",
}
FIXTURE_LEAGUES = {"en.1": 13, "en.2": 14, "es.1": 53, "de.1": 19, "it.1": 31, "fr.1": 16, "nl.1": 10, "pt.1": 308}
fixtures = {}
for key, lid in FIXTURE_LEAGUES.items():
    data = json.load(open(f"{SRC}/of-football.json/2026-27/{key}.json"))
    members = league_by_id[lid]["members"]
    name2id = {}
    rows = []
    for m in data["matches"]:
        ids = []
        for t in (m["team1"], m["team2"]):
            if t not in name2id:
                nm = OF_NAME_FIX.get(t, t)
                if nm in members:
                    name2id[t] = club_id[nm]
                else:
                    b, s = best_match(nm, members, 0.6)
                    if not b:
                        raise SystemExit(f"fixture team unmapped {key}: {t}")
                    name2id[t] = club_id[b]
            ids.append(name2id[t])
        rnd = int(re.sub(r"\D", "", m.get("round", "0")) or 0)
        rows.append([m["date"], m.get("time", "15:00"), ids[0], ids[1], rnd])
    fixtures[lid] = rows
    assert len(set(name2id.values())) == len(members), (key, len(set(name2id.values())), len(members))

# ------------------------------------------------------------------ 2025/26 final tables (history)
HIST = {"en.1": 13, "es.1": 53, "de.1": 19, "it.1": 31, "fr.1": 16, "nl.1": 10, "pt.1": 308, "en.2": 14}
history = {}
for key, lid in HIST.items():
    data = json.load(open(f"{SRC}/of-football.json/2025-26/{key}.json"))
    T = {}
    for x in data["matches"]:
        sc = x.get("score")
        ft = sc.get("ft") if isinstance(sc, dict) else None
        if not ft:
            continue
        for t in (x["team1"], x["team2"]):
            T.setdefault(t, [0, 0, 0, 0, 0, 0, 0])
        a, b = ft
        hme, awy = T[x["team1"]], T[x["team2"]]
        for row, gf, ga in ((hme, a, b), (awy, b, a)):
            row[0] += 1; row[4] += gf; row[5] += ga
            if gf > ga: row[1] += 1; row[6] += 3
            elif gf == ga: row[2] += 1; row[6] += 1
            else: row[3] += 1
    tab = sorted(T.items(), key=lambda kv: (-kv[1][6], -(kv[1][4] - kv[1][5]), -kv[1][4]))
    out = []
    for t, r in tab:
        nm = OF_NAME_FIX.get(t, t)
        b, s = best_match(nm, list(club_id), 0.6)
        out.append(dict(clubId=club_id[b] if b else 0, name=nm, p=r[0], w=r[1], d=r[2], l=r[3], gf=r[4], ga=r[5], pts=r[6]))
    history[lid] = out

# ------------------------------------------------------------------ UEFA 2026/27
uefa = {}
for comp, cfg in UEFA_2026.items():
    pots = []
    for pot in cfg["pots"]:
        ids = []
        for nm in pot:
            if nm not in club_id:
                b, s = best_match(nm, list(club_id), 0.85)
                if not b:
                    print("UEFA club missing", comp, nm)
                    continue
                nm = b
            ids.append(club_id[nm])
        pots.append(ids)
    uefa[comp] = dict(pots=pots, unlicensed=cfg["unlicensed"])

holders = {k: club_id.get(v, 0) for k, v in HOLDERS_2026.items()}

# ------------------------------------------------------------------ nations + name pools
nations_out = []
for nm, (code, fifa, conf) in sorted(NATIONS.items()):
    nations_out.append(dict(name=nm, flag=code, code=fifa, confed=conf))
name_pools = {}
for nat, (firsts, lasts) in nat_names.items():
    fl = [n for n, c in firsts.most_common(120) if len(n) > 1 and not n.endswith(".")]
    ll = [n for n, c in lasts.most_common(160) if len(n) > 1 and not n.endswith(".")]
    if len(fl) >= 5 and len(ll) >= 5:
        name_pools[nat] = [fl, ll]

leagues_out = []
for lg in LEAGUES:
    leagues_out.append({k: v for k, v in lg.items() if k not in ("ref", "add", "remove", "members")} | dict(
        clubs=[club_id[c] for c in sorted(lg["members"])]))

world = dict(
    version=1, dataset="EA SPORTS FC 27 (SoFIFA 270002) + EA SPORTS FC 26", season="2026/27", startDate="2026-07-01",
    leagues=leagues_out, clubs=clubs_out, nations=nations_out, playerFields=PLAYER_FIELDS, players=players,
    attrOrder=ATTR27, fixtures=fixtures, history=history, uefa=uefa, holders=holders, namePools=name_pools,
)
os.makedirs(os.path.join(PUBLIC, "data"), exist_ok=True)
path = os.path.join(PUBLIC, "data", "world.json")
json.dump(world, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
print("wrote", path, os.path.getsize(path) // 1024, "KB")
print("missing curated metadata:", missing_cur)

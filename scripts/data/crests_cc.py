"""Match every club (and competition) to the football-logos.cc catalogue (npm `football-logos`).

Writes src/data/crestsCC.json: { clubs: {clubId: "country/slug.hash"}, comps: {compKey: "country/slug.hash"} }.
Runtime URL: https://assets.football-logos.cc/logos/{country}/512x512/{slug}.{hash}.png
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import ROOT, SRC, best_match, norm, sim, slug

CAT = os.path.join(SRC, 'npm/football-logos/package/catalog/v1/countries')
world = json.load(open(os.path.join(ROOT, 'public/data/world.json')))

COUNTRY_ALIAS = {
    'Türkiye': 'turkey', 'Korea Republic': 'south-korea', 'United States': 'usa', 'Republic of Ireland': 'republic-of-ireland',
    'China PR': 'china', 'Czechia': 'czech-republic', "Côte d'Ivoire": 'cote-d-ivoire', 'Holland': 'netherlands',
}
cats = {}
for f in os.listdir(CAT):
    d = json.load(open(os.path.join(CAT, f)))['country']
    cats[d['slug']] = d

def country_slug(c):
    return COUNTRY_ALIAS.get(c, slug(c))

# manual fixes where names differ a lot between EA and football-logos.cc
MANUAL = {
    'Gimnasia La Plata': 'gimnasia-lp', 'Gimnasia y Esgrima de Mendoza': 'gimnasia-y-esgrima', 'Instituto': 'instituto-cordoba',
    'RC Deportivo': 'deportivo-la-coruna', 'Shenzhen Peng City': 'shenzhen-xinpengcheng',
    'Wellington Phoenix': 'new-zealand/wellington-phoenix', 'Auckland FC': 'new-zealand/auckland-fc', 'FC Vaduz': 'liechtenstein/vaduz', 'Al Ain FC': 'uae/al-ain',
    'FC København': 'copenhagen', 'LDU Quito': 'ldu-quito', 'Junior FC': 'atletico-junior', 'CD Nacional': 'nacional-da-madeira', 'Vitória SC': 'vitoria-de-guimaraes', 'Barcelona de Guayaquil': 'barcelona-sc', 'FC Argeș': 'arges-pitesti', 'Jeju United FC': 'jeju-sk-fc', 'FCSB': 'fcsb',
}
from difflib import SequenceMatcher
def score(q, cand):
    nq, nc = norm(q), norm(cand)
    if not nq or not nc: return 0.0
    if nq == nc: return 1.0
    tq, tc = set(nq.split()), set(nc.split())
    dice = 2 * len(tq & tc) / (len(tq) + len(tc))
    sub = 0.88 if tc <= tq else 0.82 if tq <= tc else 0.0
    return max(dice, sub, SequenceMatcher(None, nq, nc).ratio() * 0.97)
LEAGUE_SLUG = {}  # filled below from COMP

clubs_out, misses = {}, []
def match_clubs():
    for c in world['clubs']:
        cs = country_slug(c['country'])
        man = MANUAL.get(c['name'])
        if man and '/' in man:
            mcs, msl = man.split('/')
            e = cats[mcs]['clubs'][msl]
            clubs_out[str(c['id'])] = f"{mcs}/{e['slug']}.{e['hash']}"; continue
        cat = cats.get(cs)
        if not cat:
            misses.append((c['name'], c['country'], 'no-country')); continue
        entries = cat['clubs']
        if c['name'] in MANUAL and MANUAL[c['name']] in entries:
            e = entries[MANUAL[c['name']]]; clubs_out[str(c['id'])] = f"{cs}/{e['slug']}.{e['hash']}"; continue
        lg_slug = LEAGUE_SLUG.get(c['leagueId'])
        best, bs = None, 0.0
        for k, e in entries.items():
            sc = 0.0
            for q in [c.get('dbName'), c['name'], c.get('short')]:
                if not q: continue
                sc = max(sc, score(q, e['name']), score(q, k.replace('-', ' ')))
            if lg_slug and e.get('league') == lg_slug: sc += 0.06
            if sc > bs: best, bs = e, sc
        if best and bs >= 0.8:
            clubs_out[str(c['id'])] = f"{cs}/{best['slug']}.{best['hash']}"
        else:
            misses.append((c['name'], c['country'], f"{best and best['name']} {bs:.2f}"))

# competitions
COMP = {
    'L13': ('england', 'english-premier-league'), 'L14': ('england', 'efl-championship'), 'L60': ('england', 'efl-league-one'), 'L61': ('england', 'efl-league-two'),
    'L53': ('spain', 'la-liga'), 'L54': ('spain', 'la-liga-2'), 'L19': ('germany', 'bundesliga'), 'L20': ('germany', '2-bundesliga'), 'L2076': ('germany', '3-liga'),
    'L31': ('italy', 'serie-a'), 'L32': ('italy', 'serie-b'), 'L16': ('france', 'ligue-1'), 'L17': ('france', 'ligue-2'), 'L10': ('netherlands', 'eredivisie'),
    'L308': ('portugal', 'primeira-liga'), 'L4': ('belgium', 'jupiler-pro-league'), 'L50': ('scotland', 'scottish-premiership'), 'L68': ('turkey', 'super-lig'),
    'L80': ('austria', 'austrian-football-bundesliga'), 'L189': ('switzerland', 'swiss-football-league'), 'L1': ('denmark', 'danish-super-liga'),
    'L41': ('norway', 'eliteserien'), 'L56': ('sweden', 'allsvenskan'), 'L66': ('poland', 'ekstraklasa'), 'L330': ('romania', 'superliga'),
    'L350': ('saudi-arabia', 'saudi-professional-league'), 'L39': ('usa', 'mls'), 'L341': ('mexico', 'liga-mx'), 'L353': ('argentina', 'argentina-primera-division'),
    'L351': ('australia', 'a-league'), 'L83': ('south-korea', 'k-league-1'), 'L2012': ('china', 'chinese-super-league'), 'L2149': ('india', 'indian-super-league'),
    'L65': ('republic-of-ireland', None),
    'UCL': ('tournaments', 'uefa-champions-league'), 'UEL': ('tournaments', 'uefa-europa-league'), 'UECL': ('tournaments', 'uefa-conference-league'),
    'FACUP': ('england', 'emirates-fa-cup'), 'EFLCUP': ('england', 'efl-cup'), 'COMMSHIELD': ('england', 'fa-community-shield'),
    'DFB': ('germany', 'dfb-pokal'), 'DFLSC': ('germany', 'franz-beckenbauer-supercup'), 'SCI': ('italy', 'italian-super-cup'), 'CDF': ('france', 'french-cup'),
    'KNVB': ('netherlands', 'knvb-cup'), 'BELCUP': ('belgium', 'belgian-cup'), 'TURCUP': ('turkey', 'turkish-cup'),
}
for k, (cs, lg) in COMP.items():
    if k.startswith('L') and lg: LEAGUE_SLUG[int(k[1:])] = lg
match_clubs()
comps_out = {}
for k, (cs, lg) in COMP.items():
    cat = cats.get(cs)
    if not cat: continue
    if lg is None:
        lg = cat.get('defaultLeague')
    e = cat['leagues'].get(lg)
    if e: comps_out[k] = f"{cs}/{e['slug']}.{e['hash']}"
    else: print('comp miss', k, cs, lg)

json.dump({'clubs': clubs_out, 'comps': comps_out}, open(os.path.join(ROOT, 'src/data/crestsCC.json'), 'w'), separators=(',', ':'))
print('clubs matched', len(clubs_out), 'of', len(world['clubs']), '| comps', len(comps_out))
nob = {c['id'] for c in world['clubs'] if not c['badge']}
print('previously badge-less now covered:', sum(1 for i in nob if str(i) in clubs_out), 'of', len(nob))
for m in misses[:60]: print('  miss', m)

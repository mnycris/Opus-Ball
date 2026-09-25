"""League / competition definitions for the 2026/27 world.

`ref` is the reference list used to resolve 2026/27 membership:
  ("logos", <folder>)   -> luukhopman/football-logos 2026/27 folder (authoritative membership)
  ("fc26", <league_id>) -> EA FC 26 league membership, adjusted by `add` / `remove`
`fixtures` names an openfootball 2026-27 JSON with the real published fixture list.
"""

# rules: promo = automatic promotion places, playoff = (from,to) positions, rele = automatic relegation
# uefa: ordered slot allocation for the NEXT season (2027/28), by league position
LEAGUES = [
    # ---------------- ENGLAND ----------------
    dict(id=13, name="Premier League", short="Premier League", abbr="PL", country="England", flag="gb-eng", level=1,
         ref=("logos", "England - Premier League"), fixtures="en.1", teams=20,
         rele=3, uefa=["UCL", "UCL", "UCL", "UCL", "UEL", "UECL"], prestige=10, wealth=10),
    dict(id=14, name="EFL Championship", short="Championship", abbr="EFL", country="England", flag="gb-eng", level=2,
         ref=("explicit", [
             "Birmingham City", "Blackburn Rovers", "Bolton Wanderers", "Bristol City", "Burnley", "Cardiff City",
             "Charlton Athletic", "Derby County", "Lincoln City", "Middlesbrough FC", "Millwall FC", "Norwich City",
             "Portsmouth", "Preston North End", "Queens Park Rangers", "Sheffield United", "Southampton FC", "Stoke City",
             "Swansea City", "Watford", "West Bromwich Albion", "West Ham United", "Wolverhampton Wanderers", "Wrexham"]),
         fixtures="en.2", teams=24, promo=2, playoff=(3, 6), rele=3, prestige=6, wealth=6),
    dict(id=60, name="EFL League One", short="League One", abbr="EFL", country="England", flag="gb-eng", level=3,
         ref=("fc26", 60), remove=["Lincoln City", "Cardiff City", "Bolton Wanderers", "Exeter City", "Rotherham United",
                                     "Port Vale", "Northampton Town"],
         add=["Leicester City", "Sheffield Wednesday", "Oxford United", "Bromley", "Milton Keynes Dons",
              "Cambridge United", "Notts County"],
         teams=24, promo=2, playoff=(3, 6), rele=4, prestige=4, wealth=3),
    dict(id=61, name="EFL League Two", short="League Two", abbr="EFL", country="England", flag="gb-eng", level=4,
         ref=("fc26", 61), remove=["Bromley", "Milton Keynes Dons", "Cambridge United", "Notts County"],
         add=["Exeter City", "Rotherham United", "Port Vale", "Northampton Town", "York City", "Rochdale"],
         teams=24, promo=3, playoff=(4, 7), rele=0, prestige=3, wealth=2),
    # ---------------- SPAIN ----------------
    dict(id=53, name="LALIGA EA SPORTS", short="LaLiga", abbr="LL", country="Spain", flag="es", level=1,
         ref=("logos", "Spain - LaLiga"), fixtures="es.1", teams=20,
         rele=3, uefa=["UCL", "UCL", "UCL", "UCL", "UEL", "UECL"], prestige=10, wealth=9),
    dict(id=54, name="LALIGA HYPERMOTION", short="LaLiga 2", abbr="LL2", country="Spain", flag="es", level=2,
         ref=("fc26", 54), remove=["RC Deportivo A Coruña", "Málaga CF", "Racing Santander"],
         add=["Girona FC", "RCD Mallorca", "Real Oviedo", "CD Eldense", "CD Tenerife", "CE Sabadell FC", "RC Celta Fortuna"],
         teams=22, promo=2, playoff=(3, 6), rele=0, prestige=5, wealth=4),
    # ---------------- GERMANY ----------------
    dict(id=19, name="Bundesliga", short="Bundesliga", abbr="BL", country="Germany", flag="de", level=1,
         ref=("logos", "Germany - Bundesliga"), fixtures="de.1", teams=18,
         rele=2, releplayoff=16, uefa=["UCL", "UCL", "UCL", "UCL", "UEL", "UECL"], prestige=9, wealth=8),
    dict(id=20, name="Bundesliga 2", short="2. Bundesliga", abbr="BL2", country="Germany", flag="de", level=2,
         ref=("fc26", 20), remove=["Schalke 04", "SV Elversberg", "SC Paderborn 07", "Fortuna Düsseldorf",
                                     "SC Preußen Münster"],
         add=["1. FC Heidenheim 1846", "FC St. Pauli", "VfL Wolfsburg", "VfL Osnabrück", "FC Energie Cottbus"],
         teams=18, promo=2, promoplayoff=3, rele=2, releplayoff=16, prestige=5, wealth=5),
    dict(id=2076, name="3. Liga", short="3. Liga", abbr="3L", country="Germany", flag="de", level=3,
         ref=("explicit", [
             "Alemannia Aachen", "MSV Duisburg", "Fortuna Düsseldorf", "Rot-Weiss Essen", "SG Sonnenhof Großaspach",
             "TSV Havelse", "TSG 1899 Hoffenheim II", "FC Ingolstadt 04", "SC Fortuna Köln", "Viktoria Köln",
             "SV Waldhof Mannheim", "SV Meppen", "SC Preußen Münster", "SSV Jahn Regensburg", "Hansa Rostock",
             "1. FC Saarbrücken", "VfB Stuttgart II", "SC Verl", "SV Wehen Wiesbaden", "FC Würzburger Kickers"]),
         teams=20, promo=2, promoplayoff=3, rele=0, prestige=3, wealth=2),
    # ---------------- ITALY ----------------
    dict(id=31, name="Serie A Enilive", short="Serie A", abbr="SA", country="Italy", flag="it", level=1,
         ref=("logos", "Italy - Serie A"), fixtures="it.1", teams=20,
         rele=3, uefa=["UCL", "UCL", "UCL", "UCL", "UEL", "UECL"], prestige=9, wealth=8),
    dict(id=32, name="Serie BKT", short="Serie B", abbr="SB", country="Italy", flag="it", level=2,
         ref=("fc26", 32), remove=["Monza", "Frosinone", "Venezia FC"],
         add=["Cremonese", "Hellas Verona FC", "Pisa", "Calcio Padova", "Arezzo", "Vicenza", "Benevento", "Ascoli"],
         teams=20, promo=2, playoff=(3, 8), rele=0, prestige=5, wealth=4),
    # ---------------- FRANCE ----------------
    dict(id=16, name="Ligue 1 McDonald's", short="Ligue 1", abbr="L1", country="France", flag="fr", level=1,
         ref=("logos", "France - Ligue 1"), fixtures="fr.1", teams=18,
         rele=2, releplayoff=16, uefa=["UCL", "UCL", "UCL", "UCL", "UEL", "UECL"], prestige=8, wealth=7),
    dict(id=17, name="Ligue 2 BKT", short="Ligue 2", abbr="L2", country="France", flag="fr", level=2,
         ref=("fc26", 17), remove=["ESTAC Troyes", "Le Mans FC"],
         add=["FC Metz", "FC Nantes", "FC Sochaux-Montbéliard", "Dijon FCO"],
         teams=18, promo=2, playoff=(3, 5), rele=0, prestige=4, wealth=3),
    # ---------------- OTHER EUROPE ----------------
    dict(id=10, name="Eredivisie", short="Eredivisie", abbr="ERE", country="Netherlands", flag="nl", level=1,
         ref=("logos", "Netherlands - Eredivisie"), fixtures="nl.1", teams=18, rele=0,
         uefa=["UCL", "UCL", "UEL", "UECL"], prestige=7, wealth=5),
    dict(id=308, name="Liga Portugal Betclic", short="Liga Portugal", abbr="LPB", country="Portugal", flag="pt", level=1,
         ref=("logos", "Portugal - Liga Portugal"), fixtures="pt.1", teams=18, rele=0,
         uefa=["UCL", "UCL", "UEL", "UECL"], prestige=7, wealth=5),
    dict(id=4, name="Jupiler Pro League", short="Pro League", abbr="JPL", country="Belgium", flag="be", level=1,
         ref=("logos", "Belgium - Jupiler Pro League"), teams=18, rele=0,
         uefa=["UCL", "UEL", "UECL"], prestige=6, wealth=4),
    dict(id=50, name="William Hill Premiership", short="Scottish Premiership", abbr="SPFL", country="Scotland", flag="gb-sct", level=1,
         ref=("logos", "Scotland - Scottish Premiership"), teams=12, rele=0, rounds=3,
         uefa=["UCL", "UEL", "UECL"], prestige=5, wealth=4),
    dict(id=68, name="Trendyol Süper Lig", short="Süper Lig", abbr="SL", country="Türkiye", flag="tr", level=1,
         ref=("logos", "Türkiye - Süper Lig"), teams=18, rele=0, uefa=["UCL", "UEL", "UECL"], prestige=6, wealth=6),
    dict(id=80, name="Admiral Bundesliga", short="Austrian Bundesliga", abbr="ABL", country="Austria", flag="at", level=1,
         ref=("logos", "Austria - Bundesliga"), teams=12, rele=0, rounds=3, uefa=["UCL", "UEL", "UECL"], prestige=5, wealth=4),
    dict(id=189, name="Credit Suisse Super League", short="Swiss Super League", abbr="SSL", country="Switzerland", flag="ch", level=1,
         ref=("logos", "Switzerland - Super League"), teams=12, rele=0, rounds=3, uefa=["UCL", "UEL", "UECL"], prestige=5, wealth=4),
    dict(id=1, name="3F Superliga", short="Superliga", abbr="3F", country="Denmark", flag="dk", level=1,
         ref=("logos", "Denmark - Superliga"), teams=12, rele=0, rounds=3, uefa=["UCL", "UEL", "UECL"], prestige=5, wealth=4),
    dict(id=41, name="Eliteserien", short="Eliteserien", abbr="ELI", country="Norway", flag="no", level=1,
         ref=("logos", "Norway - Eliteserien"), teams=16, rele=0, uefa=["UCL", "UECL"], prestige=4, wealth=3),
    dict(id=56, name="Allsvenskan", short="Allsvenskan", abbr="ALL", country="Sweden", flag="se", level=1,
         ref=("logos", "Sweden - Allsvenskan"), teams=16, rele=0, uefa=["UCL", "UECL"], prestige=4, wealth=3),
    dict(id=66, name="PKO BP Ekstraklasa", short="Ekstraklasa", abbr="EKS", country="Poland", flag="pl", level=1,
         ref=("logos", "Poland - PKO BP Ekstraklasa"), teams=18, rele=0, uefa=["UCL", "UEL", "UECL"], prestige=4, wealth=3),
    dict(id=330, name="Superliga", short="SuperLiga", abbr="SLR", country="Romania", flag="ro", level=1,
         ref=("logos", "Romania - SuperLiga"), teams=16, rele=0, uefa=["UCL", "UECL"], prestige=4, wealth=3),
    dict(id=65, name="SSE Airtricity Premier Division", short="Premier Division", abbr="LOI", country="Republic of Ireland", flag="ie", level=1,
         ref=("fc26", 65), add=["Dundalk"], teams=10, rele=0, rounds=4, uefa=["UCL", "UECL"], prestige=3, wealth=2),
    # ---------------- REST OF THE WORLD ----------------
    dict(id=350, name="Roshn Saudi League", short="Saudi Pro League", abbr="RSL", country="Saudi Arabia", flag="sa", level=1,
         ref=("fc26", 350), add=["Al Diriyah", "Al Faisaly", "Abha"], teams=18, rele=0, prestige=6, wealth=9),
    dict(id=39, name="Major League Soccer", short="MLS", abbr="MLS", country="United States", flag="us", level=1,
         ref=("fc26", 39), teams=30, rele=0, conferences=True, prestige=5, wealth=6),
    dict(id=341, name="Liga MX", short="Liga MX", abbr="LMX", country="Mexico", flag="mx", level=1,
         ref=("explicit", ["Cruz Azul", "Atlante", "Toluca", "Tigres UANL", "Santos Laguna", "Pumas UNAM", "Monterrey",
                            "Club América", "FC Juárez", "Puebla FC", "Club León", "Atlas FC", "Guadalajara", "Pachuca",
                            "Atlético de San Luis", "Tijuana", "Necaxa", "Querétaro"]),
         teams=18, rele=0, prestige=5, wealth=5),
    dict(id=353, name="Liga Profesional de Fútbol", short="Liga Profesional", abbr="LPF", country="Argentina", flag="ar", level=1,
         ref=("fc26", 353), add=["Estudiantes de Río Cuarto", "Gimnasia y Esgrima de Mendoza"], teams=30, rele=0, rounds=1,
         prestige=5, wealth=3),
    dict(id=351, name="A-League Men", short="A-League", abbr="ALM", country="Australia", flag="au", level=1,
         ref=("fc26", 351), teams=12, rele=0, rounds=2, prestige=3, wealth=2),
    dict(id=83, name="K League 1", short="K League 1", abbr="KL1", country="Korea Republic", flag="kr", level=1,
         ref=("fc26", 83), add=["Bucheon 1995", "Incheon United FC"], teams=12, rele=0, rounds=3, prestige=3, wealth=3),
    dict(id=2012, name="Chinese Super League", short="CSL", abbr="CSL", country="China PR", flag="cn", level=1,
         ref=("fc26", 2012), add=["Chongqing Tonglianglong FC", "Liaoning Tieren FC"], teams=16, rele=0, prestige=3, wealth=4),
    dict(id=2149, name="Indian Super League", short="ISL", abbr="ISL", country="India", flag="in", level=1,
         ref=("fc26", 2149), add=["SC Delhi", "Inter Kashi"], teams=13, rele=0, prestige=2, wealth=2),
]

# Clubs that live in the database but have no playable domestic league (EA "Rest of World").
ROW_COUNTRY = {
    # UEFA
    "AEK Athens": "Greece", "Olympiacos FC": "Greece", "PAOK": "Greece", "Panathinaikos FC": "Greece",
    "GNK Dinamo Zagreb": "Croatia", "Hajduk Split": "Croatia", "SK Slavia Praha": "Czech Republic",
    "Sparta Praha": "Czech Republic", "Viktoria Plzeň": "Czech Republic", "Dynamo Kyiv": "Ukraine",
    "Shakhtar Donetsk": "Ukraine", "APOEL FC": "Cyprus", "Omonoia FC": "Cyprus", "Ferencvárosi Torna Club": "Hungary",
    "Qarabağ FK": "Azerbaijan", "HJK Helsinki": "Finland", "Ludogorets": "Bulgaria",
    # Other confederations
    "Al Ain": "United Arab Emirates", "Buriram United": "Thailand",
}

# UEFA 2026/27 league-phase participants (real draw pots). Names are FC 27 club names; clubs that are
# not licensed in the EA FC 27 database are listed in `unlicensed` and replaced by the best eligible club.
UEFA_2026 = {
    "UCL": dict(
        pots=[["Bayern München", "Real Madrid", "Paris Saint-Germain", "Liverpool FC", "Manchester City", "Inter Milan",
               "Arsenal FC", "FC Barcelona", "Atlético Madrid"],
              ["Borussia Dortmund", "AS Roma", "Sporting CP", "Aston Villa", "FC Porto", "Manchester United",
               "Club Brugge KV", "Real Betis Balompié", "PSV"],
              ["Feyenoord", "Lille OSC", "FK Bodø/Glimt", "SSC Napoli", "RB Leipzig", "Villarreal CF", "Fenerbahçe SK",
               "Shakhtar Donetsk", "Galatasaray SK"],
              ["SK Slavia Praha", "VfB Stuttgart", "AEK Athens", "LASK Linz", "Como", "RC Lens", "Viking FK"]],
        unlicensed=["Slovan Bratislava", "Sabah FK"]),
    "UEL": dict(
        pots=[["Bayer 04 Leverkusen", "SL Benfica", "Juventus FC", "Olympique Lyonnais", "AC Milan", "AZ Alkmaar",
               "Olympiacos FC", "Real Sociedad", "Olympique de Marseille"],
              ["Ferencvárosi Torna Club", "Viktoria Plzeň", "Union Saint-Gilloise", "GNK Dinamo Zagreb",
               "FC Red Bull Salzburg", "Celtic FC", "Sparta Praha", "Stade Rennais", "RSC Anderlecht"],
              ["AFC Bournemouth", "Crystal Palace", "SK Sturm Graz", "Lech Poznań", "Sunderland AFC",
               "Jagiellonia Białystok", "Omonoia FC"],
              ["TSG 1899 Hoffenheim", "Beşiktaş JK", "NEC Nijmegen", "Lillestrøm SK"]],
        unlicensed=["NK Celje", "SCU Torreense", "Hapoel Beer Sheva", "OFI Crete", "Levski Sofia", "Ararat-Armenia"]),
    "UECL": dict(
        pots=[["Sporting Clube de Braga", "SC Freiburg", "Cercle Brugge KSV", "Molde FK"],
              ["FC Midtjylland", "KAA Gent", "Panathinaikos FC", "Brighton & Hove Albion"],
              ["FC Lugano", "Getafe CF", "FC Twente"],
              ["Sint-Truidense VV", "SK Brann", "Heart of Midlothian FC", "Trabzonspor", "Universitatea Craiova"],
              ["Hajduk Split", "FC Nordsjælland", "Aarhus Gymnastikforening"],
              ["FC Thun", "Mjällby AIF"]],
        unlicensed=["Crvena Zvezda", "Pafos FC", "KuPS Kuopio", "Lincoln Red Imps", "Borac Banja Luka", "Kairat Almaty",
                    "RFS Riga", "FK Jablonec", "Inter Club d'Escaldes", "CSKA Sofia", "Kauno Žalgiris", "Iberia 1999",
                    "KF Egnatia"]),
}

# 2025/26 honours (real) used for season-one super cups and "holder" markers.
HOLDERS_2026 = {
    "UCL": "Paris Saint-Germain",
    "ENG1": "Arsenal FC", "FACUP": "Manchester City",
    "ESP1": "FC Barcelona", "CDR": "Real Sociedad",
    "GER1": "Bayern München", "DFB": "Bayern München",
    "ITA1": "Inter Milan", "CI": "Inter Milan",
    "FRA1": "Paris Saint-Germain", "CDF": "RC Lens",
    "NED1": "PSV", "POR1": "FC Porto",
}

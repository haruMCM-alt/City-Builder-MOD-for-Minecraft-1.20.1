"""
Geography of the simulator world, modelled on four real airports and their cities:

    id 1  Tokyo  Haneda     (RJTT / HND)  home airport, world origin
    id 2  Osaka  Kansai     (RJBB / KIX)  offshore island in Osaka Bay
    id 3  Sapporo New Chitose (RJCC / CTS) inland Hokkaido, volcanoes to the west
    id 4  Okinawa Naha      (ROAH / OKA)  island airport, coral sea around

The simulator flies every airport's main runway along its local x axis (the ground movement
logic was written for that), so each airport has its own "north": the compass heading of the
world -z axis near it.  Headings, the ILS courses and the runway names are therefore the real
ones; between the airports the compass blends from one airport's north to the next (the web
code does that, web/js/geo_data.js + util.js).

Distances between the airports are compressed (flight time ~25-40 min) but the bearings from
Tokyo are the real ones.  Near each airport the coast, bays, islands, mountains, city
districts and landmarks are placed from real latitude / longitude, in kilometres east / north
of the airport, rotated into the world frame with that airport's north.

    python3 geo.py            -> web/js/geo_data.js  (+ blender/output/geo_map.png debug map)

World frame: three.js x east-ish, z "south-ish" (the true directions depend on the local
north), metres.  Blender frame of an airport: x = three x - ox, y = -(three z - oz).
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_JS = os.path.join(HERE, "..", "web", "js")

# ---------------------------------------------------------------------------------------------
# airports.  north: compass heading of the world -z axis near the airport (deg).  The main
# runway lies along world x; 'k27' is the runway flown towards -x, 'k09' towards +x.
#   heading(towards -x) = 270 + north, heading(towards +x) = 90 + north
# The terminal side of every layout is local +y (world -z): compass = north.
# ---------------------------------------------------------------------------------------------
AIRPORTS = [
    dict(id=1, key="HND", icao="RJTT", name="Tokyo Haneda", jp="東京（羽田）", city="Tokyo", north=247.0,
         lat=35.5494, lon=139.7798, rwy=dict(len=3360, wid=60, k27="16L", k09="34R"),
         ils=dict(k27="111.50", k09="110.10"), elev=0),
    dict(id=2, key="KIX", icao="RJBB", name="Osaka Kansai", jp="大阪（関西）", city="Osaka", north=148.0,
         lat=34.4320, lon=135.2304, rwy=dict(len=3500, wid=60, k27="06R", k09="24L"),
         ils=dict(k27="109.90", k09="111.90"), elev=0),
    dict(id=3, key="CTS", icao="RJCC", name="Sapporo New Chitose", jp="札幌（新千歳）", city="Sapporo", north=98.0,
         lat=42.7752, lon=141.6923, rwy=dict(len=3000, wid=60, k27="01R", k09="19L"),
         ils=dict(k27="110.70", k09="111.70"), elev=0),
    dict(id=4, key="OKA", icao="ROAH", name="Okinawa Naha", jp="沖縄（那覇）", city="Naha", north=91.0,
         lat=26.1958, lon=127.6459, rwy=dict(len=3000, wid=45, k27="36R", k09="18L"),
         ils=dict(k27="110.50", k09="109.10"), elev=0),
]
# compressed distances from Tokyo (km) at the real bearings
PLACE = {2: (256.0, 260.0), 3: (20.0, 330.0), 4: (237.0, 420.0)}


def rot_local_to_world(E, N, north):
    """(east, north) metres relative to an airport -> world (dx, dz)."""
    c, s = math.cos(math.radians(north)), math.sin(math.radians(north))
    x = E * c - N * s
    n2 = N * c + E * s
    return x, -n2


def world_to_local(dx, dz, north):
    c, s = math.cos(math.radians(north)), math.sin(math.radians(north))
    n2 = -dz
    # inverse rotation
    E = dx * c + n2 * s
    N = -dx * s + n2 * c
    return E, N


AP = {a["id"]: a for a in AIRPORTS}
AP[1]["x"], AP[1]["z"] = 0.0, 0.0
for i, (brg, km) in PLACE.items():
    E, N = km * 1000 * math.sin(math.radians(brg)), km * 1000 * math.cos(math.radians(brg))
    x, z = rot_local_to_world(E, N, AP[1]["north"])
    AP[i]["x"], AP[i]["z"] = round(x), round(z)


def ll_to_EN(ap, lat, lon):
    """real lat / lon -> km east / north of the airport (equirectangular, fine for < 100 km)"""
    N = (lat - ap["lat"]) * 111.2
    E = (lon - ap["lon"]) * 111.2 * math.cos(math.radians(ap["lat"]))
    return E, N


def world(apid, E_km, N_km):
    """km east / north of airport apid -> world (x, z) metres"""
    ap = AP[apid]
    dx, dz = rot_local_to_world(E_km * 1000, N_km * 1000, ap["north"])
    return ap["x"] + dx, ap["z"] + dz


def world_ll(apid, lat, lon):
    return world(apid, *ll_to_EN(AP[apid], lat, lon))


def local_xy(apid, E_km, N_km):
    """km east / north -> the airport's Blender frame (x along the runway, y to the terminal)"""
    x, z = world(apid, E_km, N_km)
    return x - AP[apid]["x"], -(z - AP[apid]["z"])


def local_ll(apid, lat, lon):
    return local_xy(apid, *ll_to_EN(AP[apid], lat, lon))


def poly(apid, pts_km):
    out = []
    for (E, N) in pts_km:
        x, z = world(apid, E, N)
        out.append((round(x), round(z)))
    return out


# ---------------------------------------------------------------------------------------------
# land, water (bays / lakes / straits cut out of the land) and islands (added back)
#   polygons in km east / north of the given airport
# ---------------------------------------------------------------------------------------------
LAND = [
    # Kanto (Tokyo region): Boso and Miura peninsulas, Sagami coast, the plain inland
    (1, [(-170, -30), (-95, -30), (-60, -30), (-35, -35), (-18, -38), (-10, -44), (-3, -38), (3, -44), (12, -48),
         (28, -52), (42, -40), (48, -20), (58, 10), (60, 60), (20, 120), (-60, 140), (-170, 120)]),
    # Honshu between Kanto and Kinki (in Tokyo's frame)
    (1, [(-150, -32), (-200, -48), (-240, -70), (-262, -95), (-300, -110), (-360, -60), (-360, 140), (-220, 180), (-120, 130)]),
    # Tohoku towards Hokkaido (Tokyo's frame)
    (1, [(20, 60), (55, 40), (80, 90), (110, 170), (112, 245), (92, 262), (60, 250), (20, 180), (-40, 110)]),
    # Kinki (Osaka region) around Osaka Bay, Awaji, Kii peninsula
    (2, [(-70, -40), (-40, -25), (-10, -22), (0, -35), (15, -48), (60, -60), (95, -20), (95, 60), (40, 90), (-40, 80),
         (-90, 60), (-100, 0)]),
    # Hokkaido (Chitose's frame): Ishikari plain, Oshima peninsula to the south-west
    (3, [(-150, -60), (-110, -85), (-95, -55), (-70, -35), (-45, -24), (-15, -19), (10, -20), (40, -24), (90, -12),
         (150, 30), (130, 140), (40, 180), (-40, 140), (-75, 60), (-110, 40), (-160, 10)]),
    # Okinawa main island (Naha's frame; the north is shortened)
    (4, [(0.9, -3.2), (0.7, 2.0), (2.5, 6.0), (6.5, 9.5), (10.5, 13.0), (8.0, 20.0), (7.5, 23.0), (14.0, 30.0),
         (24.0, 38.0), (31.0, 42.0), (27.5, 50.0), (30.0, 57.0), (44.0, 64.0), (58.0, 70.0), (61.5, 64.0), (49.0, 53.0),
         (39.0, 44.0), (30.0, 32.0), (27.0, 27.0), (22.0, 18.0), (20.0, 10.5), (17.0, 3.0), (17.0, -4.0), (11.0, -9.0),
         (5.4, -13.0), (2.2, -9.5)]),
]
WATER = [
    # Tokyo Bay (the airport's own reclaimed land is a flat zone and stays dry)
    (1, [(1.8, -1.2), (1.2, 3.0), (0.2, 6.5), (0.6, 9.0), (3.0, 10.8), (7.0, 12.0), (12.0, 13.2), (17.5, 14.5),
         (24.0, 11.0), (30.0, 5.0), (26.5, -4.0), (19.0, -11.5), (13.5, -18.0), (6.0, -22.0), (2.5, -27.0), (-2.5, -30.5),
         (-7.0, -28.0), (-10.5, -18.0), (-12.0, -10.5), (-9.0, -7.0), (-5.0, -4.3), (-2.0, -2.8)]),
    # Uraga channel and the outer bay to the Pacific
    (1, [(2.5, -26.0), (-2.5, -30.5), (-7.5, -40.0), (-4.0, -52.0), (10.0, -52.0), (6.0, -38.0)]),
    # Sagami Bay
    (1, [(-10, -44), (-20, -37), (-40, -35), (-62, -31), (-70, -45), (-40, -60), (-12, -55)]),
    # Osaka Bay (Awaji island is the western shore)
    (2, [(-7.5, -11.5), (-2.0, -7.5), (3.2, -4.5), (6.2, -2.9), (9.0, -0.2), (12.7, 2.7), (17.0, 9.0), (20.5, 15.0),
         (18.2, 22.8), (15.0, 29.0), (9.0, 31.3), (-4.0, 27.8), (-20.5, 23.8), (-21.5, 17.0), (-20.5, 8.0), (-21.5, -2.0),
         (-24.5, -10.0), (-20.0, -15.0), (-14.0, -16.5)]),
    # Kii channel (between Awaji and Wakayama) out to the open sea
    (2, [(-14.0, -16.5), (-6.5, -19.5), (-5.0, -30.0), (-35.0, -45.0), (-75.0, -38.0), (-45.0, -18.0), (-24.5, -10.0)]),
    # Harima Nada west of Awaji
    (2, [(-21.0, 24.5), (-26.0, 20.0), (-28.0, 5.0), (-33.0, -12.0), (-60.0, -12.0), (-95.0, 10.0), (-80.0, 40.0), (-40.0, 32.0)]),
    # Lake Shikotsu (caldera lake west of Chitose)
    (3, [(-24.0, -1.0), (-26.0, 2.5), (-30.0, 3.5), (-34.0, 1.5), (-35.0, -2.5), (-31.5, -5.5), (-27.0, -5.0)]),
    # Ishikari Bay
    (3, [(-75, 45), (-45, 50), (-24, 54), (-28, 80), (-90, 70)]),
    # Tsugaru strait between Honshu and Hokkaido (in Tokyo's frame: the airports' norths differ,
    # so the strait sits across the land bridge, not at Hokkaido's local south)
    (1, [(-120, 225), (230, 175), (260, 228), (-100, 272)]),
]
ISLANDS = [
    # Kerama islands west of Naha
    (4, [(-33, -1), (-30, -3), (-28, 0), (-31, 2)]),
    (4, [(-37, 3), (-35, 2), (-34, 4.5), (-36, 5)]),
    # Awaji already belongs to Kinki; small islands in Osaka Bay are airport flats
]

# mountains: (airport frame, E km, N km, height m, radius km, shape) shape 'cone' | 'ridge'
PEAKS = [
    (1, -95.0, -21.0, 3776, 13.0, "cone"),      # Mt Fuji
    (1, -62.0, -18.0, 1300, 12.0, "ridge"),     # Hakone / Tanzawa
    (1, -75.0, 5.0, 1700, 22.0, "ridge"),       # Tanzawa - Chichibu
    (1, -85.0, 45.0, 2000, 30.0, "ridge"),      # Chichibu mountains
    (1, -40.0, 30.0, 600, 14.0, "ridge"),       # Tama hills / Okutama foothills
    (1, 25.0, -38.0, 350, 14.0, "ridge"),       # Boso hills
    (1, 70.0, 110.0, 1600, 30.0, "ridge"),      # Nikko / northern Kanto
    (1, -230.0, 30.0, 2500, 40.0, "ridge"),     # Japan Alps (between the regions)
    (2, 1.5, 37.0, 930, 9.0, "ridge"),          # Rokko
    (2, -8.0, 38.0, 700, 9.0, "ridge"),         # Rokko west
    (2, 41.0, 27.0, 640, 8.0, "ridge"),         # Ikoma
    (2, 40.0, -1.5, 1125, 9.0, "ridge"),        # Kongo
    (2, 15.0, -10.0, 800, 11.0, "ridge"),       # Izumi mountains
    (2, 40.0, -45.0, 1500, 30.0, "ridge"),      # Kii mountains
    (2, -28.0, -2.0, 450, 7.0, "ridge"),        # Awaji hills
    (3, -33.7, 1.7, 1320, 5.0, "cone"),         # Mt Eniwa
    (3, -25.5, -9.4, 1041, 5.5, "cone"),        # Mt Tarumae
    (3, -40.0, -6.0, 1000, 9.0, "ridge"),       # Shikotsu caldera rim
    (3, -72.0, 6.0, 1898, 7.5, "cone"),         # Mt Yotei ("Ezo Fuji")
    (3, -55.0, 30.0, 1100, 14.0, "ridge"),      # mountains west of Sapporo
    (3, 60.0, 60.0, 1400, 35.0, "ridge"),       # Hidaka / central Hokkaido
    (4, 8.0, 2.3, 120, 2.0, "ridge"),           # Shuri hill
    (4, 12.0, 8.0, 150, 5.0, "ridge"),          # southern hills
    (4, 40.0, 58.0, 450, 10.0, "ridge"),        # Yanbaru (north)
]

# ---------------------------------------------------------------------------------------------
# cities: districts (lat, lon, radius km, density 0..1, height range m, style) and landmarks
# styles: 'tokyo' glass / office towers, 'osaka', 'sapporo' (snowy roofs, grid), 'naha'
# (white concrete with rooftop water tanks)
# ---------------------------------------------------------------------------------------------
CITIES = {
    1: dict(style="tokyo", fill=dict(lat=35.66, lon=139.70, r=28.0, h=(8, 45), dens=0.92), districts=[
        dict(n="Marunouchi", lat=35.6812, lon=139.7671, r=1.4, h=(120, 250), dens=1.0),
        dict(n="Shiodome", lat=35.6646, lon=139.7600, r=0.9, h=(110, 215), dens=1.0),
        dict(n="Shinjuku", lat=35.6909, lon=139.6922, r=1.3, h=(130, 243), dens=1.0),
        dict(n="Shibuya", lat=35.6580, lon=139.7016, r=0.9, h=(60, 230), dens=0.95),
        dict(n="Roppongi", lat=35.6604, lon=139.7292, r=0.9, h=(90, 248), dens=0.9),
        dict(n="Shinagawa", lat=35.6285, lon=139.7387, r=1.0, h=(80, 160), dens=0.95),
        dict(n="Ikebukuro", lat=35.7295, lon=139.7109, r=0.9, h=(60, 240), dens=0.9),
        dict(n="Odaiba", lat=35.6264, lon=139.7755, r=1.2, h=(30, 120), dens=0.6),
        dict(n="Minato Mirai", lat=35.4560, lon=139.6320, r=1.1, h=(80, 296), dens=0.9),
        dict(n="Musashi-Kosugi", lat=35.5763, lon=139.6596, r=0.7, h=(120, 200), dens=0.8),
        dict(n="Makuhari", lat=35.6485, lon=140.0400, r=1.2, h=(60, 180), dens=0.8),
        dict(n="Yokohama", lat=35.4660, lon=139.6220, r=3.5, h=(15, 70), dens=0.95),
        dict(n="Kawasaki", lat=35.5310, lon=139.6970, r=2.5, h=(12, 60), dens=0.95),
        dict(n="Chiba", lat=35.6070, lon=140.1060, r=3.0, h=(10, 60), dens=0.85),
    ], landmarks=[
        dict(k="skytree", lat=35.7101, lon=139.8107),
        dict(k="tokyotower", lat=35.6586, lon=139.7454),
        dict(k="rainbowbridge", lat=35.6365, lon=139.7630),
        dict(k="landmarktower", lat=35.4547, lon=139.6317),
        dict(k="baybridge", lat=35.4570, lon=139.6750),
        dict(k="aqualine", lat=35.4700, lon=139.8900),
    ], industry=[dict(lat=35.51, lon=139.74, r=3.0), dict(lat=35.57, lon=140.07, r=4.0), dict(lat=35.49, lon=139.68, r=2.0)]),
    2: dict(style="osaka", fill=dict(lat=34.66, lon=135.50, r=22.0, h=(8, 40), dens=0.9), districts=[
        dict(n="Umeda", lat=34.7025, lon=135.4959, r=1.2, h=(120, 200), dens=1.0),
        dict(n="Namba", lat=34.6655, lon=135.5010, r=1.0, h=(60, 150), dens=1.0),
        dict(n="Tennoji", lat=34.6460, lon=135.5130, r=0.8, h=(50, 300), dens=0.9),
        dict(n="Nakanoshima", lat=34.6930, lon=135.4900, r=0.8, h=(80, 200), dens=0.95),
        dict(n="Kobe", lat=34.6950, lon=135.1950, r=2.0, h=(20, 120), dens=0.9),
        dict(n="Sakai", lat=34.5733, lon=135.4830, r=2.5, h=(12, 60), dens=0.85),
        dict(n="Rinku", lat=34.4100, lon=135.2990, r=1.0, h=(10, 40), dens=0.6),
        dict(n="Wakayama", lat=34.2300, lon=135.1700, r=2.5, h=(10, 40), dens=0.8),
    ], landmarks=[
        dict(k="harukas", lat=34.6460, lon=135.5140),
        dict(k="umedasky", lat=34.7053, lon=135.4904),
        dict(k="osakacastle", lat=34.6873, lon=135.5262),
        dict(k="rinkugate", lat=34.4105, lon=135.2995),
        dict(k="skygatebridge", lat=34.4200, lon=135.2650),
        dict(k="cosmotower", lat=34.6380, lon=135.4140),
        dict(k="akashibridge", lat=34.6160, lon=135.0210),
    ], industry=[dict(lat=34.60, lon=135.43, r=3.0), dict(lat=34.52, lon=135.42, r=2.5)]),
    3: dict(style="sapporo", fill=dict(lat=43.05, lon=141.35, r=11.0, h=(6, 30), dens=0.85), districts=[
        dict(n="Sapporo station", lat=43.0687, lon=141.3508, r=0.9, h=(60, 173), dens=1.0),
        dict(n="Odori", lat=43.0605, lon=141.3540, r=0.9, h=(40, 110), dens=1.0),
        dict(n="Susukino", lat=43.0550, lon=141.3530, r=0.7, h=(30, 90), dens=1.0),
        dict(n="Chitose", lat=42.8210, lon=141.6510, r=2.2, h=(6, 30), dens=0.7),
        dict(n="Eniwa", lat=42.8830, lon=141.5770, r=2.0, h=(6, 25), dens=0.6),
        dict(n="Tomakomai", lat=42.6340, lon=141.6050, r=3.0, h=(6, 40), dens=0.7),
        dict(n="Kitahiroshima", lat=42.9860, lon=141.5630, r=1.8, h=(6, 25), dens=0.6),
    ], landmarks=[
        dict(k="tvtower", lat=43.0610, lon=141.3565),
        dict(k="jrtower", lat=43.0680, lon=141.3510),
        dict(k="clocktower", lat=43.0626, lon=141.3536),
    ], industry=[dict(lat=42.63, lon=141.68, r=3.5)]),
    4: dict(style="naha", fill=dict(lat=26.25, lon=127.72, r=12.0, h=(6, 30), dens=0.9), districts=[
        dict(n="Kokusai-dori", lat=26.2150, lon=127.6850, r=1.0, h=(15, 45), dens=1.0),
        dict(n="Shintoshin", lat=26.2230, lon=127.6960, r=1.0, h=(25, 90), dens=0.95),
        dict(n="Urasoe", lat=26.2460, lon=127.7220, r=2.0, h=(8, 40), dens=0.9),
        dict(n="Ginowan", lat=26.2810, lon=127.7780, r=2.5, h=(8, 35), dens=0.8),
        dict(n="Okinawa city", lat=26.3340, lon=127.8050, r=2.5, h=(8, 30), dens=0.8),
        dict(n="Chatan", lat=26.3140, lon=127.7580, r=1.2, h=(10, 40), dens=0.8),
        dict(n="Nago", lat=26.5920, lon=127.9770, r=1.8, h=(6, 30), dens=0.6),
        dict(n="Itoman", lat=26.1240, lon=127.6690, r=1.6, h=(6, 25), dens=0.6),
    ], landmarks=[
        dict(k="shuri", lat=26.2170, lon=127.7195),
        dict(k="monorail", lat=26.2100, lon=127.6700),
    ], industry=[dict(lat=26.22, lon=127.67, r=1.0)]),
}

# terrain flat zones (airport frame Blender coordinates: x along the runway, y to the terminal)
#   hard=True: sea wall (island airports), else a 3 km blend into the natural terrain
FLATS = {
    1: [dict(x0=-2700, x1=3200, y0=-1500, y1=2900, hard=False),          # C / A runways, terminals, cargo
        dict(x0=-3400, x1=-1600, y0=-4300, y1=-1400, hard=True)],        # D runway island in the bay
    2: [dict(x0=-2600, x1=2600, y0=-780, y1=1150, hard=True),            # island 1 (runway A, T1)
        dict(x0=-2900, x1=2900, y0=-3050, y1=-1750, hard=True),          # island 2 (runway B)
        dict(x0=-400, x1=400, y0=-1780, y1=-760, hard=True)],            # link between the islands
    3: [dict(x0=-3000, x1=3000, y0=-1900, y1=1600, hard=False)],
    4: [dict(x0=-2600, x1=2600, y0=-500, y1=1500, hard=False),           # runway 18L/36R, terminal
        dict(x0=-2400, x1=2400, y0=-1700, y1=-460, hard=True)],          # reclaimed runway 18R/36L
}

# secondary runways (visual + flat), airport frame: centre x, y, heading (compass), length, width, name pair
EXTRA_RWYS = {
    1: [dict(cx=150, cy=1700, hdg=337, len=3000, wid=60, names=("34L", "16R")),
        dict(cx=-2150, cy=900, hdg=40, len=2500, wid=60, names=("04", "22")),
        dict(cx=-2500, cy=-2850, hdg=50, len=2500, wid=60, names=("05", "23"))],
    2: [dict(cx=0, cy=-2400, hdg=58, len=4000, wid=60, names=("06L", "24R"))],
    3: [dict(cx=0, cy=-1350, hdg=8, len=3000, wid=60, names=("01L", "19R"))],
    4: [dict(cx=0, cy=-1150, hdg=1, len=2700, wid=60, names=("36L", "18R"))],
}

# AI traffic: intensity (relative, sets the turnaround pace), the number of contact stands, the
# share of the flights from Haneda (Haneda - New Chitose is Japan's busiest route, then Naha,
# then Kansai) and the real daily movements (arrivals + departures, approx.)
TRAFFIC = {1: dict(rate=1.0, stands=14, route=0.0, movements=1250),
           2: dict(rate=0.55, stands=7, route=0.22, movements=560),
           3: dict(rate=0.5, stands=7, route=0.46, movements=420),
           4: dict(rate=0.5, stands=7, route=0.32, movements=450)}


def city_local(apid, lat, lon):
    return local_ll(apid, lat, lon)


def export_js():
    data = dict(
        airports=[dict(id=a["id"], key=a["key"], icao=a["icao"], name=a["name"], jp=a["jp"], city=a["city"],
                       north=a["north"], x=a["x"], z=a["z"], lat=a["lat"], rwy=a["rwy"], ils=a["ils"]) for a in AIRPORTS],
        land=[poly(i, p) for (i, p) in LAND],
        water=[poly(i, p) for (i, p) in WATER],
        islands=[poly(i, p) for (i, p) in ISLANDS],
        peaks=[[*map(round, world(i, E, N)), h, r * 1000, 1 if shape == "cone" else 0] for (i, E, N, h, r, shape) in PEAKS],
        flats=[dict(ap=i, x0=AP[i]["x"] + f["x0"], x1=AP[i]["x"] + f["x1"], z0=AP[i]["z"] - f["y1"], z1=AP[i]["z"] - f["y0"],
                    hard=f["hard"]) for i, fl in FLATS.items() for f in fl],
        extraRunways={i: [dict(r, cx=r["cx"], cy=r["cy"]) for r in v] for i, v in EXTRA_RWYS.items()},
        traffic=TRAFFIC,
        # urban fabric for the terrain shader: world x, z, radius (m), density, city id
        urban=[[*map(round, world_ll(i, d["lat"], d["lon"])), round(d["r"] * 1000 * k), d["dens"] * f, i]
               for i, c in CITIES.items() for (d, k, f) in [(c["fill"], 1.0, 0.6)] + [(d, 1.8, 1.0) for d in c["districts"]]],
        # reef: shallow coral shelf around Okinawa (world x, z, radius)
        reef=[round(AP[4]["x"]), round(AP[4]["z"]), 90000],
    )
    js = ("// generated by blender/geo.py - do not edit (python3 blender/geo.py)\n"
          "export const GEO = " + json.dumps(data, separators=(",", ":")) + ";\n")
    with open(os.path.join(WEB_JS, "geo_data.js"), "w") as fh:
        fh.write(js)
    print("wrote geo_data.js", len(js) // 1024, "KiB")
    return data


# ---- a Python copy of the terrain mask (for the debug map and the Blender builders) ---------
def _pip(x, z, P):
    inside = False
    n = len(P)
    j = n - 1
    for i in range(n):
        xi, zi = P[i]
        xj, zj = P[j]
        if ((zi > z) != (zj > z)) and (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def is_land(x, z, data=None):
    d = data or GEO_DATA
    for f in d["flats"]:
        if f["x0"] <= x <= f["x1"] and f["z0"] <= z <= f["z1"]:
            return True
    for P in d["islands"]:
        if _pip(x, z, P):
            return True
    if any(_pip(x, z, P) for P in d["water"]):
        return False
    return any(_pip(x, z, P) for P in d["land"])


GEO_DATA = None


def debug_map(data, path):
    from PIL import Image, ImageDraw
    xs = [data["airports"][i]["x"] for i in range(4)]
    zs = [data["airports"][i]["z"] for i in range(4)]
    x0, x1 = min(xs) - 150000, max(xs) + 150000
    z0, z1 = min(zs) - 150000, max(zs) + 150000
    W = 900
    s = W / (x1 - x0)
    H = int((z1 - z0) * s)
    img = Image.new("RGB", (W, H), (20, 50, 90))
    px = img.load()
    for j in range(0, H, 2):
        for i in range(0, W, 2):
            x = x0 + i / s
            z = z0 + j / s
            if is_land(x, z, data):
                for a in range(2):
                    for b in range(2):
                        if i + a < W and j + b < H:
                            px[i + a, j + b] = (90, 120, 70)
    dr = ImageDraw.Draw(img)
    for a in data["airports"]:
        cx, cz = (a["x"] - x0) * s, (a["z"] - z0) * s
        dr.ellipse((cx - 4, cz - 4, cx + 4, cz + 4), fill=(255, 60, 60))
        dr.text((cx + 6, cz - 6), a["key"], fill=(255, 255, 255))
        # local north arrow (world direction of compass 0)
        nx, nz = rot_local_to_world(0, 20000, a["north"])
        dr.line((cx, cz, cx + nx * s, cz + nz * s), fill=(255, 255, 0), width=2)
    for p in data["peaks"]:
        cx, cz = (p[0] - x0) * s, (p[1] - z0) * s
        dr.ellipse((cx - 2, cz - 2, cx + 2, cz + 2), fill=(200, 200, 200))
    img.save(path)
    print("map", path, W, H)


def zoom_map(data, apid, half_km, path, W=700):
    from PIL import Image, ImageDraw
    a = AP[apid]
    x0, z0 = a["x"] - half_km * 1000, a["z"] - half_km * 1000
    s = W / (2 * half_km * 1000)
    img = Image.new("RGB", (W, W), (20, 50, 90))
    px = img.load()
    for j in range(W):
        for i in range(W):
            if is_land(x0 + i / s, z0 + j / s, data):
                px[i, j] = (90, 120, 70)
    dr = ImageDraw.Draw(img)
    cx, cz = (a["x"] - x0) * s, (a["z"] - z0) * s
    L = a["rwy"]["len"] / 2 * s
    dr.line((cx - L, cz, cx + L, cz), fill=(255, 255, 255), width=2)
    nx, nz = rot_local_to_world(0, half_km * 300, a["north"])
    dr.line((cx, cz, cx + nx * s, cz + nz * s), fill=(255, 255, 0), width=2)
    dr.text((cx + nx * s, cz + nz * s), "N", fill=(255, 255, 0))
    c = CITIES[apid]
    for d in c["districts"]:
        x, z = world_ll(apid, d["lat"], d["lon"])
        dr.ellipse(((x - x0) * s - 3, (z - z0) * s - 3, (x - x0) * s + 3, (z - z0) * s + 3), fill=(255, 200, 80))
    for d in c["landmarks"]:
        x, z = world_ll(apid, d["lat"], d["lon"])
        dr.text(((x - x0) * s + 4, (z - z0) * s), d["k"], fill=(255, 255, 255))
    img.save(path)


if __name__ == "__main__":
    GEO_DATA = export_js()
    out = os.path.join(HERE, "output")
    os.makedirs(out, exist_ok=True)
    debug_map(GEO_DATA, os.path.join(out, "geo_map.png"))
    for i, k in ((1, 60), (2, 50), (3, 70), (4, 40)):
        zoom_map(GEO_DATA, i, k, os.path.join(out, "geo_zoom%d.png" % i))
    for a in AIRPORTS:
        print(a["key"], a["x"], a["z"], "north", a["north"], "runways", a["rwy"]["k27"], "/", a["rwy"]["k09"])
else:
    # importers (Blender builders) get the data without writing files
    GEO_DATA = dict(
        airports=[dict(id=a["id"], x=a["x"], z=a["z"], north=a["north"], rwy=a["rwy"], key=a["key"]) for a in AIRPORTS],
        land=[poly(i, p) for (i, p) in LAND], water=[poly(i, p) for (i, p) in WATER],
        islands=[poly(i, p) for (i, p) in ISLANDS],
        peaks=[[*map(round, world(i, E, N)), h, r * 1000, 1 if shape == "cone" else 0] for (i, E, N, h, r, shape) in PEAKS],
        flats=[dict(ap=i, x0=AP[i]["x"] + f["x0"], x1=AP[i]["x"] + f["x1"], z0=AP[i]["z"] - f["y1"], z1=AP[i]["z"] - f["y0"],
                    hard=f["hard"]) for i, fl in FLATS.items() for f in fl],
    )

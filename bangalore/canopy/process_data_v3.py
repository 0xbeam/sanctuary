import json
from collections import Counter

# ── Load raw data ──
with open('/home/user/workspace/trees_meta.json') as f:
    trees_raw = json.load(f)['elements']
with open('/home/user/workspace/parks_meta.json') as f:
    parks_raw = json.load(f)['elements']
with open('/home/user/workspace/water_meta.json') as f:
    water_raw = json.load(f)['elements']

# ── Species classification ──
def classify_tree(tags):
    """Classify a tree by species from OSM tags."""
    species = (tags.get('species', '') or tags.get('genus', '') or
               tags.get('taxon', '') or tags.get('species:en', '') or '').lower()
    name = (tags.get('name', '') or tags.get('name:en', '') or '').lower()
    leaf = (tags.get('leaf_type', '') or '').lower()

    text = species + ' ' + name

    # Specific species matching
    if 'tabebuia' in text or 't. rosea' in text or 'rosea' in species:
        return 'tabebuia'
    if 'delonix' in text or 'gulmohar' in text or 'flame' in text:
        return 'gulmohar'
    if 'roystonea' in text or 'palm' in text or 'cocos' in text or 'nucifera' in text or 'arecanut' in text or 'areca' in text:
        return 'palm'
    if 'ficus' in text or 'banyan' in text or 'peepal' in text or 'religiosa' in text or 'benghalensis' in text:
        return 'ficus'
    if 'grevillea' in text or 'silver oak' in text or 'silveroak' in text:
        return 'silveroak'
    if 'pinus' in text or 'conifer' in text or 'cypress' in text or 'needleleaved' in leaf:
        return 'conifer'
    if 'spathodea' in text or 'tulip' in text or 'campanulata' in text:
        return 'tulip'
    if 'albizia' in text or 'samanea' in text or 'rain tree' in text or 'raintree' in text or 'saman' in species:
        return 'raintree'
    if 'azadirachta' in text or 'neem' in text:
        return 'neem'
    if 'mangifera' in text or 'mango' in text:
        return 'mango'
    if 'jacaranda' in text:
        return 'jacaranda'
    if 'pongamia' in text or 'honge' in text:
        return 'pongamia'
    if 'swietenia' in text or 'mahogany' in text:
        return 'mahogany'
    if 'millingtonia' in text or 'cork' in text:
        return 'cork'
    if 'broadleaved' in leaf or 'broadleaved' in species:
        return 'broad'

    return 'u'

def get_year(element):
    """Extract the year an element was added to OSM."""
    ts = element.get('timestamp', '')
    if ts and len(ts) >= 4:
        return int(ts[:4])
    return 2020  # fallback

# ── Process trees ──
trees = []
species_counts = Counter()
year_counts_trees = Counter()

for el in trees_raw:
    lat = el.get('lat')
    lon = el.get('lon')
    if lat is None or lon is None:
        continue

    tags = el.get('tags', {})
    cat = classify_tree(tags)
    year = get_year(el)

    species_counts[cat] += 1
    year_counts_trees[year] += 1

    # [lat, lon, species, year]
    trees.append([round(lat, 5), round(lon, 5), cat, year])

print(f"Trees processed: {len(trees)}")
print(f"Species distribution: {dict(species_counts.most_common())}")
print(f"Tree years: {dict(sorted(year_counts_trees.items()))}")

# ── Process parks (ways + relations with geometry) ──
parks = []
park_names = []
year_counts_parks = Counter()
seen_park_ids = set()

for el in parks_raw:
    eid = (el['type'], el['id'])
    if eid in seen_park_ids:
        continue
    seen_park_ids.add(eid)

    year = get_year(el)
    year_counts_parks[year] += 1
    name = el.get('tags', {}).get('name', '')

    if el['type'] == 'way' and 'geometry' in el:
        coords = [[round(n['lat'], 5), round(n['lon'], 5)] for n in el['geometry']]
        if len(coords) >= 3:
            parks.append({'c': coords, 'y': year})
            park_names.append(name)
    elif el['type'] == 'relation' and 'members' in el:
        # Extract outer ring from relation
        for member in el.get('members', []):
            if member.get('role') in ('outer', '') and 'geometry' in member:
                coords = [[round(n['lat'], 5), round(n['lon'], 5)] for n in member['geometry']]
                if len(coords) >= 3:
                    parks.append({'c': coords, 'y': year})
                    park_names.append(name)
                    break

print(f"\nParks processed: {len(parks)}")
print(f"Park years: {dict(sorted(year_counts_parks.items()))}")

# ── Process water (ways + relations with geometry) ──
water = []
water_names = []
year_counts_water = Counter()
seen_water_ids = set()

for el in water_raw:
    eid = (el['type'], el['id'])
    if eid in seen_water_ids:
        continue
    seen_water_ids.add(eid)

    year = get_year(el)
    year_counts_water[year] += 1
    name = el.get('tags', {}).get('name', '')

    if el['type'] == 'way' and 'geometry' in el:
        coords = [[round(n['lat'], 5), round(n['lon'], 5)] for n in el['geometry']]
        if len(coords) >= 3:
            water.append({'c': coords, 'y': year})
            water_names.append(name)
    elif el['type'] == 'relation' and 'members' in el:
        for member in el.get('members', []):
            if member.get('role') in ('outer', '') and 'geometry' in member:
                coords = [[round(n['lat'], 5), round(n['lon'], 5)] for n in member['geometry']]
                if len(coords) >= 3:
                    water.append({'c': coords, 'y': year})
                    water_names.append(name)
                    break

print(f"\nWater processed: {len(water)}")
print(f"Water years: {dict(sorted(year_counts_water.items()))}")

# ── Build cumulative timeline data ──
# For the slider: show cumulative counts per year
all_years = set()
for d in [year_counts_trees, year_counts_parks, year_counts_water]:
    all_years.update(d.keys())

min_year = min(all_years)
max_year = max(all_years)

timeline = {}
cum_t, cum_p, cum_w = 0, 0, 0
for y in range(min_year, max_year + 1):
    cum_t += year_counts_trees.get(y, 0)
    cum_p += year_counts_parks.get(y, 0)
    cum_w += year_counts_water.get(y, 0)
    timeline[y] = {'t': cum_t, 'p': cum_p, 'w': cum_w}

print(f"\nTimeline range: {min_year} - {max_year}")
print("Timeline sample:")
for y in sorted(timeline.keys()):
    t = timeline[y]
    print(f"  {y}: trees={t['t']}, parks={t['p']}, water={t['w']}")

# ── Output data.json ──
output = {
    "m": {
        "trees": len(trees),
        "parks": len(parks),
        "water": len(water),
        "yearMin": min_year,
        "yearMax": max_year,
    },
    "timeline": timeline,
    "t": trees,        # [lat, lon, species, year]
    "p": [p['c'] for p in parks],
    "py": [p['y'] for p in parks],  # park years
    "pn": park_names,
    "w": [w['c'] for w in water],
    "wy": [w['y'] for w in water],  # water years
    "wn": water_names,
}

outpath = '/home/user/workspace/bangalore-viz/data.json'
with open(outpath, 'w') as f:
    json.dump(output, f, separators=(',', ':'))

import os
size_mb = os.path.getsize(outpath) / (1024 * 1024)
print(f"\nOutput: {outpath} ({size_mb:.2f} MB)")

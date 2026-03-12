# Bengaluru Canopy

Interactive historical timeline of Bengaluru's mapped green infrastructure — 8,423 trees, 3,193 parks, and 4,288 water bodies from 2008 to present.

**Live**: [bengaluru-canopy](https://www.perplexity.ai/computer/a/bengaluru-canopy-em9gN5mATWmdJ2NdrRGiEg)

## Data

All data sourced from [OpenStreetMap](https://www.openstreetmap.org/) via the [Overpass API](https://overpass-api.de/).

| Layer | Count | Query |
|-------|-------|-------|
| Trees | 8,423 | `node["natural"="tree"]` |
| Parks | 3,193 | `way/relation["leisure"="park"\|"garden"]`, `way["landuse"="recreation_ground"]` |
| Water | 4,288 | `way/relation["natural"="water"]`, `["water"="lake"\|"reservoir"\|"pond"]`, `["landuse"="reservoir"]` |

**Bounding box**: `[12.75, 77.35, 13.20, 77.82]` (Greater Bengaluru)

### Species (16 categories)

Tabebuia Rosea, Gulmohar, Palm, Ficus, Silver Oak, Conifer, African Tulip, Rain Tree, Neem, Mango, Jacaranda, Pongamia, Mahogany, Cork Tree, Broadleaf, Unclassified

### Historical Timeline

Timestamps represent when features were added to OpenStreetMap (`out meta`), creating a timeline of mapping activity:

- **2008**: First parks and lakes documented (5 total)
- **2015-2016**: Major tree mapping campaigns (+2,266 trees)
- **2023**: Massive water body documentation push (+2,686 lakes)
- **2024-2026**: Continued growth across all layers

## Stack

- **Map**: [Leaflet.js](https://leafletjs.com/) with canvas renderer
- **Tiles**: [Carto](https://carto.com/basemaps/) dark_nolabels + dark_only_labels
- **Fonts**: Space Grotesk + JetBrains Mono
- **No build step** — pure vanilla HTML/CSS/JS

## Files

```
canopy/
├── index.html          # App entry point
├── style.css           # Styles with CSS variables
├── app.js              # Map logic, timeline, species filter
├── data.json           # Processed data (2.1 MB)
├── process_data_v3.py  # Script to regenerate data.json from raw
└── raw-data/
    ├── trees_meta.json   # 8,423 tree nodes with OSM metadata
    ├── trees_raw.json    # Original tree fetch (v1)
    ├── parks_meta.json   # 3,193 park ways/relations with geometry + metadata
    ├── parks_raw.json    # Original parks fetch (v1)
    ├── water_meta.json   # 4,288 water ways/relations with geometry + metadata
    └── water_raw.json    # Original water fetch (v1)
```

## Regenerate Data

```bash
python3 process_data_v3.py
```

Reads from `raw-data/*.json`, outputs `data.json`.

To re-fetch raw data from Overpass:

```bash
# Trees
curl -X POST "https://overpass-api.de/api/interpreter" \
  -d 'data=[out:json][timeout:120][bbox:12.75,77.35,13.20,77.82];(node["natural"="tree"];);out meta;' \
  -o raw-data/trees_meta.json

# Parks
curl -X POST "https://overpass-api.de/api/interpreter" \
  -d 'data=[out:json][timeout:120][bbox:12.75,77.35,13.20,77.82];(way["leisure"="park"];way["leisure"="garden"];way["landuse"="recreation_ground"];relation["leisure"="park"];relation["leisure"="garden"];);out meta geom;' \
  -o raw-data/parks_meta.json

# Water
curl -X POST "https://overpass-api.de/api/interpreter" \
  -d 'data=[out:json][timeout:120][bbox:12.75,77.35,13.20,77.82];(way["natural"="water"];way["water"="lake"];way["water"="reservoir"];way["water"="pond"];way["landuse"="reservoir"];relation["natural"="water"];relation["water"="lake"];relation["water"="reservoir"];);out meta geom;' \
  -o raw-data/water_meta.json
```

## License

Data: [ODbL](https://www.openstreetmap.org/copyright) (OpenStreetMap contributors)

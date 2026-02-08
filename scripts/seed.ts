/**
 * seed.ts — Populate the Disasters API with realistic sample data.
 *
 * 17 disasters across 6 continents, 12 types, Jan 2025 – Feb 2026,
 * all three statuses (active, contained, resolved), and multiple data sources.
 *
 * Usage:
 *   npm run seed                                  # defaults to http://localhost:3000
 *   npx tsx scripts/seed.ts http://my-host:4000   # custom base URL
 *
 * Works inside the Docker container and on the host alike.
 * The script is additive — running it multiple times creates duplicate records.
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const ENDPOINT = `${BASE_URL}/api/v1/disasters/bulk`;

const disasters = [
  {
    type: 'drought',
    location: { type: 'Point', coordinates: [36.8219, -1.2921] },
    date: '2025-01-10T00:00:00.000Z',
    description:
      'Prolonged drought across the Horn of Africa centered on Nairobi, Kenya. Fifth consecutive failed rainy season affecting 8 million people.',
    status: 'resolved',
    source: 'official',
    external_id: 'GDACS-DR-2025-000012',
    source_url: 'https://www.gdacs.org/report.aspx?eventid=2025000012',
  },
  {
    type: 'earthquake',
    location: { type: 'Point', coordinates: [142.3728, 38.3224] },
    date: '2025-03-11T14:46:00.000Z',
    description:
      '7.2 magnitude earthquake off the coast of Miyagi Prefecture, Japan. Triggered tsunami warnings along the Pacific coast.',
    status: 'resolved',
    source: 'official',
    external_id: 'USGS-EQ-2025-0311-JP',
    source_url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us2025abcd',
  },
  {
    type: 'volcanic_eruption',
    location: { type: 'Point', coordinates: [-175.38, -20.57] },
    date: '2025-06-03T22:15:00.000Z',
    description:
      "Hunga Tonga-Hunga Ha'apai resumed activity with a VEI-3 eruption. Ash cloud reached 18 km altitude, disrupting Pacific air routes.",
    status: 'resolved',
    source: 'official',
    external_id: 'GVP-2025-TONGA-001',
    source_url: 'https://volcano.si.edu/volcano.cfm?vn=243040',
  },
  {
    type: 'flood',
    location: { type: 'Point', coordinates: [90.3563, 23.685] },
    date: '2025-07-22T03:00:00.000Z',
    description:
      'Severe monsoon flooding along the Padma River in Dhaka Division, Bangladesh. 1.2 million people displaced.',
    status: 'resolved',
    source: 'official',
    external_id: 'GDACS-FL-2025-000089',
    source_url: 'https://www.gdacs.org/report.aspx?eventid=2025000089',
  },
  {
    type: 'wildfire',
    location: { type: 'Point', coordinates: [-119.4179, 36.7783] },
    date: '2025-08-15T08:30:00.000Z',
    description:
      'Creek Fire — 85,000 acres burned in the Sierra Nevada foothills near Fresno, California. Over 2,000 structures threatened.',
    status: 'resolved',
    source: 'nasa_firms',
    external_id: 'FIRMS-2025-CA-CREEK',
    source_url: 'https://firms.modaps.eosdis.nasa.gov/map/#t:adv;d:2025-08-15',
  },
  {
    type: 'hurricane',
    location: { type: 'Point', coordinates: [-89.6165, 20.9674] },
    date: '2025-09-18T18:00:00.000Z',
    description:
      'Hurricane Mara — Category 4 landfall on the Yucatán Peninsula, Mexico. Sustained winds of 240 km/h.',
    status: 'resolved',
    source: 'official',
    external_id: 'NHC-2025-AL09',
    source_url: 'https://www.nhc.noaa.gov/archive/2025/al09/',
  },
  {
    type: 'earthquake',
    location: { type: 'Point', coordinates: [28.9784, 41.0082] },
    date: '2025-11-05T04:17:00.000Z',
    description:
      '6.4 magnitude earthquake in the Sea of Marmara near Istanbul, Turkey. Significant structural damage in the Fatih and Beyoğlu districts.',
    status: 'resolved',
    source: 'official',
    external_id: 'USGS-EQ-2025-1105-TR',
    source_url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us2025efgh',
  },
  {
    type: 'cyclone',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    date: '2025-12-01T12:00:00.000Z',
    description:
      'Cyclone Biparjoy made landfall near Mumbai, India with sustained winds of 185 km/h. Major flooding in low-lying coastal areas.',
    status: 'resolved',
    source: 'official',
    external_id: 'IMD-2025-CYC-BIPARJOY',
    source_url: 'https://mausam.imd.gov.in/imd_latest/contents/cyclone.php',
  },
  {
    type: 'landslide',
    location: { type: 'Point', coordinates: [-72.3388, -13.532] },
    date: '2026-01-08T07:45:00.000Z',
    description:
      'Massive rainfall-triggered landslide in Ayacucho region, Peru. Buried a section of the Pan-American Highway and isolated three villages.',
    status: 'contained',
    source: 'official',
    external_id: 'GDACS-LS-2026-000003',
    source_url: 'https://www.gdacs.org/report.aspx?eventid=2026000003',
  },
  {
    type: 'wildfire',
    location: { type: 'Point', coordinates: [149.13, -35.2809] },
    date: '2026-01-20T11:00:00.000Z',
    description:
      'Bushfire in the Brindabella Ranges west of Canberra, Australia. 40,000 hectares burned with ember attacks reaching suburban Weston Creek.',
    status: 'contained',
    source: 'nasa_firms',
    external_id: 'FIRMS-2026-AU-BRINDA',
    source_url: 'https://firms.modaps.eosdis.nasa.gov/map/#t:adv;d:2026-01-20',
  },
  {
    type: 'flood',
    location: { type: 'Point', coordinates: [2.3522, 48.8566] },
    date: '2026-01-28T16:30:00.000Z',
    description:
      'Seine River overflows in central Paris, France. Louvre museum lower levels evacuated. Metro lines 1 and 4 suspended.',
    status: 'contained',
    source: 'official',
    external_id: 'EFAS-2026-FR-SEINE',
    source_url: 'https://www.efas.eu/en/efas-flood-alerts',
  },
  {
    type: 'earthquake',
    location: { type: 'Point', coordinates: [-70.6693, -33.4489] },
    date: '2026-02-01T02:33:00.000Z',
    description:
      '6.8 magnitude earthquake centered 40 km south of Santiago, Chile. Widespread power outages across the Metropolitan Region.',
    status: 'active',
    source: 'official',
    external_id: 'USGS-EQ-2026-0201-CL',
    source_url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us2026ijkl',
  },
  {
    type: 'tsunami',
    location: { type: 'Point', coordinates: [115.1889, -8.4095] },
    date: '2026-02-03T09:12:00.000Z',
    description:
      'Tsunami warning issued for southern Bali, Indonesia after a 7.1 undersea earthquake in the Indian Ocean. Waves of 1.5m observed at Kuta Beach.',
    status: 'active',
    source: 'official',
    external_id: 'PTWC-2026-IO-001',
    source_url: 'https://ptwc.weather.gov/',
  },
  {
    type: 'blizzard',
    location: { type: 'Point', coordinates: [-71.0589, 42.3601] },
    date: '2026-02-05T20:00:00.000Z',
    description:
      "Nor'easter dumps 75 cm of snow on Boston, Massachusetts. Logan Airport closed for 36 hours. State of emergency declared.",
    status: 'active',
    source: 'official',
    external_id: 'NWS-2026-NE-BLIZZARD',
    source_url: 'https://www.weather.gov/box/',
  },
  {
    type: 'volcanic_eruption',
    location: { type: 'Point', coordinates: [14.426, 40.821] },
    date: '2026-02-06T15:45:00.000Z',
    description:
      'Mount Vesuvius enters eruptive phase with lava fountaining and pyroclastic flows. Mandatory evacuation of Ercolano and Torre del Greco near Naples, Italy.',
    status: 'active',
    source: 'official',
    external_id: 'INGV-2026-VES-001',
    source_url: 'https://www.ov.ingv.it/ov/en/vesuvio.html',
  },
  {
    type: 'industrial_accident',
    location: { type: 'Point', coordinates: [121.4737, 31.2304] },
    date: '2026-02-07T03:20:00.000Z',
    description:
      'Chemical plant explosion in Pudong New Area, Shanghai, China. Toxic plume prompted shelter-in-place orders for 500,000 residents.',
    status: 'active',
    source: 'user',
    external_id: null,
    source_url: null,
  },
  {
    type: 'tornado',
    location: { type: 'Point', coordinates: [-97.5164, 35.4676] },
    date: '2026-02-07T17:30:00.000Z',
    description:
      'EF-4 tornado with 280 km/h winds cuts a 25 km path through Moore, Oklahoma. Dozens of homes destroyed.',
    status: 'active',
    source: 'user',
    external_id: null,
    source_url: null,
  },
];

async function main() {
  console.log(`Seeding ${disasters.length} disasters at ${ENDPOINT} ...`);

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(disasters),
  });

  const body = await response.json();

  if (response.ok) {
    const count = Array.isArray(body.data)
      ? body.data.length
      : Array.isArray(body)
        ? body.length
        : '?';
    console.log(`Success (HTTP ${response.status}) — ${count} disasters created.`);
  } else {
    console.error(`Failed (HTTP ${response.status}):`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
}

main();

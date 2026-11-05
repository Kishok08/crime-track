# CrimeScope UK

> **Interactive UK crime intelligence explorer** — a portfolio project using real UK Police Open Data, a transparent Gaussian kernel density estimator, and opt-in browser location alerts.

## Features
- Official monthly street-level police records from https://data.police.uk/ (never fabricated).
- Interactive Leaflet map: heatmap, point markers, map-click analysis, town/postcode search, city presets and device location.
- Unsupervised Gaussian kernel density estimation (KDE) fitted on the selected area's recorded incident coordinates; a percentile compares local concentrations with nearby sample points.
- Crime category visualisation, category/street filters, monthly comparison, paginated incident list and CSV downloads.
- **Area-entry alerts:** opt-in geolocation.watchPosition, with browser notifications when permitted; works only while the web page is open, not true background phone geofencing.
- Private notes page with browser-local save/delete/export. **Notes are NOT submitted to police or shared with other users.**
- Responsive premium dark UI for desktop, tablet and mobile.

## Run locally
Use Vercel's local development command (npx vercel dev) for both the static site and the /api/police serverless route. A regular static HTML server cannot serve the API route.

No paid services, secrets, service-role credentials or database are necessary for this portfolio version.

## Deployment
Connect this GitHub repository to Vercel as an Other framework project and deploy. The dynamic /api/police function proxies the official Police API, validates requests and caches responses for five hours. The app depends on public CDNs for Leaflet, Google Fonts and map tiles.

## ML method / ethical limitations
The included model performs genuine non-parametric unsupervised spatial density estimation with Gaussian kernels (450m bandwidth). It does not train a future-crime classifier or predict the likelihood of an individual becoming a victim. Spatial percentiles are relative to a grid of sampled positions around the searched point. No calibrated probability, independent validation or population adjustment is claimed.

Recorded incidents are published monthly, and their map points are intentionally anonymised and approximate, not the scene of the incident. Category reporting rates, time of day, local context and population are not controlled for. A low-density reading is never a promise of safety. In Scotland the Police API has incomplete street-level coverage, which can understate crime.

Browser geolocation is requested explicitly. If permitted, coordinates are used in the browser and sent to the app's Police API proxy to query records when the monitored area changes. There is no user account, location-history storage, server-side tracking or background location monitoring.

## Sources / legal
Crime source: UK Police Open Data (https://data.police.uk/docs/), licensed under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Basemap: OpenStreetMap contributors / CARTO.

**Independent educational/portfolio project, not affiliated with UK police, not an emergency service. To report a crime, visit https://www.police.uk/; call 999 in an emergency.**

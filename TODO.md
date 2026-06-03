# PM2.5 Concentration (μg/m³) + AQI separation — Implementation Checklist

## Step 1 — Data model changes (DB)
- [x] Add new migration SQL to extend `readings` with `pm2_5_conc_ugm3` (FLOAT).
- [x] Update `predictions` table schema to include `pm2_5_conc_ugm3`.
- [ ] Ensure backend/boot process runs this migration (or add a migration runner if missing).
- [ ] Update any queries/backfills that still reference legacy columns only.

## Step 2 — Backend (single source of truth)
- [ ] Update MQTT ingestion:
  - [ ] Treat incoming PM2.5 concentration as `pm2_5_conc_ugm3`
  - [ ] Derive `pm25_aqi` from `pm2_5_conc_ugm3` (unitless) using EPA breakpoints
  - [ ] Apply per-device calibration coefficients to AQI only (bias correction)
  - [ ] Broadcast/socket payload includes BOTH fields (`pm25_aqi` + `pm2_5_conc_ugm3`)
- [ ] Update REST responses:
  - [ ] `/api/readings/latest`
  - [ ] `/api/readings`
  - [ ] `/api/external/embrx/latest`
- [ ] Update Redis cached shapes to store/return both fields.
- [ ] Update reference node poller (DENR/BPIT):
  - [ ] Fetch PM2.5 concentration (μg/m³) directly from DENR source link
  - [ ] Derive AQI unitless from concentration
  - [ ] Persist BOTH independently in DB

## Step 3 — Firmware (MQTT payload keys)
- [ ] Publish measured concentration as `pm2_5_conc_ugm3` (μg/m³)
- [ ] Publish AQI separately as `pm25_aqi` (unitless) OR omit and let backend derive (preferred: backend derive)
- [ ] Ensure AQI never displays μg/m³ units

## Step 4 — Frontend model + state
- [ ] Update `frontend/src/utils/referenceNode.js`:
  - [ ] Add AQI getter: `getDisplayAqi(...)` using `pm25_aqi`
  - [ ] Add PM2.5 getter: `getDisplayPm25ConcUgm3(...)` using `pm2_5_conc_ugm3`
  - [ ] Update timeline point shape to carry BOTH `pm25_aqi` and `pm2_5_conc_ugm3`
- [ ] Update `frontend/src/contexts/ReadingsContext.jsx` to merge/hydrate both fields.

## Step 5 — Frontend UI everywhere
- [ ] `Dashboard.jsx`: show two values for Reference Node and city stats:
  - [ ] AQI (unitless)
  - [ ] PM2.5 concentration (μg/m³)
- [ ] `Analytics.jsx`: update cards + recent readings table columns + chart labels/tooltip text.
- [ ] `MapView.jsx`: popup/node cards show AQI + PM2.5 concentration; heatmap continues to use AQI only.

## Step 6 — Export / reports
- [ ] `frontend/src/utils/exportDataset.js`: ensure CSV includes BOTH fields.

## Step 7 — Validation
- [ ] AQI never uses μg/m³ units anywhere.
- [ ] PM2.5 concentration always shows μg/m³.
- [ ] Reference Node PM2.5 concentration matches latest DENR source value.
- [ ] Frontend/back/API/DB payloads remain synchronized.

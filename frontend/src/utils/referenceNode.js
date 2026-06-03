import { REFERENCE_DEVICE_ID, MAX_REFERENCE_TIMELINE_POINTS } from '../constants/referenceNode';

export const isReferenceDevice = (deviceId) => deviceId === REFERENCE_DEVICE_ID;

/** Canonical AQI value (unitless) for the reference node (EPA index). */
export const getReferenceAqi = (reading) => {
  if (!reading) return null;
  const v = reading.pm25_aqi ?? reading.pm2_5_cal ?? reading.pm2_5;
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
};

const PM25_BREAKPOINTS = [
  { aqiLow: 0, aqiHigh: 50, concLow: 0.0, concHigh: 12.0 },
  { aqiLow: 51, aqiHigh: 100, concLow: 12.1, concHigh: 35.4 },
  { aqiLow: 101, aqiHigh: 150, concLow: 35.5, concHigh: 55.4 },
  { aqiLow: 151, aqiHigh: 200, concLow: 55.5, concHigh: 150.4 },
  { aqiLow: 201, aqiHigh: 300, concLow: 150.5, concHigh: 250.4 },
  { aqiLow: 301, aqiHigh: 400, concLow: 250.5, concHigh: 350.4 },
  { aqiLow: 401, aqiHigh: 500, concLow: 350.5, concHigh: 500.4 },
];

const inverseAqiToPm25Conc = (aqi) => {
  if (aqi == null || !Number.isFinite(Number(aqi))) return null;

  const value = Number(aqi);
  const clamped = Math.min(Math.max(value, 0), 500);
  const band = PM25_BREAKPOINTS.find((entry) => clamped >= entry.aqiLow && clamped <= entry.aqiHigh)
    || PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1];

  const concentration =
    ((band.concHigh - band.concLow) / (band.aqiHigh - band.aqiLow)) * (clamped - band.aqiLow) +
    band.concLow;

  return Number.isFinite(concentration) ? concentration : null;
};

/**
 * AQI display value (unitless).
 * - Reference node: reading.pm25_aqi (or fallbacks)
 * - Non-reference sensors: prefer reading.pm25_aqi, otherwise fall back to legacy AQI fields.
 */
export const getDisplayAqi = (reading, deviceId) => {
  if (!reading) return null;

  if (isReferenceDevice(deviceId)) return getReferenceAqi(reading);

  const v = reading.pm25_aqi ?? reading.pm2_5_cal ?? reading.pm2_5;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
};

/**
 * PM2.5 concentration display value (μg/m³).
 * Reference node uses its stored concentration. Other sensors derive an
 * equivalent concentration from AQI when the concentration field is absent.
 */
export const getDisplayPm25Conc = (reading, deviceId) => {
  if (!reading) return null;

  const stored = reading.pm2_5_conc_ugm3;
  if (stored != null && Number.isFinite(Number(stored))) return Number(stored);

  if (isReferenceDevice(deviceId)) return null;

  const aqi = getDisplayAqi(reading, deviceId);
  return inverseAqiToPm25Conc(aqi);
};

/**
 * Backward-compatible alias: existing UI calls getDisplayPm25() for AQI.
 * Keep it to avoid breaking unmodified screens.
 */
export const getDisplayPm25 = (reading, deviceId) => getDisplayAqi(reading, deviceId);

/** AQI unit label is unitless everywhere in AQI UI. */
export const getPm25Unit = () => 'AQI';

export const formatPm25 = (value, deviceId) => {
  if (value == null) return '---';
  return isReferenceDevice(deviceId) ? value.toFixed(0) : value.toFixed(1);
};

/** Normalize reference reading so pm25_aqi and pm2_5_conc_ugm3 are always set from stored columns. */
export const normalizeReferenceReading = (reading) => {
  if (!reading || !isReferenceDevice(reading.device_id)) return reading;

  const aqi = getReferenceAqi(reading);
  const conc = reading.pm2_5_conc_ugm3;

  if (aqi == null && conc == null) return reading;

  return {
    ...reading,
    ...(aqi == null ? {} : { pm25_aqi: aqi, pm2_5_cal: reading.pm2_5_cal ?? aqi }),
    ...(conc == null ? {} : { pm2_5_conc_ugm3: conc }),
  };
};

export const normalizeReadingsList = (readings) =>
  (readings || []).map(normalizeReferenceReading);

/** Merge incoming reference update without losing fields. */
export const mergeReferenceReading = (existing, incoming) =>
  normalizeReferenceReading({ ...(existing || {}), ...(incoming || {}) });

/** Upsert one device row in the readings array. */
export const mergeReadingIntoList = (prev, incoming) => {
  if (!incoming?.device_id) return prev;
  const idx = prev.findIndex((r) => r.device_id === incoming.device_id);
  const merged = isReferenceDevice(incoming.device_id)
    ? mergeReferenceReading(idx > -1 ? prev[idx] : null, incoming)
    : { ...(idx > -1 ? prev[idx] : {}), ...incoming };

  if (idx > -1) {
    const updated = [...prev];
    updated[idx] = merged;
    return updated;
  }
  return [...prev, merged];
};

const timelineKey = (time) => {
  const t = new Date(time).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Normalize timeline point shape. */
export const toTimelinePoint = (readingOrPoint) => {
  if (!readingOrPoint?.time) return null;

  const aqi =
    readingOrPoint.pm25_aqi != null
      ? Number(readingOrPoint.pm25_aqi)
      : getReferenceAqi(readingOrPoint);

  if (aqi == null || !Number.isFinite(aqi)) return null;

  const conc =
    readingOrPoint.pm2_5_conc_ugm3 != null
      ? Number(readingOrPoint.pm2_5_conc_ugm3)
      : null;

  return {
    time: readingOrPoint.time,
    pm25_aqi: aqi,

    // Preserve PM2.5 concentration (μg/m³) independently for UI/charting.
    pm2_5_conc_ugm3: conc != null && Number.isFinite(conc) ? conc : null,

    temperature: readingOrPoint.temperature ?? null,
    humidity: readingOrPoint.humidity ?? null,
  };
};

/** Upsert by exact timestamp; updates AQI if the same time is seen again. */
export const upsertTimelinePoint = (timeline, point) => {
  const normalized = typeof point.pm25_aqi === 'number' && point.time
    ? point
    : toTimelinePoint(point);
  if (!normalized) return timeline;

  const key = timelineKey(normalized.time);
  if (key == null) return timeline;

  const filtered = (timeline || []).filter((p) => timelineKey(p.time) !== key);
  const next = [...filtered, normalized];
  next.sort((a, b) => timelineKey(a.time) - timelineKey(b.time));
  if (next.length > MAX_REFERENCE_TIMELINE_POINTS) {
    return next.slice(next.length - MAX_REFERENCE_TIMELINE_POINTS);
  }
  return next;
};

/** @deprecated alias */
export const appendTimelinePoint = upsertTimelinePoint;

/** Build timeline from historical reading rows (any order). */
export const buildTimelineFromReadings = (rows) => {
  const sorted = [...(rows || [])].sort(
    (a, b) => timelineKey(a.time) - timelineKey(b.time)
  );
  return sorted.reduce((acc, row) => {
    const point = toTimelinePoint(normalizeReferenceReading(row));
    return point ? upsertTimelinePoint(acc, point) : acc;
  }, []);
};

/** Merge timeline with the latest live reading (ensures headline matches last point). */
export const mergeTimelineWithReading = (timeline, reading) => {
  const point = toTimelinePoint(reading);
  return point ? upsertTimelinePoint(timeline, point) : timeline;
};

/** Merge external Redis/API payload into readings list. */
export const mergeExternalReference = (readings, extData) => {
  if (!extData || extData.device_id !== REFERENCE_DEVICE_ID) return readings;
  return mergeReadingIntoList(readings, normalizeReferenceReading(extData));
};

/** After /api/readings/latest — merge external reference so pm25_aqi is present. */
export const hydrateReadingsWithExternal = async (readings, fetchExternal) => {
  let list = normalizeReadingsList(readings);
  try {
    const ext = await fetchExternal();
    if (ext?.data?.device_id === REFERENCE_DEVICE_ID) {
      list = mergeExternalReference(list, ext.data);
    }
  } catch {
    // poller may not have run yet
  }
  return list;
};

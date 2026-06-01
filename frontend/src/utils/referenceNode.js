import { REFERENCE_DEVICE_ID, MAX_REFERENCE_TIMELINE_POINTS } from '../constants/referenceNode';

export const isReferenceDevice = (deviceId) => deviceId === REFERENCE_DEVICE_ID;

/** Canonical AQI value for the reference node (EPA index from BPIT feed). */
export const getReferenceAqi = (reading) => {
  if (!reading) return null;
  const v = reading.pm25_aqi ?? reading.pm2_5_cal ?? reading.pm2_5;
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
};

/** PM2.5 display value: AQI for reference, calibrated µg/m³ for sensors. */
export const getDisplayPm25 = (reading, deviceId) => {
  if (!reading) return null;
  if (isReferenceDevice(deviceId)) return getReferenceAqi(reading);
  const v = reading.pm2_5_cal ?? reading.pm2_5;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
};

export const getPm25Unit = (deviceId) => (isReferenceDevice(deviceId) ? 'AQI' : 'µg/m³');

export const formatPm25 = (value, deviceId) => {
  if (value == null) return '---';
  return isReferenceDevice(deviceId) ? value.toFixed(0) : value.toFixed(1);
};

/** Normalize reference reading so pm25_aqi is always set from stored columns. */
export const normalizeReferenceReading = (reading) => {
  if (!reading || !isReferenceDevice(reading.device_id)) return reading;
  const aqi = getReferenceAqi(reading);
  if (aqi == null) return reading;
  return {
    ...reading,
    pm25_aqi: aqi,
    pm2_5_cal: reading.pm2_5_cal ?? aqi,
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
  return {
    time: readingOrPoint.time,
    pm25_aqi: aqi,
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

/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import {
  REFERENCE_DEVICE_ID,
  MAX_REFERENCE_TIMELINE_POINTS,
  REFERENCE_POLL_INTERVAL_MS,
} from '../constants/referenceNode';
import {
  mergeReadingIntoList,
  mergeExternalReference,
  hydrateReadingsWithExternal,
  getReferenceAqi,
  buildTimelineFromReadings,
  mergeTimelineWithReading,
  upsertTimelinePoint,
  toTimelinePoint,
  getDisplayPm25,
  isReferenceDevice,
  getPm25Unit,
  formatPm25,
} from '../utils/referenceNode';

const ReadingsContext = createContext(null);

export const ReadingsProvider = ({ apiUrl, children }) => {
  const [readings, setReadings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [referenceTimeline, setReferenceTimeline] = useState([]);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [socketError, setSocketError] = useState(null);

  const referenceReading = useMemo(
    () => readings.find((r) => r.device_id === REFERENCE_DEVICE_ID) ?? null,
    [readings]
  );

  const refreshReadingsFromApi = useCallback(async () => {
    const readingsRes = await axios.get('/api/readings/latest');
    const list = await hydrateReadingsWithExternal(
      Array.isArray(readingsRes.data) ? readingsRes.data : [],
      () => axios.get('/api/external/embrx/latest')
    );
    setReadings(list);
    return list;
  }, []);

  const refreshReferenceTimeline = useCallback(async (liveReading = null) => {
    try {
      const res = await axios.get(
        `/api/readings?device_id=${REFERENCE_DEVICE_ID}&limit=${MAX_REFERENCE_TIMELINE_POINTS}`
      );
      let points = buildTimelineFromReadings(res.data);
      const ref =
        liveReading ??
        (await axios.get('/api/external/embrx/latest').then((r) => r.data).catch(() => null));
      if (ref?.device_id === REFERENCE_DEVICE_ID) {
        points = mergeTimelineWithReading(points, ref);
      }
      setReferenceTimeline(points);
      return points;
    } catch (err) {
      console.debug('[HY-AQMS] Reference timeline refresh failed:', err.message);
      return null;
    }
  }, []);

  const refreshExternalReference = useCallback(async () => {
    try {
      const ext = await axios.get('/api/external/embrx/latest');
      if (ext?.data?.device_id === REFERENCE_DEVICE_ID) {
        setReadings((prev) => mergeExternalReference(prev, ext.data));
        const point = toTimelinePoint(ext.data);
        if (point) {
          setReferenceTimeline((prev) => upsertTimelinePoint(prev, point));
        }
      }
    } catch (err) {
      console.debug('[HY-AQMS] External reference refresh failed:', err.message);
    }
  }, []);

  const applyReferenceSocketReading = useCallback((payload) => {
    const point = toTimelinePoint(payload);
    if (point) {
      setReferenceTimeline((prev) => upsertTimelinePoint(prev, point));
    }
  }, []);

  useEffect(() => {
    if (!apiUrl) return;
    axios.defaults.baseURL = apiUrl;

    const fetchInitial = async () => {
      try {
        const [list, devicesRes] = await Promise.all([
          refreshReadingsFromApi(),
          axios.get('/api/devices'),
        ]);
        setDevices(Array.isArray(devicesRes.data) ? devicesRes.data : []);
        const ref = list.find((r) => r.device_id === REFERENCE_DEVICE_ID);
        await refreshReferenceTimeline(ref ?? null);
        return list;
      } catch (err) {
        console.error('[HY-AQMS] Error fetching initial data:', err);
        return [];
      }
    };

    fetchInitial();

    const externalRefreshInterval = setInterval(refreshExternalReference, REFERENCE_POLL_INTERVAL_MS);
    const timelineRefreshInterval = setInterval(
      () => refreshReferenceTimeline(),
      REFERENCE_POLL_INTERVAL_MS
    );

    const socket = io(apiUrl, {
      path: '/socket.io',
      timeout: 30000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 20000,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      setSocketStatus('connected');
      setSocketError(null);
    });

    socket.on('disconnect', (reason) => {
      setSocketStatus('disconnected');
      setSocketError(reason);
    });

    socket.on('connect_error', (error) => {
      setSocketStatus('disconnected');
      setSocketError(error?.message || 'Connection error');
    });

    socket.on('reconnect_attempt', () => {
      setSocketStatus('reconnecting');
      setSocketError(null);
    });

    socket.on('reconnect', async () => {
      setSocketStatus('connected');
      setSocketError(null);
      try {
        const list = await refreshReadingsFromApi();
        const ref = list.find((r) => r.device_id === REFERENCE_DEVICE_ID);
        await refreshReferenceTimeline(ref ?? null);
      } catch (err) {
        console.error('[HY-AQMS] Failed to refresh after reconnect:', err.message);
      }
    });

    socket.on('new_reading', (payload) => {
      setReadings((prev) => mergeReadingIntoList(prev, payload));
      if (payload.device_id === REFERENCE_DEVICE_ID) {
        applyReferenceSocketReading(payload);
      }
    });

    const pollInterval = setInterval(async () => {
      if (socket.connected) return;
      try {
        const list = await refreshReadingsFromApi();
        const ref = list.find((r) => r.device_id === REFERENCE_DEVICE_ID);
        await refreshReferenceTimeline(ref ?? null);
      } catch (err) {
        console.debug('[HY-AQMS] Polling failed:', err.message);
      }
    }, 15000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(externalRefreshInterval);
      clearInterval(timelineRefreshInterval);
      socket.disconnect();
    };
  }, [
    apiUrl,
    refreshReadingsFromApi,
    refreshExternalReference,
    refreshReferenceTimeline,
    applyReferenceSocketReading,
  ]);

  // Keep timeline aligned when live reading updates without a socket event (e.g. REST merge)
  useEffect(() => {
    if (!referenceReading?.time) return;
    const aqi = getReferenceAqi(referenceReading);
    if (aqi == null) return;
    setReferenceTimeline((prev) => mergeTimelineWithReading(prev, referenceReading));
  }, [referenceReading?.time, referenceReading?.pm25_aqi, referenceReading?.pm2_5_cal]);

  const getReading = useCallback(
    (deviceId) => readings.find((r) => r.device_id === deviceId) ?? null,
    [readings]
  );

  const value = useMemo(
    () => ({
      readings,
      devices,
      referenceReading,
      referenceTimeline,
      socketStatus,
      socketError,
      getReading,
      getDisplayPm25: (deviceId) => getDisplayPm25(getReading(deviceId), deviceId),
      isReferenceDevice,
      getPm25Unit,
      formatPm25,
      refreshExternalReference,
      refreshReferenceTimeline,
    }),
    [
      readings,
      devices,
      referenceReading,
      referenceTimeline,
      socketStatus,
      socketError,
      getReading,
      refreshExternalReference,
      refreshReferenceTimeline,
    ]
  );

  return (
    <ReadingsContext.Provider value={value}>
      {children}
    </ReadingsContext.Provider>
  );
};

export const useReadings = () => {
  const ctx = useContext(ReadingsContext);
  if (!ctx) throw new Error('useReadings must be used inside <ReadingsProvider>');
  return ctx;
};

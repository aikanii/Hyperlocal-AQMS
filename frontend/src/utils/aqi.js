// AQI Calculation and Display Utilities
// Converts PM2.5 concentration (µg/m³) to AQI values and categories

// WHO/US-EPA Air Quality Index (PM2.5-based)
// Breakpoints for AQI categorization
export const AQI_BREAKPOINTS = [
  { max: 50, aqi_max: 50, label: 'Good', color: '#00E400', description: 'Air quality is satisfactory.' },
  { max: 100, aqi_max: 100, label: 'Moderate', color: '#FFFF00', description: 'Acceptable; some concern for sensitive groups.' },
  { max: 150, aqi_max: 150, label: 'Unhealthy for Sensitive Groups', color: '#FF7E00', description: 'Sensitive groups experience health effects.' },
  { max: 200, aqi_max: 200, label: 'Unhealthy', color: '#FF0000', description: 'Everyone experiences health effects.' },
  { max: 300, aqi_max: 300, label: 'Very Unhealthy', color: '#8F3F97', description: 'Health alert: serious health effects.' },
  { max: Infinity, aqi_max: 500, label: 'Hazardous', color: '#7E0023', description: 'Health warning of emergency conditions.' }
];

/**
 * Calculate AQI from PM2.5 concentration
 * @param {number} pm25 - PM2.5 concentration in µg/m³
 * @returns {number|null} - AQI value (0-500+) or null if invalid
 */
export const calculateAQI = (pm25) => {
  if (pm25 === null || pm25 === undefined || !Number.isFinite(pm25)) {
    return null;
  }

  // Find the appropriate breakpoint
  let breakpoint = null;
  let prevBp = null;

  for (let i = 0; i < AQI_BREAKPOINTS.length; i++) {
    prevBp = i > 0 ? AQI_BREAKPOINTS[i - 1] : AQI_BREAKPOINTS[0];
    if (pm25 <= AQI_BREAKPOINTS[i].max) {
      breakpoint = AQI_BREAKPOINTS[i];
      break;
    }
  }

  if (!breakpoint) return null;

  // Get the PM2.5 range for linear interpolation
  const pm25_low = prevBp ? prevBp.max : 0;
  const pm25_high = breakpoint.max;
  const aqi_low = prevBp ? prevBp.aqi_max : 0;
  const aqi_high = breakpoint.aqi_max;

  // Linear interpolation
  const aqi = ((aqi_high - aqi_low) / (pm25_high - pm25_low)) * (pm25 - pm25_low) + aqi_low;
  return Math.round(Math.max(0, aqi));
};

/**
 * Get AQI category details (label, color, description)
 * @param {number} aqi - AQI value
 * @returns {object|null} - Category object with label, color, description
 */
export const getAQICategory = (aqi) => {
  if (aqi === null || aqi === undefined) return null;
  
  for (const bp of AQI_BREAKPOINTS) {
    if (aqi <= bp.aqi_max) {
      return {
        label: bp.label,
        color: bp.color,
        description: bp.description
      };
    }
  }
  
  // Default to hazardous for extreme values
  return {
    label: 'Hazardous',
    color: '#7E0023',
    description: 'Health warning of emergency conditions.'
  };
};

/**
 * Get AQI color for display
 * @param {number} aqi - AQI value
 * @returns {string} - Color hex code
 */
export const getAQIColor = (aqi) => {
  const category = getAQICategory(aqi);
  return category?.color || '#808080';
};

/**
 * Get AQI label/category name
 * @param {number} aqi - AQI value
 * @returns {string} - Category label
 */
export const getAQILabel = (aqi) => {
  const category = getAQICategory(aqi);
  return category?.label || '---';
};

/**
 * Get AQI description/advice
 * @param {number} aqi - AQI value
 * @returns {string} - Health advice/description
 */
export const getAQIDescription = (aqi) => {
  const category = getAQICategory(aqi);
  return category?.description || '';
};

/**
 * Format AQI value for display
 * @param {number} aqi - AQI value
 * @returns {string} - Formatted AQI (e.g., "102")
 */
export const formatAQI = (aqi) => {
  if (aqi === null || aqi === undefined) return '---';
  return Number.isFinite(aqi) ? aqi.toFixed(0) : '---';
};

/**
 * Format PM2.5 concentration for display
 * @param {number} pm25 - PM2.5 concentration in µg/m³
 * @returns {string} - Formatted PM2.5 (e.g., "35.4")
 */
export const formatPM25 = (pm25) => {
  if (pm25 === null || pm25 === undefined) return '---';
  return Number.isFinite(pm25) ? pm25.toFixed(1) : '---';
};

/**
 * Get PM2.5 status/category for scientific display
 * @param {number} pm25 - PM2.5 concentration in µg/m³
 * @returns {object} - Status object with label and description
 */
export const getPM25Status = (pm25) => {
  if (pm25 === null || pm25 === undefined) return { label: '---', description: '' };
  
  if (pm25 <= 12) return { label: 'Excellent', description: 'Very low particulate concentration' };
  if (pm25 <= 35.4) return { label: 'Good', description: 'Low particulate concentration' };
  if (pm25 <= 55.4) return { label: 'Moderate', description: 'Moderate particulate concentration' };
  if (pm25 <= 150.4) return { label: 'Poor', description: 'High particulate concentration' };
  return { label: 'Very Poor', description: 'Very high particulate concentration' };
};

export default {
  AQI_BREAKPOINTS,
  calculateAQI,
  getAQICategory,
  getAQIColor,
  getAQILabel,
  getAQIDescription,
  formatAQI,
  formatPM25,
  getPM25Status
};

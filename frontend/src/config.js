// Centralized API configuration for HY-AQMS
// Local development: always use current origin or stored localStorage override
const getApiBaseUrl = () => {
  // 1. Manual user override via LocalStorage (e.g. settings gear)
  if (typeof window !== 'undefined') {
    const localOverride = window.localStorage.getItem('aqms_api_url');
    if (localOverride) return localOverride;
  }

  // 2. Production endpoint configured globally via public/config.json
  if (typeof window !== 'undefined') {
    const prodConfigUrl = window.localStorage.getItem('aqms_production_api_url');
    // Ensure it is a valid non-empty string and not the placeholder before using it
    if (prodConfigUrl && prodConfigUrl !== 'https://dashboard.yourdomain.com') {
      return prodConfigUrl;
    }
  }

  // 3. Default fallback: use current origin
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
};

export const API_BASE_URL = getApiBaseUrl();

// Clean trailing slashes
export const API_URL = API_BASE_URL.replace(/\/$/, '');

console.log(`[HY-AQMS] Initialized with API URL: ${API_URL}`);

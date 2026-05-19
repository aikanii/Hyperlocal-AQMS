// Centralized API configuration for HY-AQMS
// In production, these will be set via Vercel/CI-CD environment variables.
// In local development, they fallback to the current origin (localhost).

const isProd = import.meta.env.PROD;

// VITE_API_URL should be set in Vercel to something like: https://api.yourdomain.com
// If not set, it falls back to window.location.origin (useful for the local Docker setup)
const getApiBaseUrl = () => {
  // Allow manual configuration via local storage override (useful for hybrid/cross-device Vercel setups)
  const overrideUrl = typeof window !== 'undefined' ? window.localStorage.getItem('aqms_api_url') : null;
  if (overrideUrl) {
    return overrideUrl;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // If running on a Vercel domain and no specific API URL is configured,
  // target the local backend port 3000 directly.
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')) {
    return 'http://localhost:3000';
  }
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
};

export const API_BASE_URL = getApiBaseUrl();

// Clean trailing slashes
export const API_URL = API_BASE_URL.replace(/\/$/, '');

console.log(`[HY-AQMS] Initialized with API URL: ${API_URL}`);

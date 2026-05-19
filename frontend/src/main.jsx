import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import axios from 'axios'
import App from './App.jsx'

const initApp = async () => {
  // Try to load dynamic tunnel URL from raw GitHub first (cache-busted to bypass raw.githubusercontent.com CDN caching)
  try {
    const response = await fetch('https://raw.githubusercontent.com/aikanii/HY-AQMS/main/frontend/public/api_url.json?t=' + Date.now());
    if (response.ok) {
      const data = await response.json();
      if (data && data.url) {
        localStorage.setItem('aqms_api_url', data.url);
      }
    }
  } catch (err) {
    console.warn('[HY-AQMS] Could not fetch raw GitHub API URL, using local config fallbacks.');
  }

  // Dynamically import config after localStorage is updated
  const { API_URL } = await import('./config');
  axios.defaults.baseURL = API_URL;

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

initApp();

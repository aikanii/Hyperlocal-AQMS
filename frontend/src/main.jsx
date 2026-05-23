import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import axios from 'axios'
import App from './App.jsx'

const initApp = async () => {
  // Dynamically import config after localStorage is set up
  const { API_URL } = await import('./config');
  axios.defaults.baseURL = API_URL;

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

initApp();

/**
 * Download readings CSV. Requires an active admin JWT.
 * @param {string} [query] - Optional query string, e.g. "?device_id=foo"
 * @param {string} [filename]
 */
export async function downloadDataset(query = '', filename = 'HY-AQMS-Dataset.csv') {
  const token = localStorage.getItem('aqms_token');
  if (!token) {
    alert('You must be logged in as admin to export data.');
    return;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role !== 'admin') {
      alert('Export is available to administrators only.');
      return;
    }
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem('aqms_token');
      alert('Your session has expired. Please log in again.');
      return;
    }
  } catch {
    alert('Invalid session. Please log in again.');
    return;
  }

  const path = `/api/export${query}`;
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Export failed. Ensure you are logged in as admin.');
    return;
  }

  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

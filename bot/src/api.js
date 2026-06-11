function headers(hasBody = false) {
  const h = { Authorization: `Bearer ${process.env.API_SECRET}` };
  if (hasBody) h['Content-Type'] = 'application/json';
  return h;
}

async function apiFetch(path, options = {}) {
  const hasBody = options.body != null;
  const res = await fetch(`${process.env.API_URL}${path}`, { ...options, headers: headers(hasBody) });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

async function fetchConfig() {
  return apiFetch('/config/bot');
}

async function fetchSlots() {
  return apiFetch('/slots');
}

async function createAppointment({ slot_id, name, telegram_id }) {
  return apiFetch('/appointments', {
    method: 'POST',
    body: JSON.stringify({ slot_id, name, telegram_id }),
  });
}

module.exports = { fetchConfig, fetchSlots, createAppointment };

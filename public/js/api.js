// REST + Socket.IO client.
/* global io */

const TOKEN_KEY = 'xp_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

export async function rest(path, body, method) {
  const res = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let socket = null;
export function connect(handlers) {
  socket = io({ auth: { token: getToken() }, transports: ['websocket', 'polling'] });
  for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);
  return socket;
}
export function disconnect() {
  if (socket) socket.disconnect();
  socket = null;
}

export function req(name, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Not connected.'));
    socket.timeout(15000).emit('req', name, payload, (err, res) => {
      if (err) return reject(new Error('The server took too long to respond.'));
      if (res?.error) return reject(new Error(res.error));
      resolve(res?.data);
    });
  });
}

export function typing(channelId) {
  socket?.emit('typing', channelId);
}

export async function upload(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Files can be up to 8 MB.');
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return rest('/api/upload', { dataUrl, name: file.name });
}

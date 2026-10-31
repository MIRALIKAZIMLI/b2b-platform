/* global http, json, output, API_URL, PHONE */
// Mock SMS kutusundan (`GET /api/v1/dev/sms-outbox`, yalnız local/test) son kodu okur.
// Maestro'nun GraalJS ortamı: `http`, `json`, `output` hazır gelir.
const response = http.get(`${API_URL}/api/v1/dev/sms-outbox?phone=${encodeURIComponent(PHONE)}`);
const items = json(response.body).items;
const match = items.length > 0 ? /\d{6}/.exec(items[0].body) : null;
if (match === null) throw new Error('SMS kutusunda kod yok');
output.otp = match[0];

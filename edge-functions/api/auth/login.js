import { createSession, normalizeUsername, verifyLogin } from '../../../lib/auth.js';
import { json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

export const onRequestPost = route(
  async ({ request }) => {
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const password = typeof body.password === 'string' ? body.password.slice(0, 128) : '';

    await verifyLogin(username, password);
    const { token, cookie } = await createSession(request, username);
    return json({ username, token }, 200, { 'Set-Cookie': cookie });
  },
  { auth: false },
);

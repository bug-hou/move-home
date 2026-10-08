import { destroySession } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

export const onRequestPost = route(
  async ({ request }) => {
    const cookie = await destroySession(request);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  },
  { auth: false },
);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export async function readJson(request) {
  try {
    const data = await request.json();
    if (data && typeof data === 'object') return data;
  } catch {
    // fallthrough
  }
  throw new HttpError(400, '请求体必须是 JSON');
}

// 简易 CSRF 防护：非安全方法若带 Origin，必须与当前 Host 一致（Cookie 另有 SameSite=Lax）
export function assertSameOrigin(request) {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, '非法来源');
  }
  if (host !== new URL(request.url).host) throw new HttpError(403, '跨站请求被拒绝');
}

import { timingSafeEqual } from 'node:crypto';

const encoder = new TextEncoder();

export function bearerAuthorized(request: Request, token?: string): boolean {
  if (!token) return false;
  const actual = encoder.encode(request.headers.get('authorization') || '');
  const expected = encoder.encode(`Bearer ${token}`);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual,expected);
}

export async function parseBoundedJson(request: Request, maxBytes = 98_304): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.toLowerCase() || '';
  if (!contentType.startsWith('application/json')) throw new Error('CONTENT_TYPE_APPLICATION_JSON_REQUIRED');
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('REQUEST_BODY_TOO_LARGE');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error('REQUEST_BODY_TOO_LARGE');
  return JSON.parse(new TextDecoder().decode(bytes));
}

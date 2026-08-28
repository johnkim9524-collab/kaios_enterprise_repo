const HOLD_BODY = Object.freeze({
  ok: false,
  record_type: 'kidults_mobile_projection_api_hold',
  schema_version: '1.0.0',
  state: 'HOLD',
  reason: 'MOBILE_CONTROL_PLANE_BINDING_NOT_VERIFIED',
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
});

export async function onRequestGet() {
  return new Response(JSON.stringify(HOLD_BODY), {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'Retry-After': '60',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

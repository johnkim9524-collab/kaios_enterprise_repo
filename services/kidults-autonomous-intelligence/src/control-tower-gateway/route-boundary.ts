/**
 * Pure route classifier used by the live Worker to fail closed without
 * importing the simulated A31 action gateway or any process-memory state.
 */
const GATEWAY_ROUTE_RE = /^\/control-tower\/(snapshot|decisions|actions)/;

export function isGatewayRoute(pathname: string): boolean {
  return GATEWAY_ROUTE_RE.test(pathname);
}

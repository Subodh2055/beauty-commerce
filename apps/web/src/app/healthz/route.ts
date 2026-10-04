// Liveness probe for the container healthcheck. Deliberately touches nothing
// else (no API call, no render) so it reports on this process only.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

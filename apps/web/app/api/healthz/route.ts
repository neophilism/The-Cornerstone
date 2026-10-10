export function GET() {
  return Response.json(
    { status: 'ok', service: 'cornerstone-public', mode: 'proposal', protectedIntake: false },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

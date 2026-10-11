export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'cornerstone-public',
      mode: 'proposal',
      protectedIntake: false,
      commit: process.env['RENDER_GIT_COMMIT'] || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

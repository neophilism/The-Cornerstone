import { Workspace } from '@cornerstone/ui/workspace';
export default function Page() {
  return <Workspace staff publicOrigin={process.env['PUBLIC_ORIGIN'] || 'http://localhost:3000'} />;
}

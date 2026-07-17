export const dynamic = 'force-dynamic';
export const revalidate = 30;

import { ok } from '@/lib/api';
import { withPermissionAny } from '@/lib/api-auth';
import { fetchDashboardData } from '@/lib/dashboard-data';

export const GET = withPermissionAny(
  ['dashboard.viewBasic', 'dashboard.view'],
  async () => ok(await fetchDashboardData()),
);

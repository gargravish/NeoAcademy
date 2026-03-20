import { db } from '@/lib/db';
import { providerUsage } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getUsage() {
  // Last 30 days grouped by date + provider
  return db.select().from(providerUsage).orderBy(desc(providerUsage.date)).limit(300);
}

function groupByDate(rows: (typeof providerUsage.$inferSelect)[]) {
  const byDate: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!byDate[row.date]) byDate[row.date] = [];
    byDate[row.date].push(row);
  }
  return byDate;
}

export default async function UsagePage() {
  const rows = await getUsage();
  const byDate = groupByDate(rows);
  const dates = Object.keys(byDate).sort().reverse();

  const totalCost = rows.reduce((s, r) => s + r.costUsd, 0);
  const totalRequests = rows.reduce((s, r) => s + r.requests, 0);

  // Per-provider totals
  const byProvider: Record<string, { requests: number; cost: number }> = {};
  for (const row of rows) {
    if (!byProvider[row.provider]) byProvider[row.provider] = { requests: 0, cost: 0 };
    byProvider[row.provider].requests += row.requests;
    byProvider[row.provider].cost += row.costUsd;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage & Billing</h1>
        <p className="text-muted-foreground">API usage history (last 30 days)</p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total requests (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalRequests.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total cost (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${totalCost.toFixed(4)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Provider breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(byProvider)
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([provider, stats]) => (
              <div key={provider} className="flex items-center justify-between text-sm">
                <span className="capitalize font-medium">{provider}</span>
                <div className="flex gap-6 text-muted-foreground font-mono text-xs">
                  <span>{stats.requests.toLocaleString()} reqs</span>
                  <span>${stats.cost.toFixed(5)}</span>
                </div>
              </div>
            ))}
          {Object.keys(byProvider).length === 0 && (
            <p className="text-sm text-muted-foreground">No usage data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Daily breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage data yet</p>
          ) : (
            dates.map((date) => {
              const dayRows = byDate[date];
              const dayCost = dayRows.reduce((s, r) => s + r.costUsd, 0);
              const dayReqs = dayRows.reduce((s, r) => s + r.requests, 0);
              return (
                <div key={date} className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>{date}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {dayReqs} reqs · ${dayCost.toFixed(5)}
                    </span>
                  </div>
                  {dayRows.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between pl-4 text-xs text-muted-foreground"
                    >
                      <span className="capitalize">
                        {r.provider}
                        {r.keyHash ? ` (${r.keyHash})` : ''}
                      </span>
                      <span className="font-mono">
                        {r.requests} reqs · ${r.costUsd.toFixed(5)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

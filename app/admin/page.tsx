import { db } from '@/lib/db';
import { course, knowledgeDoc, providerUsage, user } from '@/lib/db/schema';
import { count, sum, eq, gte } from 'drizzle-orm';
import { HealthStatus } from '@/components/admin/health-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Database, FolderOpen, Users } from 'lucide-react';

async function getStats() {
  const [userCount] = await db.select({ count: count() }).from(user);
  const [courseCount] = await db
    .select({ count: count() })
    .from(course)
    .where(eq(course.status, 'ready'));
  const [docCount] = await db.select({ count: count() }).from(knowledgeDoc);

  // Today's API usage
  const today = new Date().toISOString().slice(0, 10);
  const todayUsage = await db
    .select({
      provider: providerUsage.provider,
      requests: sum(providerUsage.requests),
      cost: sum(providerUsage.costUsd),
    })
    .from(providerUsage)
    .where(eq(providerUsage.date, today))
    .groupBy(providerUsage.provider);

  return {
    userCount: userCount.count,
    courseCount: courseCount.count,
    docCount: docCount.count,
    todayUsage,
  };
}

export default async function AdminDashboard() {
  const stats = await getStats();
  const totalTodayCost = stats.todayUsage.reduce((sum, u) => sum + Number(u.cost || 0), 0);
  const totalTodayRequests = stats.todayUsage.reduce((sum, u) => sum + Number(u.requests || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">NeoAcademy system overview</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.userCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Courses</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.courseCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Knowledge Docs</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.docCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s API Cost</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalTodayCost.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">{totalTodayRequests} requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Server health */}
      <HealthStatus />

      {/* Today's provider breakdown */}
      {stats.todayUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s API Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.todayUsage.map((u) => (
                <div key={u.provider} className="flex items-center justify-between text-sm">
                  <span className="capitalize font-medium">{u.provider}</span>
                  <div className="flex gap-6 text-muted-foreground">
                    <span>{Number(u.requests)} reqs</span>
                    <span className="font-mono">${Number(u.cost || 0).toFixed(5)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

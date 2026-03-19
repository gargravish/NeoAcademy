import { db } from '@/lib/db';
import { course, user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen } from 'lucide-react';
import { DeleteCourseButton } from '@/components/admin/delete-course-button';

async function getCourses() {
  return db
    .select({
      id: course.id,
      title: course.title,
      topic: course.topic,
      level: course.level,
      sceneCount: course.sceneCount,
      status: course.status,
      generationCostUsd: course.generationCostUsd,
      packagePath: course.packagePath,
      createdAt: course.createdAt,
      userName: user.name,
    })
    .from(course)
    .leftJoin(user, eq(course.userId, user.id))
    .orderBy(course.createdAt);
}

export default async function CoursesPage() {
  const courses = await getCourses();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <p className="text-muted-foreground">{courses.length} generated course packages</p>
      </div>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <BookOpen className="h-8 w-8" />
            <p>No courses yet. Generate your first course from the home page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {courses.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{c.title}</p>
                    <Badge
                      variant={
                        c.status === 'ready'
                          ? 'default'
                          : c.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="text-xs"
                    >
                      {c.status}
                    </Badge>
                    {c.level && (
                      <Badge variant="outline" className="text-xs">
                        {c.level}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.sceneCount} scenes · ${c.generationCostUsd.toFixed(5)} cost ·{' '}
                    {c.userName && `by ${c.userName} · `}
                    {new Date(c.createdAt!).toLocaleDateString()}
                  </p>
                </div>
                <DeleteCourseButton courseId={c.id} packagePath={c.packagePath} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

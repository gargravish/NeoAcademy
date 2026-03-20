'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function DeleteCourseButton({
  courseId,
  packagePath,
}: {
  courseId: string;
  packagePath: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm('Delete this course? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/courses/' + courseId, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Course deleted');
      router.refresh();
    } catch {
      toast.error('Failed to delete course');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}>
      {deleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4 text-destructive" />
      )}
    </Button>
  );
}

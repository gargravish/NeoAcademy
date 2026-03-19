import { db } from '@/lib/db';
import { knowledgeDoc, user } from '@/lib/db/schema';
import { eq, sum } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database } from 'lucide-react';

async function getDocs() {
  return db
    .select({
      id: knowledgeDoc.id,
      filename: knowledgeDoc.filename,
      fileType: knowledgeDoc.fileType,
      chunkCount: knowledgeDoc.chunkCount,
      sizeBytes: knowledgeDoc.sizeBytes,
      createdAt: knowledgeDoc.createdAt,
      userName: user.name,
    })
    .from(knowledgeDoc)
    .leftJoin(user, eq(knowledgeDoc.userId, user.id))
    .orderBy(knowledgeDoc.createdAt);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function KnowledgeBasePage() {
  const docs = await getDocs();
  const totalSize = docs.reduce((s, d) => s + d.sizeBytes, 0);
  const totalChunks = docs.reduce((s, d) => s + d.chunkCount, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-muted-foreground">
          {docs.length} documents · {totalChunks} chunks · {formatBytes(totalSize)}
        </p>
      </div>

      {docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Database className="h-8 w-8" />
            <p>No documents uploaded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{d.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.chunkCount} chunks · {formatBytes(d.sizeBytes)} ·{' '}
                    {d.userName && `uploaded by ${d.userName} · `}
                    {new Date(d.createdAt!).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs uppercase">
                  {d.fileType}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

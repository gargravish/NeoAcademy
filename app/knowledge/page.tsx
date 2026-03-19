'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, FileText, Globe, Image, Loader2, Plus, Trash2, Upload, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';

interface KnowledgeDoc {
  id: string;
  filename: string;
  fileType: string;
  chunkCount: number;
  sizeBytes: number;
  createdAt: number;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  async function loadDocs() {
    const res = await fetch('/api/knowledge');
    const data = await res.json();
    setDocs(data.docs || []);
    setLoading(false);
  }

  useEffect(() => { loadDocs(); }, []);

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const res = await fetch('/api/knowledge', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      toast.success(`${file.name} ingested — ${data.chunkCount} chunks`);
      await loadDocs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function addUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    const form = new FormData();
    form.append('url', urlInput.trim());
    setUploading(true);
    try {
      const res = await fetch('/api/knowledge', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Failed to add URL');
      toast.success('URL added to knowledge base');
      setUrlInput('');
      await loadDocs();
    } catch {
      toast.error('Failed to add URL');
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(docId: string, filename: string) {
    if (!confirm(`Remove "${filename}" from knowledge base?`)) return;
    const res = await fetch(`/api/knowledge/${docId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Removed');
      setDocs((d) => d.filter((doc) => doc.id !== docId));
    } else {
      toast.error('Failed to remove document');
    }
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        uploadFile(file);
      }
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'video/webm': ['.webm'],
    },
    disabled: uploading,
    multiple: true,
  });

  const totalChunks = docs.reduce((s, d) => s + d.chunkCount, 0);
  const totalSize = docs.reduce((s, d) => s + d.sizeBytes, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Knowledge Base</h1>
            <p className="text-xs text-muted-foreground">
              {docs.length} documents · {totalChunks} chunks · {formatBytes(totalSize)}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {/* File upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              {...getRootProps()}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                uploading && 'pointer-events-none opacity-50',
              )}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">
                {isDragActive
                  ? 'Drop files here'
                  : uploading
                    ? 'Processing… (images/videos may take a minute)'
                    : 'Drop PDF, TXT, MD, images (JPG/PNG/WebP/GIF) or videos (MP4/MOV/WebM)'}
              </p>
              <p className="text-xs text-muted-foreground/70">
                Images and videos are described by Gemini vision and stored as searchable text
              </p>
            </div>

            {/* URL input */}
            <form onSubmit={addUrl} className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Add a URL (article, webpage, documentation)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="pl-9"
                  disabled={uploading}
                />
              </div>
              <Button type="submit" disabled={uploading || !urlInput.trim()} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Document list */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : docs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Database className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>No documents yet. Upload PDFs or add URLs to build your knowledge base.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {doc.fileType === 'image' ? (
                      <Image className="h-4 w-4 shrink-0 text-blue-500" />
                    ) : doc.fileType === 'video' ? (
                      <Video className="h-4 w-4 shrink-0 text-purple-500" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium line-clamp-1">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.chunkCount} chunks · {formatBytes(doc.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs uppercase">
                      {doc.fileType}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDoc(doc.id, doc.filename)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

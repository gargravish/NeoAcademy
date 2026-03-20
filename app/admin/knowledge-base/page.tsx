'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Database,
  FileText,
  Globe,
  Image,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';

interface KnowledgeDoc {
  id: string;
  filename: string;
  fileType: string;
  chunkCount: number;
  sizeBytes: number;
  tags: string | null;
  isGlobal: boolean;
  createdAt: number;
  userId: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function TagInput({
  tags,
  onChange,
  suggestions,
  placeholder = 'Add tags (e.g. biology, gcse)…',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (clean && !tags.includes(clean)) onChange([...tags, clean]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const unused = suggestions.filter((s) => !tags.includes(s));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-2 min-h-[40px]">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 text-xs">
            {tag}
            <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) addTag(input);
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unused.slice(0, 15).map((s) => (
            <button
              key={s}
              onClick={() => addTag(s)}
              className="rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminKnowledgeBasePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [isGlobal, setIsGlobal] = useState(true);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadDocs() {
    const res = await fetch('/api/knowledge?all=true');
    const data = await res.json();
    setDocs(data.docs || []);
    setAllTags(data.allTags || []);
    setLoading(false);
  }

  useEffect(() => {
    loadDocs();
  }, []);

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append('file', file);
    if (uploadTags.length > 0) form.append('tags', uploadTags.join(','));
    form.append('isGlobal', String(isGlobal));
    setUploading(true);
    try {
      const res = await fetch('/api/knowledge', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      toast.success(
        `${file.name} ingested — ${data.chunkCount} chunks${isGlobal ? ' (global)' : ''}`,
      );
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
    if (uploadTags.length > 0) form.append('tags', uploadTags.join(','));
    form.append('isGlobal', String(isGlobal));
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
    if (!confirm(`Permanently remove "${filename}" from the knowledge base?`)) return;
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
      for (const file of acceptedFiles) uploadFile(file);
    },
    [uploadTags, isGlobal],
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

  // Filter docs by tag and search query
  const filteredDocs = docs.filter((doc) => {
    if (filterTag) {
      const docTags = parseTags(doc.tags);
      if (!docTags.includes(filterTag)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!doc.filename.toLowerCase().includes(q) && !(doc.tags || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const totalChunks = docs.reduce((s, d) => s + d.chunkCount, 0);
  const totalSize = docs.reduce((s, d) => s + d.sizeBytes, 0);
  const globalCount = docs.filter((d) => d.isGlobal).length;

  const fileTypeIcon = (ft: string) => {
    if (ft === 'image') return <Image className="h-4 w-4 shrink-0 text-blue-500" />;
    if (ft === 'video') return <Video className="h-4 w-4 shrink-0 text-purple-500" />;
    return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-muted-foreground">
          {docs.length} documents ({globalCount} global) · {totalChunks} chunks ·{' '}
          {formatBytes(totalSize)}
        </p>
      </div>

      {/* Upload section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload shared resources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50',
              uploading && 'pointer-events-none opacity-50',
            )}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {uploading ? 'Processing…' : 'Drop PDF, TXT, MD, images or videos'}
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tags (applied to all uploads)
            </Label>
            <TagInput tags={uploadTags} onChange={setUploadTags} suggestions={allTags} />
          </div>

          {/* Global toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Make available to all users</p>
              <p className="text-xs text-muted-foreground">
                Global documents are searchable by every student during course generation
              </p>
            </div>
            <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
          </div>

          {/* URL input */}
          <form onSubmit={addUrl} className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Add a URL"
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {filterTag && (
          <Badge variant="secondary" className="gap-1">
            Tag: {filterTag}
            <button onClick={() => setFilterTag(null)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {allTags.length > 0 && !filterTag && (
          <div className="flex gap-1 flex-wrap">
            {allTags.slice(0, 10).map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag)}
                className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Database className="h-8 w-8" />
            <p>
              {docs.length === 0
                ? 'No documents uploaded yet.'
                : 'No documents match the current filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc) => {
            const docTags = parseTags(doc.tags);
            return (
              <Card key={doc.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {fileTypeIcon(doc.fileType)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{doc.filename}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {doc.chunkCount} chunks · {formatBytes(doc.sizeBytes)} ·{' '}
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                        {doc.isGlobal && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-blue-300 text-blue-600"
                          >
                            Global
                          </Badge>
                        )}
                        {docTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px] cursor-pointer hover:bg-primary/10"
                            onClick={() => setFilterTag(tag)}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
            );
          })}
        </div>
      )}
    </div>
  );
}

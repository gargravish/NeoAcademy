'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Status = 'checking' | 'ok' | 'error';

interface Service {
  name: string;
  key: string;
}

const SERVICES: Service[] = [
  { name: 'Ollama (Qwen 3.5)', key: 'ollama' },
  { name: 'Kokoro TTS', key: 'tts' },
  { name: 'Whisper ASR', key: 'asr' },
];

export function HealthStatus() {
  const [statuses, setStatuses] = useState<Record<string, Status>>({
    ollama: 'checking',
    tts: 'checking',
    asr: 'checking',
  });

  useEffect(() => {
    fetch('/api/admin/health')
      .then((r) => r.json())
      .then((data: Record<string, boolean>) => {
        setStatuses(
          Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, v ? 'ok' : 'error']),
          ) as Record<string, Status>,
        );
      })
      .catch(() => {
        setStatuses({ ollama: 'error', tts: 'error', asr: 'error' });
      });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Server Health</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-3">
          {SERVICES.map(({ name, key }) => {
            const status = statuses[key];
            return (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                {status === 'checking' && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {status === 'ok' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                <span
                  className={
                    status === 'ok'
                      ? 'text-green-600 dark:text-green-400'
                      : status === 'error'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }
                >
                  {name}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

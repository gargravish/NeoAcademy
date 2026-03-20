'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, TestTube2 } from 'lucide-react';
import { toast } from 'sonner';

interface Providers {
  gemini: { freeKeys: string[]; paidKey: string; paidMonthlyCapGbp: number; enabled: boolean };
  siliconflow: { apiKey: string; baseUrl: string; enabled: boolean };
  openai: { apiKey: string; enabled: boolean };
  ollama: { baseUrl: string; model: string };
  tts: { baseUrl: string; defaultVoice: string };
  asr: { baseUrl: string };
  webSearch: {
    tavily: { apiKey: string; enabled: boolean };
    brave: { apiKey: string; enabled: boolean };
    duckduckgo: { enabled: boolean };
  };
  generation: { concurrencyLimit: number; fallbackChain: string[] };
}

export default function ProvidersPage() {
  const [data, setData] = useState<Providers | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Local editable state
  const [geminiKeys, setGeminiKeys] = useState('');
  const [geminiPaidKey, setGeminiPaidKey] = useState('');
  const [geminiCap, setGeminiCap] = useState('5.00');
  const [sfKey, setSfKey] = useState('');
  const [sfEnabled, setSfEnabled] = useState(false);
  const [oaiKey, setOaiKey] = useState('');
  const [oaiEnabled, setOaiEnabled] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [ttsUrl, setTtsUrl] = useState('');
  const [ttsVoice, setTtsVoice] = useState('');
  const [asrUrl, setAsrUrl] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [braveKey, setBraveKey] = useState('');
  const [concurrency, setConcurrency] = useState('3');

  useEffect(() => {
    fetch('/api/admin/providers')
      .then((r) => r.json())
      .then((d: Providers) => {
        setData(d);
        setGeminiKeys(d.gemini.freeKeys.join(', '));
        setGeminiPaidKey(d.gemini.paidKey || '');
        setGeminiCap(String(d.gemini.paidMonthlyCapGbp));
        setSfKey(d.siliconflow.apiKey);
        setSfEnabled(d.siliconflow.enabled);
        setOaiKey(d.openai.apiKey);
        setOaiEnabled(d.openai.enabled);
        setOllamaUrl(d.ollama.baseUrl);
        setOllamaModel(d.ollama.model);
        setTtsUrl(d.tts.baseUrl);
        setTtsVoice(d.tts.defaultVoice);
        setAsrUrl(d.asr.baseUrl);
        setTavilyKey(d.webSearch.tavily.apiKey);
        setBraveKey(d.webSearch.brave.apiKey);
        setConcurrency(String(d.generation.concurrencyLimit));
      })
      .catch(() => toast.error('Failed to load provider config'))
      .finally(() => setLoading(false));
  }, []);

  async function save(provider: string, config: Record<string, unknown>) {
    setSaving(provider);
    try {
      const res = await fetch('/api/admin/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, config }),
      });
      if (!res.ok) throw new Error();
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(null);
    }
  }

  async function testConnectivity(url: string, label: string) {
    try {
      const res = await fetch('/api/setup/test-connectivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.ok) toast.success(`${label}: connected`);
      else toast.error(`${label}: unreachable`);
    } catch {
      toast.error(`${label}: connection failed`);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading provider config…
      </div>
    );
  }

  const SaveBtn = ({ provider }: { provider: string }) => (
    <Button
      size="sm"
      disabled={saving === provider}
      onClick={() => {
        if (provider === 'gemini')
          save('gemini', {
            freeKeys: geminiKeys
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean),
            paidKey: geminiPaidKey,
            paidMonthlyCapGbp: parseFloat(geminiCap),
            enabled: true,
            generationModel: 'gemini-2.5-flash-lite',
            qualityModel: 'gemini-2.5-flash',
            embeddingModel: 'gemini-embedding-001',
          });
        else if (provider === 'siliconflow')
          save('siliconflow', {
            apiKey: sfKey,
            baseUrl: 'https://api.siliconflow.cn/v1',
            enabled: sfEnabled,
          });
        else if (provider === 'openai') save('openai', { apiKey: oaiKey, enabled: oaiEnabled });
        else if (provider === 'ollama')
          save('ollama', { baseUrl: ollamaUrl, model: ollamaModel, apiKey: 'ollama' });
        else if (provider === 'tts')
          save('tts', { baseUrl: ttsUrl, defaultVoice: ttsVoice, apiKey: 'kokoro' });
        else if (provider === 'asr') save('asr', { baseUrl: asrUrl, apiKey: 'whisper' });
        else if (provider === 'webSearch')
          save('webSearch', {
            tavily: { apiKey: tavilyKey, enabled: !!tavilyKey },
            brave: { apiKey: braveKey, enabled: !!braveKey },
            duckduckgo: { enabled: true },
          });
        else if (provider === 'generation')
          save('generation', {
            concurrencyLimit: parseInt(concurrency),
            fallbackChain: data?.generation.fallbackChain,
            defaultModel: 'gemini:gemini-2.5-flash-lite',
            qualityModel: 'gemini:gemini-2.5-flash',
          });
      }}
    >
      {saving === provider ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Save className="h-3 w-3" />
      )}
      Save
    </Button>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Providers</h1>
        <p className="text-muted-foreground">Configure API keys and server URLs</p>
      </div>

      {/* Gemini */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gemini (Primary Generation)</CardTitle>
          <CardDescription>
            Multi-key rotation across GCP projects for maximum free tier
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              Free tier API keys{' '}
              <span className="text-muted-foreground text-xs">
                (comma-separated, one per GCP project)
              </span>
            </Label>
            <Input
              placeholder="AIzaSy..., AIzaSy..., AIzaSy..."
              value={geminiKeys}
              onChange={(e) => setGeminiKeys(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Paid key (optional, Tier 1)</Label>
              <Input
                type="password"
                placeholder="AIzaSy..."
                value={geminiPaidKey}
                onChange={(e) => setGeminiPaidKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Monthly cap (£)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={geminiCap}
                onChange={(e) => setGeminiCap(e.target.value)}
              />
            </div>
          </div>
          <SaveBtn provider="gemini" />
        </CardContent>
      </Card>

      {/* SiliconFlow */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">SiliconFlow (Overflow)</CardTitle>
              <CardDescription>GLM-5, MiniMax, Kimi — cheap pay-as-you-go</CardDescription>
            </div>
            <Switch checked={sfEnabled} onCheckedChange={setSfEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API key</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={sfKey}
              onChange={(e) => setSfKey(e.target.value)}
            />
          </div>
          <SaveBtn provider="siliconflow" />
        </CardContent>
      </Card>

      {/* OpenAI (optional) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">OpenAI (Optional)</CardTitle>
              <CardDescription>GPT-5-nano fallback (~$0.50/month for 30 courses)</CardDescription>
            </div>
            <Switch checked={oaiEnabled} onCheckedChange={setOaiEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API key</Label>
            <Input
              type="password"
              placeholder="sk-..."
              value={oaiKey}
              onChange={(e) => setOaiKey(e.target.value)}
            />
          </div>
          <SaveBtn provider="openai" />
        </CardContent>
      </Card>

      {/* Ollama */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ollama (Local Runtime)</CardTitle>
          <CardDescription>
            Qwen 3.5 on your local server — all runtime chat/grading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Server URL</Label>
              <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <SaveBtn provider="ollama" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnectivity(ollamaUrl, 'Ollama')}
            >
              <TestTube2 className="h-3 w-3 mr-1" /> Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TTS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kokoro TTS</CardTitle>
          <CardDescription>Local TTS — pre-generation audio + runtime speech</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Server URL</Label>
              <Input value={ttsUrl} onChange={(e) => setTtsUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Default voice</Label>
              <Input
                placeholder="af_bella"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <SaveBtn provider="tts" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnectivity(ttsUrl, 'Kokoro TTS')}
            >
              <TestTube2 className="h-3 w-3 mr-1" /> Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ASR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Whisper ASR</CardTitle>
          <CardDescription>Local speech-to-text for voice input during lessons</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Server URL</Label>
            <Input value={asrUrl} onChange={(e) => setAsrUrl(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <SaveBtn provider="asr" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnectivity(asrUrl, 'Whisper ASR')}
            >
              <TestTube2 className="h-3 w-3 mr-1" /> Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Web Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Web Search</CardTitle>
          <CardDescription>Used during course generation to enrich content</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Tavily API key{' '}
                <span className="text-muted-foreground text-xs">(1,000 free/mo)</span>
              </Label>
              <Input
                type="password"
                placeholder="tvly-..."
                value={tavilyKey}
                onChange={(e) => setTavilyKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Brave Search API key{' '}
                <span className="text-muted-foreground text-xs">(2,000 free/mo)</span>
              </Label>
              <Input
                type="password"
                placeholder="BSA..."
                value={braveKey}
                onChange={(e) => setBraveKey(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            DuckDuckGo is always enabled (unlimited, no key needed)
          </p>
          <SaveBtn provider="webSearch" />
        </CardContent>
      </Card>

      {/* Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generation Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Parallel scene generation limit</Label>
            <Input
              type="number"
              min="1"
              max="10"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Lower = fewer rate limit hits. Higher = faster generation.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Fallback chain</Label>
            <div className="rounded-md border p-2 text-sm text-muted-foreground font-mono">
              {data?.generation.fallbackChain.join(' → ')}
            </div>
          </div>
          <SaveBtn provider="generation" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Unified web search client.
 * Tries providers in order: Tavily → Brave → DuckDuckGo (always free)
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('WebSearch');

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface SearchOptions {
  maxResults?: number;
  includeAnswer?: boolean;
}

/** Search using the best available provider */
export async function webSearch(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const { maxResults = 5 } = opts;
  const { getWebSearchConfig } = await import('@/lib/db/config');
  const config = await getWebSearchConfig();

  // 1. Try Tavily
  if (config.tavily.enabled && config.tavily.apiKey) {
    try {
      const results = await tavilySearch(query, config.tavily.apiKey, maxResults);
      if (results.length > 0) {
        log.info(`Web search via Tavily: ${results.length} results`);
        return results;
      }
    } catch (err) {
      log.warn('Tavily search failed:', err);
    }
  }

  // 2. Try Brave
  if (config.brave.enabled && config.brave.apiKey) {
    try {
      const results = await braveSearch(query, config.brave.apiKey, maxResults);
      if (results.length > 0) {
        log.info(`Web search via Brave: ${results.length} results`);
        return results;
      }
    } catch (err) {
      log.warn('Brave search failed:', err);
    }
  }

  // 3. DuckDuckGo (always available, no key needed)
  try {
    const results = await duckduckgoSearch(query, maxResults);
    log.info(`Web search via DuckDuckGo: ${results.length} results`);
    return results;
  } catch (err) {
    log.warn('DuckDuckGo search failed:', err);
  }

  return [];
}

async function tavilySearch(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json() as {
    results: { title: string; url: string; content: string; score: number }[];
  };

  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
  }));
}

async function braveSearch(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const data = await res.json() as {
    web?: { results?: { title: string; url: string; description: string }[] };
  };

  return (data.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.description || '',
  }));
}

async function duckduckgoSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  // DuckDuckGo Instant Answers API (free, no key)
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_redirect', '1');
  url.searchParams.set('no_html', '1');

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);

  const data = await res.json() as {
    AbstractText?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    RelatedTopics?: { Text?: string; FirstURL?: string }[];
  };

  const results: SearchResult[] = [];

  if (data.AbstractText) {
    results.push({
      title: data.AbstractSource || query,
      url: data.AbstractURL || '',
      content: data.AbstractText,
    });
  }

  for (const topic of (data.RelatedTopics || []).slice(0, maxResults - 1)) {
    if (topic.Text && topic.FirstURL) {
      results.push({ title: topic.Text.slice(0, 100), url: topic.FirstURL, content: topic.Text });
    }
  }

  return results.slice(0, maxResults);
}

/** Format search results for inclusion in a generation prompt */
export function formatSearchResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return '';

  const formatted = results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`)
    .join('\n\n');

  return `--- Current web context ---\n${formatted}\n--- End web context ---`;
}

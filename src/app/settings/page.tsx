'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useSettingsStore } from '@/store/settingsStore';
import { CardDatabase } from '@/cards/CardDatabase';
import { ArrowLeft, Bot, Database, Save, Check, Download, Loader2, Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const { aiProvider, setAIProvider, cardDataLoaded, cardDataProgress, setCardDataLoaded, setCardDataProgress } = useSettingsStore();
  const [provider, setProvider] = useState<'groq' | 'openai' | 'anthropic' | 'custom'>(aiProvider?.provider || 'groq');
  const [apiKey, setApiKey] = useState(aiProvider?.apiKey || '');
  const [model, setModel] = useState(aiProvider?.model || '');
  const [saved, setSaved] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [loadStatus, setLoadStatus] = useState('');
  const [cardCount, setCardCount] = useState<number | null>(null);

  // Check IndexedDB card count on mount
  useEffect(() => {
    const cardDb = CardDatabase.getInstance();
    cardDb.getCardCount().then((count) => {
      setCardCount(count);
      setCardDataLoaded(count > 0);
    });
  }, [setCardDataLoaded]);

  const handleLoadCards = useCallback(async () => {
    if (loadingCards) return;
    setLoadingCards(true);
    setLoadStatus('');
    setCardDataProgress(0);

    try {
      const cardDb = CardDatabase.getInstance();
      const total = await cardDb.loadFromStream(
        '/api/cards/bulk',
        (loaded, estimated) => {
          const progress = estimated > 0 ? loaded / estimated : 0;
          setCardDataProgress(progress);
          setLoadStatus(`Loaded ${loaded.toLocaleString()} cards...`);
        },
        (status) => setLoadStatus(status),
      );
      setCardCount(total);
      setCardDataLoaded(true);
      setLoadStatus(`Done — ${total.toLocaleString()} cards loaded`);
    } catch (err) {
      setLoadStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingCards(false);
    }
  }, [loadingCards, setCardDataLoaded, setCardDataProgress]);

  const handleClearCards = useCallback(async () => {
    const { db } = await import('@/lib/db');
    await db.cards.clear();
    setCardCount(0);
    setCardDataLoaded(false);
    setCardDataProgress(0);
    setLoadStatus('Card data cleared');
  }, [setCardDataLoaded, setCardDataProgress]);

  const defaultModels: Record<string, string> = {
    groq: 'llama-3.1-8b-instant',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-haiku-20240307',
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      setAIProvider(null);
    } else {
      setAIProvider({
        provider: provider as 'groq' | 'openai' | 'anthropic',
        apiKey,
        model: model || defaultModels[provider] || '',
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border/50 px-6 py-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        {/* AI Provider */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-gold" />
              AI Provider
            </CardTitle>
            <CardDescription>
              Configure the LLM that powers AI opponents. Without a key, the
              fallback heuristic AI is used.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label>Provider</Label>
              <div className="mt-1 flex gap-2">
                {(['groq', 'openai', 'anthropic'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setProvider(p);
                      setModel(defaultModels[p] || '');
                    }}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                      provider === p
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/50 text-muted-foreground hover:border-border'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Stored locally in your browser. Never sent to our servers.
              </p>
            </div>

            <div>
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder={defaultModels[provider] || 'model name'}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <Button onClick={handleSave} className="w-full gap-2 sm:w-auto">
              {saved ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Card Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-gold" />
              Card Database
            </CardTitle>
            <CardDescription>
              Load Scryfall card data into your browser for instant lookups,
              deck building, and card images. This is required for importing real decks.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Status */}
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 shrink-0 rounded-full ${
                  cardDataLoaded ? 'bg-green-500' : loadingCards ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground'
                }`}
              />
              <span className="text-sm">
                {cardDataLoaded && cardCount
                  ? `${cardCount.toLocaleString()} cards loaded`
                  : loadingCards
                    ? loadStatus || 'Loading...'
                    : 'Not loaded'}
              </span>
            </div>

            {/* Progress bar */}
            {(loadingCards || (cardDataProgress > 0 && cardDataProgress < 1)) && (
              <div className="w-full overflow-hidden rounded-full bg-muted/50 h-2">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${Math.round(cardDataProgress * 100)}%` }}
                />
              </div>
            )}

            {/* Status message */}
            {loadStatus && !cardDataLoaded && (
              <p className="text-xs text-muted-foreground">{loadStatus}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleLoadCards}
                disabled={loadingCards}
                className="gap-2"
                variant={cardDataLoaded ? 'secondary' : 'default'}
              >
                {loadingCards ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : cardDataLoaded ? (
                  <>
                    <Download className="h-4 w-4" />
                    Reload Data
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Load Card Data
                  </>
                )}
              </Button>

              {cardDataLoaded && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCards}
                  className="gap-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Reads the local Scryfall dataset (~500MB), filters to Commander-legal cards,
              and caches them in your browser&apos;s IndexedDB. Takes 30-60 seconds.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

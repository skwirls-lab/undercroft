'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Database, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function PopulateCardsPage() {
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePopulate = async () => {
    setLoading(true);
    setDone(false);
    setError(null);
    setStatus('Connecting to local card data...');
    setProgress(null);

    try {
      // Import Firebase and Firestore on client side
      const { getFirebaseDb } = await import('@/lib/firebase/config');
      const { writeBatch, collection, doc } = await import('firebase/firestore');
      
      const db = getFirebaseDb();
      if (!db) {
        throw new Error('Firebase not configured');
      }

      setStatus('Connecting to Scryfall...');
      
      // Use server-side streaming endpoint
      const response = await fetch('/api/admin/stream-scryfall');
      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let batchCards: any[] = [];
      const BATCH_SIZE = 500;
      const cardsCollection = collection(db, 'cards');
      let totalUploaded = 0;
      let totalProcessed = 0;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            // Handle SSE format (data: {...})
            let jsonStr = line;
            if (line.startsWith('data: ')) {
              jsonStr = line.slice(6);
            }
            
            const data = JSON.parse(jsonStr);
            
            // Handle status messages
            if (data.status) {
              setStatus(data.status);
              continue;
            }
            if (data.error) {
              throw new Error(data.error);
            }
            if (data.done) {
              break;
            }
            if (data.progress) {
              continue; // Server sends progress, we track our own
            }
            
            // It's a card object
            totalProcessed++;

            // Add to batch
            batchCards.push(data);

            // Upload batch when full
            if (batchCards.length >= BATCH_SIZE) {
              const batch = writeBatch(db);
              for (const c of batchCards) {
                const docRef = doc(cardsCollection, c.id);
                batch.set(docRef, c);
              }
              await batch.commit();
              totalUploaded += batchCards.length;
              
              setStatus(`Uploaded ${totalUploaded.toLocaleString()} cards`);
              setProgress({
                current: totalUploaded,
                total: 25000,
                percent: Math.min(100, (totalUploaded / 25000) * 100),
              });
              
              batchCards = [];
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          } catch (err) {
            console.error('Failed to parse card:', line.substring(0, 100), err);
          }
        }
      }

      // Upload final batch
      if (batchCards.length > 0) {
        const batch = writeBatch(db);
        for (const c of batchCards) {
          const docRef = doc(cardsCollection, c.id);
          batch.set(docRef, c);
        }
        await batch.commit();
        totalUploaded += batchCards.length;
      }

      setStatus(`Complete! Uploaded ${totalUploaded.toLocaleString()} cards`);
      setProgress({
        current: totalUploaded,
        total: totalUploaded,
        percent: 100,
      });
      setDone(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Populate Card Database
          </CardTitle>
          <CardDescription>
            This will download ~25,000 Commander-legal cards from Scryfall and upload them to Firestore.
            This is a one-time operation that takes about 20-30 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!loading && !done && !error && (
            <Button onClick={handlePopulate} size="lg" className="w-full">
              <Database className="mr-2 h-5 w-5" />
              Start Population
            </Button>
          )}

          {loading && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm font-medium">{status}</span>
              </div>

              {progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()} cards</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium text-green-500">Success!</p>
                <p className="text-sm text-muted-foreground">{status}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  All users can now import decks with automatic card resolution.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium text-red-500">Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">What this does:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Fetches latest Scryfall bulk data</li>
              <li>Filters to Commander-legal, English, non-token cards</li>
              <li>Uploads to Firestore in batches</li>
              <li>Makes card data available to all users instantly</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

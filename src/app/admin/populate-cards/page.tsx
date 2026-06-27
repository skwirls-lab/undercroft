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
    setStatus('Initializing...');
    setProgress(null);

    try {
      // Import Firebase and Firestore on client side
      const { getFirebaseDb } = await import('@/lib/firebase/config');
      const { writeBatch, collection, doc } = await import('firebase/firestore');
      
      const db = getFirebaseDb();
      if (!db) {
        throw new Error('Firebase not configured');
      }

      setStatus('Fetching Scryfall bulk data list...');
      
      // Step 1: Get bulk data URL
      const bulkResponse = await fetch('https://api.scryfall.com/bulk-data', {
        headers: {
          'User-Agent': 'Undercroft/1.0',
          'Accept': 'application/json',
        },
      });
      
      if (!bulkResponse.ok) {
        throw new Error(`Scryfall API error: ${bulkResponse.status}`);
      }
      
      const bulkData = await bulkResponse.json() as { data: Array<{ type: string; download_uri: string; name: string }> };
      const defaultCards = bulkData.data.find(d => d.type === 'default_cards');
      
      if (!defaultCards) {
        throw new Error('Could not find default_cards bulk data');
      }

      setStatus(`Downloading ${defaultCards.name}... (this may take a minute)`);

      // Step 2: Download all cards as JSON array
      const cardsResponse = await fetch(defaultCards.download_uri);
      if (!cardsResponse.ok) {
        throw new Error(`Failed to download cards: ${cardsResponse.status}`);
      }

      setStatus('Parsing card data...');
      const allCards = await cardsResponse.json() as any[];
      
      setStatus(`Filtering ${allCards.length.toLocaleString()} cards...`);
      
      // Filter to Commander-legal cards
      const filtered = allCards.filter(card => 
        card.lang === 'en' && 
        card.layout !== 'token' && 
        card.layout !== 'art_series' && 
        card.layout !== 'double_faced_token' &&
        card.legalities?.commander === 'legal'
      );

      setStatus(`Uploading ${filtered.length.toLocaleString()} Commander-legal cards...`);

      // Upload in batches
      const BATCH_SIZE = 500;
      const cardsCollection = collection(db, 'cards');
      let totalUploaded = 0;

      for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = filtered.slice(i, i + BATCH_SIZE);

        for (const c of chunk) {
          const slim: any = {
            id: c.id,
            oracle_id: c.oracle_id || '',
            name: c.name,
            mana_cost: c.mana_cost || '',
            cmc: c.cmc || 0,
            type_line: c.type_line || '',
            oracle_text: c.oracle_text || '',
            colors: c.colors || [],
            color_identity: c.color_identity || [],
            keywords: c.keywords || [],
            layout: c.layout || 'normal',
            legalities: { commander: 'legal' },
            set: c.set || '',
            set_name: c.set_name || '',
            rarity: c.rarity || '',
          };
          
          if (c.power !== undefined) slim.power = c.power;
          if (c.toughness !== undefined) slim.toughness = c.toughness;
          if (c.loyalty !== undefined) slim.loyalty = c.loyalty;
          if (c.image_uris) slim.image_uris = c.image_uris;
          
          const docRef = doc(cardsCollection, c.id);
          batch.set(docRef, slim);
        }
        
        await batch.commit();
        totalUploaded += chunk.length;
        
        const percent = ((totalUploaded / filtered.length) * 100).toFixed(1);
        setStatus(`Uploaded ${totalUploaded.toLocaleString()} / ${filtered.length.toLocaleString()} cards`);
        setProgress({
          current: totalUploaded,
          total: filtered.length,
          percent: parseFloat(percent),
        });
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setStatus(`Complete! Uploaded ${totalUploaded.toLocaleString()} cards`);
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

'use client';

import { useState } from 'react';
import { Upload, CheckCircle, XCircle } from 'lucide-react';

export default function ImportMissingCardsPage() {
  const [cardNames, setCardNames] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; success: boolean; message: string }>>([]);

  const handleImport = async () => {
    const names = cardNames
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (names.length === 0) {
      alert('Please enter at least one card name');
      return;
    }

    setImporting(true);
    setResults([]);

    try {
      const { getFirebaseDb } = await import('@/lib/firebase/config');
      const { writeBatch, collection, doc } = await import('firebase/firestore');

      const db = getFirebaseDb();
      if (!db) {
        throw new Error('Firebase not configured');
      }

      const cardsCollection = collection(db, 'cards');
      const importResults: Array<{ name: string; success: boolean; message: string }> = [];

      for (const name of names) {
        try {
          // Search Scryfall for exact card name
          const searchUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
          const response = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Undercroft/1.0'
            }
          });

          if (!response.ok) {
            if (response.status === 404) {
              importResults.push({ name, success: false, message: 'Card not found on Scryfall' });
            } else {
              importResults.push({ name, success: false, message: `HTTP ${response.status}` });
            }
            continue;
          }

          const cardData = await response.json();

          // Filter out if not Commander legal
          if (cardData.legalities?.commander !== 'legal') {
            importResults.push({ name, success: false, message: 'Not Commander legal' });
            continue;
          }

          // Add to Firestore
          const batch = writeBatch(db);
          const docRef = doc(cardsCollection, cardData.id);
          batch.set(docRef, cardData);
          await batch.commit();

          // Show the actual name stored in Firestore
          const storedName = cardData.name;
          const nameMatch = storedName === name ? '' : ` → Stored as: "${storedName}"`;
          importResults.push({ name, success: true, message: `✓ Imported (${cardData.set.toUpperCase()})${nameMatch}` });

          // Rate limit: Scryfall allows 10 requests per second
          await new Promise(resolve => setTimeout(resolve, 150));
        } catch (err) {
          importResults.push({ 
            name, 
            success: false, 
            message: err instanceof Error ? err.message : 'Unknown error' 
          });
        }

        setResults([...importResults]);
      }
    } catch (err) {
      console.error('Import error:', err);
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Upload className="w-8 h-8 text-purple-400" />
            <h1 className="text-3xl font-bold text-white">Import Missing Cards</h1>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Card Names (one per line)
              </label>
              <textarea
                value={cardNames}
                onChange={(e) => setCardNames(e.target.value)}
                placeholder="Hope's Aero Magic&#10;The Emperor of Palamecia&#10;Vivi's Thunder Magic"
                rows={10}
                disabled={importing}
                className="w-full bg-gray-900 text-white px-4 py-3 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">
                Enter exact card names as they appear on Scryfall. This will fetch each card individually.
              </p>
            </div>

            <button
              onClick={handleImport}
              disabled={importing || !cardNames.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {importing ? 'Importing...' : 'Import Cards'}
            </button>

            {results.length > 0 && (
              <div className="bg-gray-900/50 rounded-lg p-6 border border-purple-500/30">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-white">Import Results</h2>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-400">✓ {successCount}</span>
                    <span className="text-red-400">✗ {failCount}</span>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {results.map((result, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded ${
                        result.success ? 'bg-green-900/20' : 'bg-red-900/20'
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{result.name}</div>
                        <div className={`text-sm ${result.success ? 'text-green-300' : 'text-red-300'}`}>
                          {result.message}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

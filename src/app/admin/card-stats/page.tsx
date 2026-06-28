'use client';

import { useState } from 'react';
import { Database } from 'lucide-react';

export default function CardStatsPage() {
  const [stats, setStats] = useState<{ total: number; loading: boolean }>({
    total: 0,
    loading: false,
  });

  const checkCount = async () => {
    setStats({ total: 0, loading: true });
    
    try {
      const { getFirebaseDb } = await import('@/lib/firebase/config');
      const { collection, getCountFromServer } = await import('firebase/firestore');
      
      const db = getFirebaseDb();
      if (!db) {
        throw new Error('Firebase not configured');
      }

      const cardsCollection = collection(db, 'cards');
      const snapshot = await getCountFromServer(cardsCollection);
      
      setStats({ total: snapshot.data().count, loading: false });
    } catch (err) {
      console.error('Failed to get count:', err);
      setStats({ total: 0, loading: false });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Database className="w-8 h-8 text-purple-400" />
            <h1 className="text-3xl font-bold text-white">Card Statistics</h1>
          </div>

          <div className="space-y-6">
            <button
              onClick={checkCount}
              disabled={stats.loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {stats.loading ? 'Counting...' : 'Check Card Count'}
            </button>

            {stats.total > 0 && (
              <div className="bg-gray-900/50 rounded-lg p-6 border border-purple-500/30">
                <div className="text-center">
                  <div className="text-5xl font-bold text-purple-400 mb-2">
                    {stats.total.toLocaleString()}
                  </div>
                  <div className="text-gray-400">Total Cards in Firestore</div>
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <div className="text-sm text-gray-400">
                    <p className="mb-2">Expected from Scryfall: ~25,000 cards</p>
                    <p className="mb-2">
                      Coverage: {((stats.total / 25000) * 100).toFixed(1)}%
                    </p>
                    {stats.total < 25000 && (
                      <p className="text-yellow-400 mt-4">
                        ⚠️ Missing {(25000 - stats.total).toLocaleString()} cards
                      </p>
                    )}
                    {stats.total >= 25000 && (
                      <p className="text-green-400 mt-4">
                        ✓ All cards loaded successfully!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

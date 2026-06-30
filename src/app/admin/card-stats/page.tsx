'use client';

import { useState } from 'react';
import { Database, Search } from 'lucide-react';

export default function CardStatsPage() {
  const [stats, setStats] = useState<{ total: number; loading: boolean }>({
    total: 0,
    loading: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

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

  const searchCards = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setSearchResults([]);
    
    try {
      const { getFirebaseDb } = await import('@/lib/firebase/config');
      const { collection, query, where, getDocs, limit } = await import('firebase/firestore');
      
      const db = getFirebaseDb();
      if (!db) {
        throw new Error('Firebase not configured');
      }

      const cardsCollection = collection(db, 'cards');
      
      // Try exact match first
      let q = query(cardsCollection, where('name', '==', searchQuery.trim()), limit(10));
      let snapshot = await getDocs(q);
      let results = snapshot.docs.map(d => d.data());
      
      // If no exact match, try prefix search
      if (results.length === 0) {
        q = query(
          cardsCollection,
          where('name', '>=', searchQuery.trim()),
          where('name', '<=', searchQuery.trim() + '\uf8ff'),
          limit(10)
        );
        snapshot = await getDocs(q);
        results = snapshot.docs.map(d => d.data());
      }
      
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
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
            {/* Card Search */}
            <div className="bg-gray-900/50 rounded-lg p-6 border border-blue-500/30">
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold text-white">Search Cards</h2>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchCards()}
                  placeholder="Enter card name..."
                  className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={searchCards}
                  disabled={searching || !searchQuery.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-gray-400">Found {searchResults.length} card(s):</p>
                  {searchResults.map((card: any, idx: number) => (
                    <div key={idx} className="bg-gray-800/50 p-3 rounded border border-gray-700">
                      <div className="font-semibold text-white">{card.name}</div>
                      <div className="text-sm text-gray-400">
                        {card.type_line} • {card.set_name} ({card.set?.toUpperCase()})
                      </div>
                      <div className="text-xs text-gray-500 mt-1">ID: {card.id}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {!searching && searchQuery && searchResults.length === 0 && (
                <div className="mt-4 text-yellow-400 text-sm">
                  ⚠️ No cards found matching "{searchQuery}"
                </div>
              )}
            </div>

            {/* Card Count */}
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
                    <p className="mb-2">Expected from Scryfall: ~90,000 cards (unique artwork)</p>
                    <p className="mb-2">
                      Coverage: {((stats.total / 90000) * 100).toFixed(1)}%
                    </p>
                    {stats.total < 90000 && (
                      <p className="text-yellow-400 mt-4">
                        ⚠️ Missing {(90000 - stats.total).toLocaleString()} cards
                      </p>
                    )}
                    {stats.total >= 90000 && (
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

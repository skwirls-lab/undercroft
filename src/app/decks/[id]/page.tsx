'use client';

import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { DeckDetail } from '@/components/decks/DeckDetail';

/** One deck from the vault, by id. Everything is client state; the id is the only input. */
export default function DeckPage() {
  const params = useParams<{ id: string }>();
  return (
    <AuthGuard>
      <DeckDetail deckId={decodeURIComponent(params.id)} />
    </AuthGuard>
  );
}

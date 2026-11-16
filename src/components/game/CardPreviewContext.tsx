'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { CardInstance } from '@/lib/gameTypes';

interface CardPreviewContextType {
  previewCard: CardInstance | null;
  setPreviewCard: (card: CardInstance | null) => void;
  /** False outside a provider, where previewCard is never set; consumers keep their own state. */
  hasProvider: boolean;
}

const CardPreviewContext = createContext<CardPreviewContextType>({
  previewCard: null,
  setPreviewCard: () => {},
  hasProvider: false,
});

export function CardPreviewProvider({ children }: { children: ReactNode }) {
  const [previewCard, setPreviewCardRaw] = useState<CardInstance | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPreviewCard = useCallback((card: CardInstance | null) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (card) {
      timeoutRef.current = setTimeout(() => setPreviewCardRaw(card), 40);
    } else {
      timeoutRef.current = setTimeout(() => setPreviewCardRaw(null), 200);
    }
  }, []);

  return (
    <CardPreviewContext.Provider value={{ previewCard, setPreviewCard, hasProvider: true }}>
      {children}
    </CardPreviewContext.Provider>
  );
}

export function useCardPreview() {
  return useContext(CardPreviewContext);
}

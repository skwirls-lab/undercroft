'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { CardInstance } from '@/engine/types';

interface CardPreviewContextType {
  previewCard: CardInstance | null;
  setPreviewCard: (card: CardInstance | null) => void;
}

const CardPreviewContext = createContext<CardPreviewContextType>({
  previewCard: null,
  setPreviewCard: () => {},
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
    <CardPreviewContext.Provider value={{ previewCard, setPreviewCard }}>
      {children}
    </CardPreviewContext.Provider>
  );
}

export function useCardPreview() {
  return useContext(CardPreviewContext);
}

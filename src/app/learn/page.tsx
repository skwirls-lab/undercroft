import type { Metadata } from 'next';
import { LearnIndex } from '@/components/learn/LearnIndex';

export const metadata: Metadata = { title: 'Learn Commander — Undercroft' };

/** The Apprentice's shelf: every lesson, free to read, no sign-in needed. */
export default function LearnPage() {
  return <LearnIndex />;
}

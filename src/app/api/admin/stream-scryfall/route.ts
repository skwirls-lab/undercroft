/**
 * Server-side endpoint to stream Scryfall data directly
 * This avoids the 500MB download in the browser
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Get bulk data URL
        const bulkResponse = await fetch('https://api.scryfall.com/bulk-data', {
          headers: {
            'User-Agent': 'Undercroft/1.0',
            'Accept': 'application/json',
          },
        });

        if (!bulkResponse.ok) {
          controller.enqueue(encoder.encode(`data: {"error": "Failed to fetch bulk data list: ${bulkResponse.status}"}\n\n`));
          controller.close();
          return;
        }

        const bulkData = await bulkResponse.json() as { data: Array<{ type: string; download_uri: string; name: string }> };
        const defaultCards = bulkData.data.find(d => d.type === 'default_cards');

        if (!defaultCards) {
          controller.enqueue(encoder.encode('data: {"error": "Could not find default_cards"}\n\n'));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: {"status": "Downloading ${defaultCards.name}..."}\n\n`));

        // Step 2: Stream the Scryfall data
        const cardsResponse = await fetch(defaultCards.download_uri);
        if (!cardsResponse.body) {
          controller.enqueue(encoder.encode('data: {"error": "No response body from Scryfall"}\n\n'));
          controller.close();
          return;
        }

        const reader = cardsResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let totalSent = 0;

        controller.enqueue(encoder.encode('data: {"status": "Streaming cards..."}\n\n'));

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '[' || trimmed === ']' || !trimmed) continue;

            let jsonStr = trimmed;
            if (jsonStr.endsWith(',')) {
              jsonStr = jsonStr.slice(0, -1);
            }

            if (!jsonStr.startsWith('{')) continue;

            try {
              const card = JSON.parse(jsonStr);

              // Filter
              if (card.lang !== 'en') continue;
              if (card.layout === 'token' || card.layout === 'art_series' || card.layout === 'double_faced_token') continue;
              if (!card.legalities || card.legalities.commander !== 'legal') continue;

              // Send filtered card
              controller.enqueue(encoder.encode(JSON.stringify(card) + '\n'));
              totalSent++;

              // Send progress update every 500 cards
              if (totalSent % 500 === 0) {
                controller.enqueue(encoder.encode(`data: {"progress": ${totalSent}}\n\n`));
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        controller.enqueue(encoder.encode(`data: {"done": true, "total": ${totalSent}}\n\n`));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(encoder.encode(`data: {"error": "${message}"}\n\n`));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

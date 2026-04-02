import { NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';

// Path to the Scryfall data file (relative to workspace root, one level up from Next.js project)
const DATA_PATH = path.resolve(process.cwd(), '..', 'data', 'scryfall', 'default-cards-20260315090814.json');

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  let totalSent = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const fileStream = createReadStream(DATA_PATH, { encoding: 'utf-8' });
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

        // Send metadata header line first
        controller.enqueue(encoder.encode(JSON.stringify({ _meta: true, totalLines: 112630 }) + '\n'));

        for await (const line of rl) {
          // Skip array brackets
          const trimmed = line.trim();
          if (trimmed === '[' || trimmed === ']') continue;

          // Strip trailing comma
          let jsonStr = trimmed;
          if (jsonStr.endsWith(',')) {
            jsonStr = jsonStr.slice(0, -1);
          }

          if (!jsonStr.startsWith('{')) continue;

          try {
            const card = JSON.parse(jsonStr);

            // Filter: English, non-token, non-art_series
            if (card.lang !== 'en') continue;
            if (card.layout === 'token' || card.layout === 'art_series' || card.layout === 'double_faced_token') continue;

            // Filter: commander-legal
            if (!card.legalities || card.legalities.commander !== 'legal') continue;

            // Extract only the fields we need (reduce payload significantly)
            const slim = {
              id: card.id,
              oracle_id: card.oracle_id || '',
              name: card.name,
              mana_cost: card.mana_cost || '',
              cmc: card.cmc || 0,
              type_line: card.type_line || '',
              oracle_text: card.oracle_text || '',
              colors: card.colors || [],
              color_identity: card.color_identity || [],
              keywords: card.keywords || [],
              power: card.power,
              toughness: card.toughness,
              loyalty: card.loyalty,
              produced_mana: card.produced_mana,
              layout: card.layout || 'normal',
              image_uris: card.image_uris
                ? {
                    small: card.image_uris.small || '',
                    normal: card.image_uris.normal || '',
                    large: card.image_uris.large || '',
                    art_crop: card.image_uris.art_crop || '',
                    border_crop: card.image_uris.border_crop || '',
                    png: card.image_uris.png || '',
                  }
                : undefined,
              card_faces: card.card_faces?.map((face: Record<string, unknown>) => ({
                name: face.name || '',
                mana_cost: face.mana_cost || '',
                type_line: face.type_line || '',
                oracle_text: face.oracle_text || '',
                power: face.power,
                toughness: face.toughness,
                image_uris: (face.image_uris as Record<string, string> | undefined)
                  ? {
                      small: (face.image_uris as Record<string, string>).small || '',
                      normal: (face.image_uris as Record<string, string>).normal || '',
                      large: (face.image_uris as Record<string, string>).large || '',
                      art_crop: (face.image_uris as Record<string, string>).art_crop || '',
                      border_crop: (face.image_uris as Record<string, string>).border_crop || '',
                      png: (face.image_uris as Record<string, string>).png || '',
                    }
                  : undefined,
              })),
              legalities: { commander: 'legal' },
              set: card.set || '',
              set_name: card.set_name || '',
              rarity: card.rarity || '',
            };

            controller.enqueue(encoder.encode(JSON.stringify(slim) + '\n'));
            totalSent++;
          } catch {
            // Skip malformed lines
          }
        }

        // End marker
        controller.enqueue(encoder.encode(JSON.stringify({ _done: true, total: totalSent }) + '\n'));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}

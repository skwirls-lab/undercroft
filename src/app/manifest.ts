import type { MetadataRoute } from 'next';

/**
 * Web app manifest, so "Add to Home Screen" installs Undercroft with the Keystone as its icon
 * and opens it without browser chrome. Icons are rendered from src/app/icon.svg by
 * scripts/render-icons.mjs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Undercroft — MTG Commander',
    short_name: 'Undercroft',
    description: 'Play Magic: The Gathering Commander against AI opponents in your browser.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#15110d',
    theme_color: '#15110d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

# Card Data Setup Guide

## Problem
The app currently requires each user to manually import ~25,000 cards from Scryfall into their browser's IndexedDB. This is:
- Slow (~30-60 seconds)
- Requires manual action
- Doesn't work if the local Scryfall data file is missing
- Wastes bandwidth (every user downloads the same data)

## Solution
Pre-load all Scryfall card data into Firestore **once**, then all users can access it instantly.

## Implementation Steps

### 1. Run the Population Script (One-Time Setup)

The `scripts/populate-firestore-cards.ts` script will:
- Fetch the latest Scryfall bulk data
- Filter to Commander-legal, English, non-token cards
- Upload ~25,000 cards to Firestore

**Prerequisites:**
```bash
cd undercroft_FE
npm install firebase-admin tsx
```

**Get Firebase Admin Credentials:**
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Save the JSON file as `firebase-admin-key.json` in the project root

**Run the script:**
```bash
npx tsx scripts/populate-firestore-cards.ts
```

This will take ~20-30 minutes due to Firestore rate limits (500 writes per batch).

### 2. Set Firestore Security Rules

Add these rules to allow all users to read cards:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Global card data - read-only for all users
    match /cards/{cardId} {
      allow read: if true;
      allow write: if false; // Only admins can write via script
    }
    
    // User-specific data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /decks/{deckId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### 3. Create Firestore Indexes

For optimal query performance, create these composite indexes:

```json
{
  "indexes": [
    {
      "collectionGroup": "cards",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "name", "order": "ASCENDING" },
        { "fieldPath": "__name__", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "cards",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "type_line", "order": "ASCENDING" },
        { "fieldPath": "__name__", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Save this as `firestore.indexes.json` and deploy with:
```bash
firebase deploy --only firestore:indexes
```

### 4. Update the App

The app has been updated to:
- Use Firestore as the primary card data source (`src/lib/firebase/cards.ts`)
- Fall back to IndexedDB for offline caching
- Auto-resolve card names when importing decks

**No manual import button needed!** Card data is now available to all users instantly.

## Benefits

✅ **Instant access** - No waiting for downloads
✅ **No manual setup** - Works out of the box for all users
✅ **Always up-to-date** - Update once, all users benefit
✅ **Reduced bandwidth** - Cards loaded on-demand, not all at once
✅ **Better UX** - Deck import "just works"

## Maintenance

To update card data (e.g., when new sets release):
1. Re-run the population script
2. It will fetch the latest Scryfall data and update Firestore

## Cost Estimate

Firestore pricing (as of 2024):
- **Storage**: ~25k cards × ~2KB each = ~50MB = **$0.01/month**
- **Reads**: 1M reads/month free, then $0.06 per 100k reads
  - Typical usage: ~100 card lookups per deck import = **free tier**
- **Writes**: Only when updating card data (rare) = **negligible**

**Total cost: ~$0.01-0.10/month** (essentially free)

## Alternative: Hybrid Approach

If Firestore costs become a concern, use a hybrid approach:
1. Store only card metadata in Firestore (name, ID, type)
2. Store full card data (images, oracle text) in IndexedDB
3. Lazy-load full data only when needed

This reduces Firestore storage by ~80% while keeping the UX benefits.

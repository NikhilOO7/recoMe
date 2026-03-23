import type { PlatformImporter, RawImportData, RawImportItem } from '../types';

/**
 * SpotifyImporter — imports listening history, liked songs, and playlists.
 *
 * File upload: Spotify data export JSON (StreamingHistory.json, YourLibrary.json)
 * No DOM scrape (Spotify is a desktop app / web player with limited scrapable data).
 */
export class SpotifyImporter implements PlatformImporter {
  readonly platform = 'spotify';
  readonly supportsDOMScrape = false;
  readonly supportsFileUpload = true;
  readonly supportsAPI = false;

  getScrapeUrl(): string {
    return 'https://www.spotify.com/account/privacy/';
  }

  canScrapeCurrentPage(): boolean {
    return false;
  }

  async importFromFile(file: File): Promise<RawImportData> {
    const text = await file.text();
    const data = JSON.parse(text) as SpotifyExportEntry[] | SpotifyLibrary;
    const items: RawImportItem[] = [];

    if (Array.isArray(data)) {
      // StreamingHistory format
      for (const entry of data) {
        const title = `${entry.trackName ?? 'Unknown'} — ${entry.artistName ?? 'Unknown'}`;
        const id = `spotify_${entry.artistName}_${entry.trackName}`.replace(/\s+/g, '_');

        items.push({
          externalId: id,
          title,
          timestamp: entry.endTime ? new Date(entry.endTime).getTime() : undefined,
          interactionType: 'listened',
          metadata: {
            artist: entry.artistName,
            track: entry.trackName,
            msPlayed: entry.msPlayed,
          },
        });
      }
    } else if (data.tracks) {
      // YourLibrary format
      for (const track of data.tracks) {
        const title = `${track.track ?? 'Unknown'} — ${track.artist ?? 'Unknown'}`;
        const id = `spotify_lib_${track.artist}_${track.track}`.replace(/\s+/g, '_');

        items.push({
          externalId: id,
          title,
          url: track.uri
            ? `https://open.spotify.com/track/${track.uri.split(':').pop()}`
            : undefined,
          interactionType: 'liked',
          metadata: {
            artist: track.artist,
            album: track.album,
          },
        });
      }
    }

    return {
      platform: 'spotify',
      source: 'file_upload',
      items,
      scrapedAt: Date.now(),
    };
  }
}

interface SpotifyExportEntry {
  endTime?: string;
  artistName?: string;
  trackName?: string;
  msPlayed?: number;
}

interface SpotifyLibrary {
  tracks?: Array<{
    artist?: string;
    track?: string;
    album?: string;
    uri?: string;
  }>;
}

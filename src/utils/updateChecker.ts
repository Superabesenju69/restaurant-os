import { Alert, Linking, Platform } from 'react-native';

// =============================================================================
// GitHub Release Update Checker
// =============================================================================
// Checks for new APK releases published on GitHub Releases.
// Configure GITHUB_OWNER and GITHUB_REPO below to point to your repository.
// =============================================================================

const GITHUB_OWNER = 'Superabesenju69'; // GitHub username
const GITHUB_REPO = 'restaurant-os';         // TODO: Replace with your repo name

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/** Current app version — must match the tag format you use in GitHub Releases (e.g. "v1.0.0") */
const CURRENT_VERSION = 'v1.0.7'; // TODO: Keep in sync with app.json "version"

/**
 * Compare two semver version strings (with or without leading "v").
 * Returns true if `latest` is newer than `current`.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map(Number);

  const cur = parse(current);
  const lat = parse(latest);

  for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
    const c = cur[i] || 0;
    const l = lat[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Check the GitHub Releases API for a newer version.
 * If one is found, prompt the user to download the APK.
 *
 * Call this on app startup (e.g. inside a useEffect in App.tsx).
 */
export async function checkForUpdates(): Promise<void> {
  // Only check on Android — iOS uses the App Store
  if (Platform.OS !== 'android') return;

  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (!response.ok) {
      console.warn(`[UpdateChecker] GitHub API responded with ${response.status}`);
      return;
    }

    const data = await response.json();
    const latestVersion: string = data.tag_name; // e.g. "v1.1.0"

    if (!isNewerVersion(CURRENT_VERSION, latestVersion)) {
      console.log('[UpdateChecker] App is up to date.');
      return;
    }

    // Find the .apk asset in the release
    const apkAsset = data.assets?.find(
      (asset: { name: string }) => asset.name.endsWith('.apk'),
    );

    const downloadUrl: string =
      apkAsset?.browser_download_url ?? data.html_url;

    Alert.alert(
      'Actualización Disponible',
      `Una nueva versión (${latestVersion}) está disponible. ¿Desea descargarla?`,
      [
        { text: 'Después', style: 'cancel' },
        {
          text: 'Descargar',
          onPress: () => Linking.openURL(downloadUrl),
        },
      ],
    );
  } catch (error) {
    console.error('[UpdateChecker] Failed to check for updates:', error);
  }
}

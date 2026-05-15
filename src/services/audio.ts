import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { dlog, dwarn } from '../store/debugLog';

// expo-audio replaces the deprecated expo-av. Imperative player API: create
// a player from an asset, call play(), release() when done.
let introPlayer: AudioPlayer | null = null;
let configured = false;

async function ensureAudioMode() {
  if (configured) return;
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    configured = true;
  } catch (err) {
    dwarn('audio', `setAudioModeAsync failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Play the splash intro fanfare. Fire-and-forget — never throws.
 * Audio failures are logged but never block the splash animation.
 */
export async function playIntroFanfare(): Promise<void> {
  try {
    await ensureAudioMode();
    if (introPlayer) {
      try {
        introPlayer.release();
      } catch {
        // ignore
      }
      introPlayer = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    introPlayer = createAudioPlayer(require('../../assets/sounds/intro.wav'));
    introPlayer.volume = 0.85;
    introPlayer.play();
    dlog('audio', 'intro fanfare playing');
  } catch (err) {
    dwarn('audio', `playIntroFanfare failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Stop and release the intro player. Call when leaving the splash.
 */
export async function stopIntroFanfare(): Promise<void> {
  if (!introPlayer) return;
  try {
    introPlayer.pause();
    introPlayer.release();
  } catch {
    // ignore
  } finally {
    introPlayer = null;
  }
}

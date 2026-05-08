import { Audio } from 'expo-av';
import { dlog, dwarn } from '../store/debugLog';

let introSound: Audio.Sound | null = null;
let configured = false;

async function ensureAudioMode() {
  if (configured) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
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
    if (introSound) {
      try {
        await introSound.unloadAsync();
      } catch {
        // ignore
      }
      introSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../assets/sounds/intro.wav'),
      { shouldPlay: true, volume: 0.85 }
    );
    introSound = sound;
    dlog('audio', 'intro fanfare playing');
  } catch (err) {
    dwarn('audio', `playIntroFanfare failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Stop and unload the intro sound. Call when leaving the splash.
 */
export async function stopIntroFanfare(): Promise<void> {
  if (!introSound) return;
  try {
    await introSound.stopAsync();
    await introSound.unloadAsync();
  } catch {
    // ignore
  } finally {
    introSound = null;
  }
}

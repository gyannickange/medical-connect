export type NotificationSoundPreset = "default" | "chime" | "ping" | "none";

const STORAGE_KEY = "notificationSoundPreset";
const VALID_PRESETS: NotificationSoundPreset[] = ["default", "chime", "ping", "none"];

export function getNotificationSoundPreset(): NotificationSoundPreset {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (VALID_PRESETS as string[]).includes(stored ?? "") ? (stored as NotificationSoundPreset) : "default";
}

export function setNotificationSoundPreset(preset: NotificationSoundPreset): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, preset);
}

// Short tone sequences per preset, synthesized with the Web Audio API — no
// bundled audio files, works identically in the Tauri webview and any
// browser.
const TONES: Record<Exclude<NotificationSoundPreset, "none">, { frequency: number; durationMs: number }[]> = {
  default: [{ frequency: 660, durationMs: 150 }],
  chime: [
    { frequency: 523.25, durationMs: 120 },
    { frequency: 783.99, durationMs: 180 },
  ],
  ping: [{ frequency: 987.77, durationMs: 100 }],
};

export function playNotificationSound(preset: NotificationSoundPreset = getNotificationSoundPreset()): void {
  if (preset === "none" || typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    let startTime = context.currentTime;
    for (const { frequency, durationMs } of TONES[preset]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationMs / 1000);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + durationMs / 1000);
      startTime += durationMs / 1000 + 0.02;
    }
    setTimeout(() => context.close(), (startTime - context.currentTime + 0.5) * 1000);
  } catch (error) {
    console.error("Failed to play notification sound:", error);
  }
}

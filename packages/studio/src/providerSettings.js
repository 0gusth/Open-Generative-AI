// Per-provider request settings for Runware videoInference.
//
// Runware does NOT expose one audio switch: each provider wires sound its own
// way, and the top-level `generateAudio` parameter is rejected by 66 of 77
// video models (see modelConstraints.json audioParam). Sending the wrong
// shape either errors (costing the user a failed submit) or is ignored
// silently — which is how Kling rendered mute while the UI showed sound ON.
//
// Every entry below is verified against Runware's own model documentation
// (runware.ai/docs/models/<model>) and re-checked with free probes. Families
// without a documented mechanism are absent on purpose: the app sends nothing
// and the UI hides the switch rather than lying about it.

export const AUDIO_MECHANISMS = [
  {
    // klingai:kling-video@3-pro, @3-standard, @o3-*, @2.6-pro, kling@o1…
    // Doc: providerSettings.klingai.sound — "Enable native audio generation".
    // Pricing note: with sound $0.168/s vs $0.112/s silent (opt-in on purpose).
    match: /^klingai:/i,
    apply: (task, on) => {
      task.providerSettings = {
        ...(task.providerSettings || {}),
        klingai: { ...(task.providerSettings?.klingai || {}), sound: !!on },
      };
    },
    defaultOn: false,
  },
  {
    // google:3@3 (Veo 3.1 Fast), google:3@2, google:veo@3.1-lite…
    // Doc: providerSettings.google.generateAudio — default true.
    match: /^google:(3@|veo@)/i,
    apply: (task, on) => {
      task.providerSettings = {
        ...(task.providerSettings || {}),
        google: { ...(task.providerSettings?.google || {}), generateAudio: !!on },
      };
    },
    defaultOn: true,
  },
  {
    // bytedance:seedance@2.0 / @2.5 / @1.5-pro / bytedance:2@1…
    // Doc: settings.audio — "Generate synchronized audio", default true.
    match: /^bytedance:/i,
    apply: (task, on) => {
      task.settings = { ...(task.settings || {}), audio: !!on };
    },
    defaultOn: true,
  },
];

// Models that accept the top-level generateAudio parameter (probe-verified in
// modelConstraints.json as audioParam === true). Used as the fallback lane for
// families without a documented per-provider mechanism.
export function audioMechanismFor(air) {
  return AUDIO_MECHANISMS.find((m) => m.match.test(air || "")) || null;
}

// Apply the sound choice to a videoInference task, in whatever shape THIS
// model actually accepts. Returns true when a real control was applied.
// `topLevelOk` comes from the probe (constraints.audioParam !== false).
export function applyAudioSetting(task, air, on, topLevelOk) {
    const mech = audioMechanismFor(air);
    if (mech) {
        mech.apply(task, on);
        return true;
    }
    if (topLevelOk) {
        task.generateAudio = !!on;
        return true;
    }
    return false; // no known control — send nothing, never guess
}

// Does this model expose a real audio control? Drives the UI switch so it can
// never claim a toggle the API will ignore.
export function hasAudioControl(air, topLevelOk) {
    return !!audioMechanismFor(air) || !!topLevelOk;
}

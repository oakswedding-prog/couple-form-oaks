# Finalize Continuous Live Voice Transcribing

Ensure real-time live voice transcription remains fast, continuous, and reliable across both mobile and desktop, with smooth sentence appending and clean session management until the checkmark button is tapped.

### User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed User Choice**: Retain the fast, real-time live transcribing experience on Android mobile devices with the continuous microphone state, understanding that the brief sound on pauses is Android OS's built-in microphone service tone.
> - **Continuous Dictation Preserved**: The microphone and waveform remain active and listening across all pauses until the user explicitly taps the **Done (✓)** or **Cancel (✕)** button.
> - **Zero-Disruption Mobile UI**: The on-screen keyboard remains retracted during speech so the screen stays steady.

---

### 1. Overview & Core Concept

- **What It Delivers**:
  - Couples can tap **"Tap to speak"** on any smartphone (Android/iOS) or computer (Mac/Windows).
  - Words appear live on screen in real time as they are spoken.
  - The couple can pause to think, breathe, and gather their thoughts without the microphone closing.
  - When they resume speaking, the next words continue transcribing and appending seamlessly.
  - When finished, tapping **Done (✓)** finalizes all punctuation and capitalization, auto-saves to the questionnaire, and closes the microphone session.

---

### 2. Technical Refinements & Optimizations

1. **Ultra-Fast Instance Re-Arming**:
   - Maintain the instant 60–80ms cycle when Android's speech service pauses on silence, ensuring the next words spoken are captured immediately without latency or clipping.
2. **Robust Multi-Language Speech Processing**:
   - Ensure clean word boundary deduplication and automatic sentence capitalization across all supported languages (English, Malayalam, Hindi, US English).
3. **Pristine Build & Cleanliness**:
   - Verify that all Vercel deployment configurations (`.npmrc`, `tsconfig.json`, `vercel.json`) build cleanly with zero warnings or errors.

---

### 3. Verification & Testing

- Verify that `npx tsc --noEmit` and `npm run build` execute cleanly.
- Confirm dev server runs smoothly on port 3000.

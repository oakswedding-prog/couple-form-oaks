# Real-Time Live Mobile Voice Dictation

Restore instant, word-by-word real-time transcription on mobile devices (identical to the desktop experience) while ending cleanly upon natural speech pauses to eliminate repeated Android system chime sounds.

### User Review & Critical Decisions

> [!IMPORTANT]
> - **Live Real-Time Transcription Restored**: Remove the delayed audio recording pipeline and restore the browser's native speech recognition on mobile so words transcribe and appear on screen immediately as you speak.
> - **Confirmed User Choice**: Dictation streams live in real time and concludes cleanly when you naturally finish speaking and pause. This permanently prevents the rapid auto-restart loop that caused repeated *"ding ding / Ting Ting"* sounds on Android.
> - **Preserved Mobile Improvements**: Keep the virtual keyboard hidden during voice dictation so the screen never jumps, and ensure seamless cumulative sentence appending across multiple speech turns.

---

### 1. Overview & Core Concept

- **What It Does**:
  - Tapping **"Tap to speak"** activates the speech recognition engine immediately.
  - As the user speaks, words transcribe live on screen with zero lag, showing both real-time interim speech and committed text.
  - The gold audio waveform animates while the user is talking.
  - When the user finishes speaking and pauses naturally, the session finalizes cleanly, formatting punctuation and capitalization automatically, and returns to the idle state.
  - If the user taps the mic again, additional sentences append smoothly without overwriting existing thoughts.
  - Manual stop controls (Done ✓ and Cancel ✕) remain available if the user wants to end or revert manually at any point.

- **Unified Cross-Platform Experience**:
  - Both mobile phones (Android, iOS) and laptops (Mac, Windows) share the exact same responsive, real-time live transcribing experience.

---

### 2. User Experience & Visual Design

1. **Tap to Speak**:
   - User taps the subtle gold mic button.
   - The microphone activates with a single initial cue; the waveform displays "Listening... speak naturally".
2. **Real-Time Live Dictation**:
   - Spoken words stream onto the screen in real-time beneath or inside the textarea.
   - The on-screen keyboard remains hidden, leaving full view of the question and transcription.
3. **Clean Natural Pause & Completion**:
   - When the user finishes their sentence and pauses, the speech service finalizes the sentence cleanly.
   - Capitalization is automatically corrected, and the text is auto-saved into the questionnaire state.
   - No rapid restart loop fires, so there are **zero repeated chime sounds**.
4. **Subsequent Thoughts**:
   - Tapping "Tap to speak" again appends the next sentence with proper spacing and capitalization.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Web Speech API for Real-Time Streaming on All Devices**
  - *Chosen Approach*: Unify mobile and desktop under `useSpeechRecognition.ts` using the browser's native real-time Web Speech engine.
  - *Why*: Delivers the instant, live word-by-word streaming the user expects without external API latency or failed network blobs.

- **Decision 2: Elimination of the Auto-Restart Loop on Mobile Silence**
  - *Chosen Approach*: When a user pauses and Android triggers `onend`, conclude that speech turn cleanly rather than firing an instant 50ms restart loop.
  - *Why*: Eliminates the non-stop "ding-ting" chime spam on Android while keeping the transcribed text 100% intact.

- **Decision 3: Seamless Cumulative Text Concatenation**
  - *Chosen Approach*: Preserve all previously committed text when the user starts speaking again, automatically trimming and deduplicating word boundaries.
  - *Why*: Couples can speak in comfortable, bite-sized thoughts without losing previous sentences.

---

### 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────┐
│                   VoiceTextarea                        │
│  - Textarea: Shows committed sentences                 │
│  - Interim overlay: Displays live in-flight words      │
│  - Control bar: Language selector + Waveform + Actions │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               useSpeechRecognition Hook                │
│                                                        │
│  - isListening: boolean                                │
│  - interimText: string (real-time in-flight speech)    │
│  - committedBaseRef: preserves existing text           │
│                                                        │
│  [Speech Events]                                       │
│    ├─► onresult: Streams live text to UI instantly     │
│    │             Appends final words as recognized     │
│    │                                                   │
│    └─► onend:    Finalizes current speech turn cleanly │
│                  Applies sentence capitalization       │
│                  Ends session with NO restart loop     │
│                  (Eliminating all repeated chimes!)    │
└────────────────────────────────────────────────────────┘
```

#### Files to Modify:
1. `src/hooks/useSpeechRecognition.ts`:
   - Remove the rapid `onend` auto-restart loop that was causing repeated system chime sounds on Android.
   - Ensure clean session conclusion on natural speech pause while capturing all final speech tokens.
   - Ensure cumulative text is preserved and seamlessly appended when the mic is clicked again.
2. `src/components/VoiceTextarea.tsx`:
   - Use `useSpeechRecognition` directly on both mobile and desktop so real-time live transcribing works everywhere.
   - Remove unused `useAudioRecorder` mobile branching.

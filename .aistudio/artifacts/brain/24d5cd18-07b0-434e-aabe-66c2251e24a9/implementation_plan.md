# Seamless Mobile Voice Dictation & Audio Lifecycle Fix

Robust, continuous voice-to-text dictation across Android Chrome, iOS Safari, and desktop browsers without audio stutter, dropped words, or unwanted keyboard disruptions.

### User Review & Critical Decisions

> [!IMPORTANT]
> The fixes directly address the exact issues captured in your Android screen recording:
> 1. **Index Desynchronization**: Words were dropped after pauses because internal result index pointers weren't reset when Android Chrome restarted after silence.
> 2. **Keyboard Popping Up**: `textareaRef.current.focus()` on each spoken chunk forced the virtual keyboard to open, stealing audio focus and shaking the screen.
> 3. **Mic On/Off Stutter**: Reusing ended `SpeechRecognition` instances caused browser errors and microphone drops. We will use a clean, seamless instance transition.

- **Confirmed Decision (Phase 1)**: Keep the virtual keyboard hidden during voice dictation so the user has an undisturbed, full-screen speaking experience until they finish and tap the checkmark.

---

### 1. Overview & Core Concept

- **What It Does**: Enables couples to tap "Tap to speak" on any mobile or desktop browser and speak freely at their own pace. The microphone remains active and listening with visible wave animation until the couple explicitly taps Done (✓) or Cancel (✕).
- **Target Audience**: Couples filling out their wedding story questionnaire on mobile smartphones (Android Chrome, iOS Safari) as well as desktop computers.
- **Key Value**: Natural, interruption-free storytelling without losing sentences, hearing loud repeated chime beeps, or fighting an on-screen keyboard.

---

### 2. User Experience & Visual Design

- **Listening State**:
  - Tapping "Tap to speak" enters an active dictation mode.
  - The gold audio waveform animates smoothly to give reassurance that the app is listening.
  - The live interim transcript displays dynamically under the textarea as the speaker talks.
  - On mobile, the textarea does **not** steal keyboard focus while listening. The on-screen keyboard stays retracted, leaving full screen visibility for the question and transcription.
- **Completion Flow**:
  - The user can pause, think, and resume speaking without the mic turning off or dropping words.
  - When finished, tapping the black **Done (✓)** button finalizes the transcript, formats capitalization cleanly, updates the saved questionnaire answer, and gently focuses the input if the user wants to make manual edits.
  - Tapping **Cancel (✕)** discards the current dictation session and safely restores the original text.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Fresh SpeechRecognition Instance Cycling on Android Pauses**
  - *Chosen Approach*: When Android Chrome fires `onend` after a quiet pause, instantiate a fresh `SpeechRecognition` object immediately and reset session index counters while preserving the cumulative dictation buffer.
  - *Why*: Android Chrome does not allow calling `.start()` on an ended recognition instance without throwing `InvalidStateError`. Clean instance recreation ensures 100% reliable continuous listening without audio dropouts.
  - *Alternative Considered*: Aborting recognition and forcing the user to tap the mic again after every sentence (poor user experience).

- **Decision 2: Separation of Voice Dictation Focus vs. Keyboard Typing Focus**
  - *Chosen Approach*: Do not call `textarea.focus()` during speech commit intervals. Only focus the textarea when the user explicitly clicks/taps into the text area to type or after closing dictation via Done.
  - *Why*: In mobile browsers, calling `.focus()` on an input programmatically triggers the virtual keyboard to pop open, resizing the viewport and interrupting the system speech recognizer.

- **Decision 3: Robust Multi-language & Deduplication Handling**
  - *Chosen Approach*: Retain existing support for English (India), Malayalam, Hindi, and English (US), ensuring the cleaner only trims duplicate speech boundary artifacts caused by Android's speech pipeline.

---

### 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────┐
│                   VoiceTextarea                        │
│  - Textarea display (shows committed text)             │
│  - Interim transcript overlay (live words as spoken)   │
│  - Control bar: Language chip | Waveform | Done / Cancel│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               useSpeechRecognition Hook                │
│                                                        │
│  - isListening: boolean                                │
│  - cumulativeTextRef: stores previous sentences        │
│  - activeSessionRef: manages active recognition object │
│                                                        │
│  [Android onend Event]                                 │
│        │                                               │
│        ├─► If isListeningRef === true:                 │
│        │   1. Reset session index tracker to -1        │
│        │   2. Instantiate fresh SpeechRecognition      │
│        │   3. Resume listening instantly (<50ms)       │
│        │   4. Keep UI in uninterrupted listening state │
│        │                                               │
│        └─► If user clicked Done (✓) or Cancel (✕):     │
│            1. Stop recognition cleanly                 │
│            2. Finalize & clean sentence formatting     │
│            3. Commit to form state & localStorage      │
└────────────────────────────────────────────────────────┘
```

#### Files to Modify:
1. `src/hooks/useSpeechRecognition.ts`:
   - Overhaul `onresult` and `onend` handlers to reset `lastProcessedIndexRef` across session cycles.
   - Implement clean instantiation of `SpeechRecognition` so restarts on Android do not throw `InvalidStateError` or drop tokens.
   - Prevent redundant restart loops and ensure `recognition.abort()` / cleanup is pristine.
2. `src/components/VoiceTextarea.tsx`:
   - Remove automatic `textareaRef.current.focus()` inside `onCommit` during active speech.
   - Add focus only when the user finishes dictation or manually clicks the textarea.

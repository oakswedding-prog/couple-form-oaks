# Continuous Voice Dictation Until Explicitly Stopped

Keep the microphone active and listening continuously across all speech pauses, transcribing live in real time until the user explicitly taps the checkmark (Done ✓) or cancel (✕) button.

### User Review & Critical Decisions

> [!IMPORTANT]
> - **Continuous Listening Guaranteed**: The microphone will **never turn off on speech pauses**. The listening waveform and control buttons (Done ✓ and Cancel ✕) will stay on screen continuously.
> - **Live Real-Time Transcribing Maintained**: As the user speaks, words transcribe live onto the screen.
> - **Explicit User Control Only**: The microphone session only finishes and closes when the user explicitly clicks the **Done (✓)** or **Cancel (✕)** button.

---

### 1. Overview & Core Concept

- **User Interaction**:
  - The couple taps **"Tap to speak"**.
  - The gold listening waveform activates and stays active.
  - As they speak, words transcribe onto the screen in real time.
  - The couple can pause for 2 seconds, 10 seconds, or longer to think; **the mic remains on and listening**.
  - When they resume speaking, the next words transcribe and append seamlessly.
  - The session ONLY closes when the couple clicks the black **Done (✓)** button to save, or the **Cancel (✕)** button to discard.

---

### 2. User Experience & Visual Design

1. **Start Listening**:
   - Tapping "Tap to speak" displays the active dictation bar: the animated gold waveform, "Listening...", and the Done (✓) / Cancel (✕) buttons.
2. **Speaking & Pausing**:
   - Words appear live as spoken.
   - Pausing does **not** dismiss the mic or change the UI state. The waveform stays active, signaling that the app is waiting for their next thought.
   - The virtual keyboard stays hidden so the screen remains steady.
3. **Finish Dictation**:
   - Clicking **Done (✓)** finalizes all text with automatic sentence capitalization and returns to the resting state.
   - Clicking **Cancel (✕)** aborts and restores the original text.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Persistent Application-Level Listening State**
  - *Chosen Approach*: Decouple the user-facing `isListening` state from OS-level silence timeouts. If Android's speech service ends on silence while `isListeningRef.current === true`, automatically re-arm a fresh recognition instance with reset index counters while keeping the UI in continuous listening mode.
  - *Why*: Ensures the microphone remains ready and active until the user decides they are done.

- **Decision 2: Seamless Chunk Concatenation with Index Reset**
  - *Chosen Approach*: On every silence cycle, commit any in-flight phrase to the cumulative buffer, reset the internal result index counter (`lastProcessedIndexRef.current = -1`), and keep listening so subsequent words are never dropped.
  - *Why*: Prevents word dropouts while supporting long, thoughtful pauses.

---

### 4. Technical Architecture & Component Mapping

```
┌────────────────────────────────────────────────────────┐
│                   VoiceTextarea                        │
│  - Textarea: displays committed text                   │
│  - Active Bar: Waveform + "Listening..." + ✓ and ✕     │
│  - Stays active continuously through all pauses        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               useSpeechRecognition Hook                │
│                                                        │
│  - isListening: stays true until stopSession() is called│
│  - committedBaseRef + currentDictationRef              │
│                                                        │
│  [Speech Recognition Events]                           │
│    ├─► onresult: Stream words live to screen           │
│    │                                                   │
│    ├─► onend (silence pause):                          │
│    │   If isListeningRef === true:                     │
│    │   1. Commit current phrase to buffer              │
│    │   2. Reset session index tracker to -1            │
│    │   3. Re-arm fresh recognition instance cleanly    │
│    │   4. Keep isListening UI state TRUE               │
│    │                                                   │
│    └─► User Clicks Done (✓) or Cancel (✕):             │
│        1. isListeningRef = false                       │
│        2. Destroy recognition instance                 │
│        3. Finalize text formatting                     │
│        4. Set isListening UI state FALSE               │
└────────────────────────────────────────────────────────┘
```

#### Files to Modify:
1. `src/hooks/useSpeechRecognition.ts`:
   - In `onend`, check `isListeningRef.current`: if true, commit the accumulated text, reset `lastProcessedIndexRef.current = -1`, and immediately re-arm a clean `SpeechRecognition` instance so the mic stays on across pauses.
   - Only terminate when `stopSessionInternal()` is explicitly triggered by the user clicking Done (✓) or Cancel (✕).

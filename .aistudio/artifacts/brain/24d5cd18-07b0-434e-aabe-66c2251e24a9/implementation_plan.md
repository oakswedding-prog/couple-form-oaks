# Silent Mobile Audio Recording & Fast Transcription

Completely eliminate repeated Android system chime sounds ("ding ding / Ting Ting") by using silent `MediaRecorder` audio capture on mobile devices, paired with fast server-side transcription.

### User Review & Critical Decisions

> [!IMPORTANT]
> - **The Core Issue**: Android's `webkitSpeechRecognition` triggers hardcoded OS-level safety chimes whenever speech starts or times out on silence.
> - **Confirmed User Choice**: Implement **Silent audio recording with fast transcription** on mobile devices.
> - **Desktop Preserved**: Desktop browsers (Mac / Windows laptops) will continue using instant Web Speech API streaming, which is already 100% silent and continuous.

---

### 1. Overview & Core Concept

- **Mobile Experience**:
  - Tapping "Tap to speak" on Android/iOS uses the Web Audio / `MediaRecorder` API (`navigator.mediaDevices.getUserMedia`).
  - **Zero system chimes or dings**: `getUserMedia` does not trigger Android's `SpeechRecognizer` privacy tones.
  - The gold audio waveform animates in real time, reacting dynamically to the user's voice volume.
  - The couple can speak, pause, breathe, and think for as long as they like with zero interruptions or timeout disconnects.
  - When the couple taps **Done (✓)**, the audio is sent to a dedicated `/api/transcribe` endpoint powered by Gemini 2.5 Flash, which returns clean, accurate text in under 1.5 seconds.
  - When tapping **Cancel (✕)**, the recording is discarded immediately.

- **Desktop Experience**:
  - Mac and PC laptops continue using the built-in browser Web Speech API for instantaneous, live word-by-word streaming since desktop Chrome is already completely silent and does not produce system beeps.

---

### 2. User Experience & Visual Design

1. **Idle State**:
   - Clean "Tap to speak" button with the selected language indicator (English, Malayalam, Hindi, etc.).
2. **Active Mobile Recording**:
   - Button transitions to active state with real-time waveform animation driven by the Web Audio API audio level analyser.
   - Status indicates "Listening... tap ✓ when done".
   - No pop-up keyboard, no audio dings or tings.
3. **Transcribing State**:
   - Tapping **Done (✓)** shows a brief "Transcribing..." micro-state with subtle spinner / pulsing indicator (<1.5s).
   - Transcribed text smoothly appends to the textarea with automatic sentence capitalization.
4. **Error Handling & Fallbacks**:
   - If microphone permissions are denied, a gentle inline notice appears with guidance.
   - If offline or API key is absent, graceful notification is displayed without crashing the form.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Mobile-Specific Silent MediaRecorder vs. Desktop Web Speech API**
  - *Chosen Approach*: Adaptive input strategy—use `MediaRecorder` on mobile to bypass Android's system chime, while keeping native Web Speech API on desktop for instant streaming.
  - *Why*: Gives mobile users a completely silent, pause-friendly dictation experience without sacrificing the instant streaming speed that desktop users enjoy.

- **Decision 2: Serverless Transcription Endpoint (`/api/transcribe`)**
  - *Chosen Approach*: An Express/Vercel serverless function using `@google/genai` (Gemini 2.5 Flash) accepting audio payloads and returning transcription in the requested language.
  - *Why*: High-speed transcription (<1.5s), native multilingual support (English, Malayalam, Hindi, etc.), and zero client-side API key exposure.

---

### 4. Technical Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                       VoiceTextarea                         │
│   - Desktop: WebSpeech API (real-time streaming, silent)    │
│   - Mobile:  Silent MediaRecorder + Audio Analyser Waveform │
└───────────────────────────────┬─────────────────────────────┘
                                │ (On Mobile: User clicks ✓)
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Audio Blob Packaging                     │
│   - Formats audio/webm or audio/mp4 chunk                   │
│   - Encodes payload with target language (e.g. en-IN, ml-IN)│
└───────────────────────────────┬─────────────────────────────┘
                                │ POST /api/transcribe
                                ▼
┌─────────────────────────────────────────────────────────────┐
│               Serverless Route (/api/transcribe)            │
│   - Authenticates via server GEMINI_API_KEY                 │
│   - Prompts Gemini 2.5 Flash for verbatim speech transcribe │
│   - Returns { text: "..." }                                 │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                      State Update                           │
│   - Appends text to questionnaire answer & auto-saves       │
│   - Dismisses recording bar cleanly                         │
└─────────────────────────────────────────────────────────────┘
```

#### Files to Create / Modify:
1. `/api/transcribe.ts`:
   - Serverless handler accepting base64 audio and language code, transcribing via Gemini 2.5 Flash.
2. `src/hooks/useAudioRecorder.ts`:
   - Mobile audio recording hook using `navigator.mediaDevices.getUserMedia` and `MediaRecorder` with Web Audio volume analyser.
3. `src/hooks/useSpeechRecognition.ts` & `src/components/VoiceTextarea.tsx`:
   - Route mobile devices to the silent audio recorder and desktop to Web Speech API.
4. `vite.config.ts`:
   - Mount local dev middleware for `/api/transcribe` so it works seamlessly in development and production on Vercel.

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { SpeechLanguageCode } from "../constants.ts";
import { cleanSentenceText, deduplicateTranscript } from "../utils/textCleaner.ts";

// Global tracker to ensure only one microphone is active across the entire application
let activeSessionStopper: (() => void) | null = null;

export interface UseSpeechRecognitionOptions {
  onCommit: (text: string) => void;
  language: SpeechLanguageCode;
}

export function useSpeechRecognition({
  onCommit,
  language,
}: UseSpeechRecognitionOptions) {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [interimText, setInterimText] = useState<string>("");
  const [friendlyError, setFriendlyError] = useState<string | null>(null);

  // Store callbacks and options in refs to prevent unnecessary re-runs
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const languageRef = useRef(language);
  languageRef.current = language;

  const isListeningRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Text tracking refs
  const committedBaseRef = useRef<string>("");
  const currentDictationRef = useRef<string>("");
  const latestInterimRef = useRef<string>("");
  const lastProcessedIndexRef = useRef<number>(-1);

  // Check support on mount
  useEffect(() => {
    const hasSpeech =
      typeof window !== "undefined" &&
      (!!(window as any).SpeechRecognition ||
        !!(window as any).webkitSpeechRecognition);

    if (!hasSpeech) {
      setIsSupported(false);
    }
  }, []);

  const triggerHaptic = useCallback((pattern = 40) => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Haptics optional
    }
  }, []);

  // Update base text when the user manually types into the textarea
  const updateBaseText = useCallback((text: string) => {
    committedBaseRef.current = text;
  }, []);

  // Stop session internally (invoked by Done ✓, Cancel ✕, or page hidden)
  const stopSessionInternal = useCallback(
    (keepCaptured: boolean, statusNotice?: string) => {
      if (!isListeningRef.current && !recognitionRef.current) {
        if (statusNotice) {
          setFriendlyError(statusNotice);
        }
        return;
      }

      isListeningRef.current = false;

      // Stop & clean up speech recognition instance
      if (recognitionRef.current) {
        const rec = recognitionRef.current;
        recognitionRef.current = null;
        try {
          rec.onstart = null;
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
          rec.stop();
        } catch {
          try {
            rec.abort();
          } catch {
            // ignore
          }
        }
      }

      setIsListening(false);
      setInterimText("");
      triggerHaptic(40);

      if (statusNotice) {
        setFriendlyError(statusNotice);
      }

      if (keepCaptured) {
        // Fold any remaining interim speech chunk if user tapped Done right after speaking
        const pendingInterim = latestInterimRef.current.trim();
        if (pendingInterim) {
          currentDictationRef.current = deduplicateTranscript(
            currentDictationRef.current,
            pendingInterim
          );
          latestInterimRef.current = "";
        }

        const combined = currentDictationRef.current
          ? committedBaseRef.current
            ? `${committedBaseRef.current.trim()} ${currentDictationRef.current.trim()}`
            : currentDictationRef.current.trim()
          : committedBaseRef.current;
        const cleaned = cleanSentenceText(combined);
        onCommitRef.current(cleaned);
      } else {
        // Revert to original committed base text
        onCommitRef.current(committedBaseRef.current);
      }

      latestInterimRef.current = "";

      if (activeSessionStopper === stopSessionInternal) {
        activeSessionStopper = null;
      }
    },
    [triggerHaptic]
  );

  const stopSession = useCallback(
    (keepCaptured: boolean, statusNotice?: string) => {
      stopSessionInternal(keepCaptured, statusNotice);
    },
    [stopSessionInternal]
  );

  // Stop listening when tab is hidden (phone locked or switched app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isListeningRef.current) {
        stopSessionInternal(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stopSessionInternal]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (isListeningRef.current) {
        stopSessionInternal(true);
      }
    };
  }, [stopSessionInternal]);

  // Start listening session
  const startListening = useCallback(
    (initialValue: string) => {
      // 1. Stop any other microphone active in the app
      if (activeSessionStopper && activeSessionStopper !== stopSessionInternal) {
        activeSessionStopper();
      }
      activeSessionStopper = () => stopSessionInternal(true);

      const SpeechClass =
        (typeof window !== "undefined" &&
          ((window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition)) ||
        null;

      if (!SpeechClass) {
        setIsListening(false);
        isListeningRef.current = false;
        setFriendlyError(
          "Voice dictation is unavailable in this browser. Please type your answer."
        );
        return;
      }

      setFriendlyError(null);
      setInterimText("");
      committedBaseRef.current = initialValue || "";
      currentDictationRef.current = "";
      latestInterimRef.current = "";
      lastProcessedIndexRef.current = -1;

      // Clean up previous instance if still attached
      if (recognitionRef.current) {
        try {
          const prev = recognitionRef.current;
          recognitionRef.current = null;
          prev.onstart = null;
          prev.onresult = null;
          prev.onerror = null;
          prev.onend = null;
          prev.abort();
        } catch {
          // ignore
        }
      }

      try {
        const recognition = new SpeechClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = languageRef.current || "en-IN";
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          if (isListeningRef.current) {
            setIsListening(true);
            setFriendlyError(null);
          }
        };

        // Real-time live transcribing: words stream into UI as spoken
        recognition.onresult = (event: any) => {
          if (!isListeningRef.current) return;

          let sessionFinalTranscript = "";
          let currentInterim = "";

          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            const transcript = res[0]?.transcript || "";
            if (res.isFinal) {
              if (i > lastProcessedIndexRef.current) {
                lastProcessedIndexRef.current = i;
                sessionFinalTranscript = deduplicateTranscript(
                  sessionFinalTranscript,
                  transcript
                );
              }
            } else {
              currentInterim += transcript;
            }
          }

          if (sessionFinalTranscript) {
            currentDictationRef.current = deduplicateTranscript(
              currentDictationRef.current,
              sessionFinalTranscript
            );
            const combinedSoFar = committedBaseRef.current
              ? `${committedBaseRef.current.trim()} ${currentDictationRef.current.trim()}`
              : currentDictationRef.current.trim();
            onCommitRef.current(cleanSentenceText(combinedSoFar));
            latestInterimRef.current = "";
          }

          const trimmedInterim = currentInterim.trim();
          latestInterimRef.current = trimmedInterim;
          setInterimText(trimmedInterim);
        };

        recognition.onerror = (event: any) => {
          const error = event?.error;
          if (error === "no-speech" || error === "aborted") {
            // Non-fatal speech silence event
            return;
          }

          if (error === "not-allowed" || error === "service-not-allowed") {
            stopSessionInternal(true);
            setFriendlyError(
              "Microphone access blocked. Please allow microphone in browser settings, or type your answer."
            );
            return;
          }

          console.warn("Speech recognition notice:", error);
        };

        // Natural pause completion:
        // When speech finishes and pauses, conclude cleanly with NO restart loop.
        // This eliminates the repeated "ding ding, Ting Ting" chime sounds completely!
        recognition.onend = () => {
          if (!isListeningRef.current) return;

          // Commit any trailing in-flight interim text
          const pending = latestInterimRef.current.trim();
          if (pending) {
            currentDictationRef.current = deduplicateTranscript(
              currentDictationRef.current,
              pending
            );
            latestInterimRef.current = "";
            setInterimText("");
          }

          const combined = currentDictationRef.current
            ? committedBaseRef.current
              ? `${committedBaseRef.current.trim()} ${currentDictationRef.current.trim()}`
              : currentDictationRef.current.trim()
            : committedBaseRef.current;
          const cleaned = cleanSentenceText(combined);
          onCommitRef.current(cleaned);

          // Return to idle state cleanly with zero chime loops
          isListeningRef.current = false;
          recognitionRef.current = null;
          setIsListening(false);
          setInterimText("");
          latestInterimRef.current = "";

          if (activeSessionStopper === stopSessionInternal) {
            activeSessionStopper = null;
          }
        };

        isListeningRef.current = true;
        setIsListening(true);
        triggerHaptic(40);

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err: any) {
        console.warn("Could not start speech recognition:", err);
        stopSessionInternal(true);
        setFriendlyError(
          "Microphone unavailable. Please allow microphone permissions, or type your answer."
        );
      }
    },
    [stopSessionInternal, triggerHaptic]
  );

  return {
    isSupported,
    isListening,
    interimText,
    friendlyError,
    startListening,
    stopSession,
    updateBaseText,
  };
}

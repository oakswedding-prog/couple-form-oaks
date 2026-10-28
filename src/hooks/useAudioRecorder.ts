/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { cleanSentenceText } from "../utils/textCleaner.ts";

export interface UseAudioRecorderOptions {
  onCommit: (text: string) => void;
  languageLabel: string;
}

export function useAudioRecorder({
  onCommit,
  languageLabel,
}: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const committedBaseRef = useRef<string>("");
  const isRecordingRef = useRef<boolean>(false);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const languageLabelRef = useRef(languageLabel);
  languageLabelRef.current = languageLabel;

  // Cleanup audio tracks and context
  const cleanupStream = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setAudioLevel(0);
  }, []);

  // Update base text when user edits textarea
  const updateBaseText = useCallback((text: string) => {
    committedBaseRef.current = text;
  }, []);

  // Stop recording and optionally transcribe
  const stopRecording = useCallback(
    async (commit: boolean) => {
      if (!isRecordingRef.current) return;
      isRecordingRef.current = false;
      setIsRecording(false);

      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        cleanupStream();
        return;
      }

      if (!commit) {
        // Discard
        try {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        } catch {
          // ignore
        }
        cleanupStream();
        recordedChunksRef.current = [];
        return;
      }

      // Commit: wait for final data available
      setIsTranscribing(true);

      const waitForStop = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const mimeType = recorder.mimeType || "audio/webm";
          const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType });
          resolve(audioBlob);
        };
        try {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        } catch {
          const mimeType = recorder.mimeType || "audio/webm";
          resolve(new Blob(recordedChunksRef.current, { type: mimeType }));
        }
      });

      try {
        const audioBlob = await waitForStop;
        cleanupStream();

        if (audioBlob.size < 500) {
          // Audio too short / silent
          setIsTranscribing(false);
          return;
        }

        // Convert blob to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(audioBlob);
        const base64Url = await base64Promise;

        // Send to serverless transcribe endpoint
        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio: base64Url,
            mimeType: audioBlob.type || "audio/webm",
            language: languageLabelRef.current,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Transcription failed");
        }

        const data = await response.json();
        const transcribedText = (data.text || "").trim();

        if (transcribedText) {
          const combined = committedBaseRef.current
            ? `${committedBaseRef.current.trim()} ${transcribedText}`
            : transcribedText;
          onCommitRef.current(cleanSentenceText(combined));
        }
      } catch (err: any) {
        console.warn("Silent audio recording transcription error:", err);
        setFriendlyError(
          "Could not transcribe audio. Please tap to speak again or type your answer."
        );
      } finally {
        setIsTranscribing(false);
        recordedChunksRef.current = [];
      }
    },
    [cleanupStream]
  );

  // Start silent recording
  const startRecording = useCallback(
    async (initialValue: string) => {
      setFriendlyError(null);
      committedBaseRef.current = initialValue || "";
      recordedChunksRef.current = [];

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        streamRef.current = stream;

        // Web Audio Analyser for dynamic voice volume levels
        try {
          const AudioContextClass =
            window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateLevel = () => {
              if (!isRecordingRef.current) return;
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const average = sum / dataArray.length;
              // Normalize to 0 - 1
              setAudioLevel(Math.min(1, average / 128));
              animationFrameRef.current = requestAnimationFrame(updateLevel);
            };
            updateLevel();
          }
        } catch {
          // Audio analysis optional
        }

        // Pick supported mime type
        let mimeType = "audio/webm;codecs=opus";
        if (typeof MediaRecorder !== "undefined") {
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = MediaRecorder.isTypeSupported("audio/webm")
              ? "audio/webm"
              : MediaRecorder.isTypeSupported("audio/mp4")
              ? "audio/mp4"
              : "";
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        // Collect audio data chunks every 500ms
        recorder.start(500);

        isRecordingRef.current = true;
        setIsRecording(true);
      } catch (err: any) {
        console.warn("Could not start silent audio recording:", err);
        cleanupStream();
        setFriendlyError(
          "Microphone access blocked. Please allow microphone permissions in browser settings."
        );
      }
    },
    [cleanupStream]
  );

  // Stop recording on unmount or visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isRecordingRef.current) {
        stopRecording(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      cleanupStream();
    };
  }, [stopRecording, cleanupStream]);

  return {
    isRecording,
    isTranscribing,
    audioLevel,
    friendlyError,
    startRecording,
    stopRecording,
    updateBaseText,
  };
}

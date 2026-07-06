import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useVoiceRecorder — MediaRecorder → transcribe-audio edge fn → text.
 *
 * This is the primary voice path on ALL platforms: it works on iOS Safari
 * (which has no Web Speech API) and gives Whisper-quality Swedish transcripts
 * everywhere else. Callers keep Web Speech only as a fallback when
 * MediaRecorder itself is unavailable.
 */

export type VoiceRecorderState = "idle" | "recording" | "transcribing";
export type VoiceRecorderError = "not-allowed" | "no-recorder" | "transcribe-failed";

interface UseVoiceRecorderOptions {
  language: string;
  onTranscript: (text: string) => void;
  onError: (kind: VoiceRecorderError) => void;
}

export function isRecorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

export function useVoiceRecorder({ language, onTranscript, onError }: UseVoiceRecorderOptions) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  // Callbacks in refs so start/stop keep stable identities for consumers.
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const langRef = useRef(language);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;
  langRef.current = language;

  const cleanupStream = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setElapsedSec(0);
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      cleanupStream();
    };
  }, [cleanupStream]);

  const transcribeBlob = useCallback(async (blob: Blob, mimeType: string) => {
    setState("transcribing");
    try {
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("audio", new File([blob], `capture.${ext}`, { type: mimeType }));
      form.append("language", langRef.current.slice(0, 2));
      const { data, error } = await supabase.functions.invoke("transcribe-audio", { body: form });
      if (error || typeof data?.text !== "string") throw error ?? new Error("no text");
      setState("idle");
      if (data.text.trim()) onTranscriptRef.current(data.text.trim());
    } catch (err) {
      console.error("Voice transcription failed:", err);
      setState("idle");
      onErrorRef.current("transcribe-failed");
    }
  }, []);

  const start = useCallback(async () => {
    if (!isRecorderSupported()) {
      onErrorRef.current("no-recorder");
      return;
    }
    if (recorderRef.current?.state === "recording") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanupStream();
        if (!cancelledRef.current && blob.size > 0) {
          void transcribeBlob(blob, type);
        } else {
          setState("idle");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } catch (err) {
      console.error("Mic access failed:", err);
      cleanupStream();
      setState("idle");
      const name = err instanceof DOMException ? err.name : "";
      onErrorRef.current(name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" : "no-recorder");
    }
  }, [cleanupStream, transcribeBlob]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else setState("idle");
  }, []);

  return { state, elapsedSec, start, stop, cancel };
}

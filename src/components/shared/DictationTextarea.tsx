import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Square, Loader2 } from "lucide-react";
import { useVoiceRecorder, isRecorderSupported } from "@/hooks/useVoiceRecorder";
import { toast } from "sonner";

interface DictationTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClass?: string;
}

const SPEECH_LANGS: Record<string, string> = {
  sv: "sv-SE",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
};

/**
 * Textarea with voice dictation. Primary path records audio (MediaRecorder)
 * and transcribes server-side (Whisper) — works on iOS Safari and hears
 * Swedish building terms well. Web Speech is kept as a fallback for the rare
 * browser with speech recognition but no MediaRecorder.
 */
export function DictationTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  minHeightClass = "min-h-[180px]",
}: DictationTextareaProps) {
  const { t, i18n } = useTranslation();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Text present when the mic was started — each onresult event carries the
  // full accumulated transcript, so we always append to this snapshot.
  const baseTextRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const hasSpeech =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const recorder = useVoiceRecorder({
    language: i18n.language || "sv",
    onTranscript: (text) => onChange(`${valueRef.current} ${text}`.trimStart()),
    onError: (kind) => {
      if (kind === "no-recorder" && hasSpeech) {
        startWebSpeech();
        return;
      }
      toast.error(
        kind === "not-allowed"
          ? t("planningWizard.micDenied", "Mikrofonen är blockerad — kolla webbläsarens behörighet.")
          : t("planningWizard.micFailed", "Rösten kunde inte tolkas — prova igen eller skriv."),
      );
    },
  });

  const startWebSpeech = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition ||
      (window as unknown as Record<string, unknown>).SpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new (SpeechRecognitionCtor as new () => SpeechRecognition)();
    recognition.lang = SPEECH_LANGS[i18n.language?.slice(0, 2) ?? ""] || "sv-SE";
    recognition.continuous = true;
    recognition.interimResults = true;

    baseTextRef.current = valueRef.current;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onChange(`${baseTextRef.current} ${transcript}`.trimStart());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [i18n.language, onChange]);

  const toggleVoice = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    if (recorder.state === "recording") {
      recorder.stop();
      return;
    }
    if (recorder.state === "transcribing") return;
    if (isRecorderSupported()) {
      void recorder.start();
      return;
    }
    startWebSpeech();
  }, [listening, recorder, startWebSpeech]);

  const showMic = isRecorderSupported() || hasSpeech;
  const active = listening || recorder.state === "recording";

  return (
    <div className="relative">
      <textarea
        className={`w-full ${minHeightClass} px-4 py-3 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 leading-relaxed`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {showMic && (
        <button
          type="button"
          className={`absolute bottom-3 right-3 h-11 w-11 md:h-9 md:w-9 rounded-full flex items-center justify-center transition-colors shadow-sm ${
            active
              ? "bg-red-500 text-white animate-pulse"
              : recorder.state === "transcribing"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
          onClick={toggleVoice}
          disabled={recorder.state === "transcribing"}
          title={t("planningWizard.voiceInput", "Voice input")}
          aria-label={t("planningWizard.voiceInput", "Voice input")}
        >
          {active
            ? <Square className="h-4 w-4 fill-current" />
            : recorder.state === "transcribing"
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Mic className="h-5 w-5 md:h-4 md:w-4" />}
        </button>
      )}
      {recorder.state === "recording" && (
        <span className="absolute bottom-4 right-16 md:right-14 text-xs font-medium text-red-600 tabular-nums">
          {Math.floor(recorder.elapsedSec / 60)}:{String(recorder.elapsedSec % 60).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff } from "lucide-react";

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
 * Textarea with browser speech-to-text dictation (webkitSpeechRecognition).
 * The mic button only renders when the browser supports speech recognition.
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

  const hasSpeech =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const toggleVoice = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const SpeechRecognitionCtor =
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition ||
      (window as unknown as Record<string, unknown>).SpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new (SpeechRecognitionCtor as new () => SpeechRecognition)();
    recognition.lang = SPEECH_LANGS[i18n.language?.slice(0, 2) ?? ""] || "sv-SE";
    recognition.continuous = true;
    recognition.interimResults = true;

    baseTextRef.current = value;
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
  }, [listening, value, onChange, i18n.language]);

  return (
    <div className="relative">
      <textarea
        className={`w-full ${minHeightClass} px-4 py-3 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 leading-relaxed`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {hasSpeech && (
        <button
          type="button"
          className={`absolute bottom-3 right-3 h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
            listening
              ? "bg-red-500 text-white animate-pulse"
              : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
          }`}
          onClick={toggleVoice}
          title={t("planningWizard.voiceInput", "Voice input")}
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

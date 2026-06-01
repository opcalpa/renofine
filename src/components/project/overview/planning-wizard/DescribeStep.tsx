import { useTranslation } from "react-i18next";
import { Mic, MicOff } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import type { PlanningStepProps } from "./types";

interface DescribeStepProps extends PlanningStepProps {
  analyzing: boolean;
}

export function DescribeStep({ formData, updateFormData, analyzing }: DescribeStepProps) {
  const { t } = useTranslation();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const hasSpeech = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const toggleVoice = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = (window as unknown as Record<string, unknown>).webkitSpeechRecognition || (window as unknown as Record<string, unknown>).SpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new (SpeechRecognition as new () => SpeechRecognition)();
    recognition.lang = "sv-SE";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      updateFormData({ description: formData.description + " " + transcript });
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, formData.description, updateFormData]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">
          {t("planningWizard.step1Title", "Describe your renovation")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("planningWizard.step1Desc", "Tell us in your own words what you want to do. Think big picture — details come later.")}
        </p>
      </div>

      <div className="relative">
        <textarea
          className="w-full min-h-[180px] px-4 py-3 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 leading-relaxed"
          placeholder={t(
            "planningWizard.step1Placeholder",
            "e.g. We're renovating the bathroom and kitchen. New tiles in the bathroom, new cabinet fronts in the kitchen and repainting the whole apartment..."
          )}
          value={formData.description}
          onChange={(e) => updateFormData({ description: e.target.value })}
          disabled={analyzing}
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

    </div>
  );
}

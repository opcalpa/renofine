/**
 * The one place a worker says anything — a photo, a line, a voice note, or all
 * three — and picks what it means.
 *
 * What it replaces: a "Be om inköp" dialog with NINE fields (name, quantity,
 * unit, price, vendor, task, description, date, payment method, receipt file).
 * It was used exactly zero times in production. The two messages workers did
 * send both carried a photo and no useful text, which is the whole thesis:
 * on a site with a language gap the picture is the message and the words are
 * optional.
 *
 * The photo is an ALTERNATIVE, not a requirement. Typing "Kup 10 pędzli" with
 * no picture goes through the identical four-way choice, and so does a voice
 * note. The grammar hangs on the intent, never on the modality — which is why
 * the intent chips sit here, on the composer, and not on the camera button.
 *
 * Follow-up questions are asked only when the answer cannot be derived: the
 * task is skipped when there is one obvious candidate, and the quantity is
 * pre-filled from the text before anything is asked. Depth is at most two and
 * usually zero. No field is ever mandatory.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, Mic, Send, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  FIELD_INTENTS,
  FIELD_INTENT_META,
  guessIntent,
  parseNeed,
  type FieldIntent,
} from '@/lib/fieldIntent';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface ComposerTask {
  id: string;
  title: string;
}

interface Props {
  token: string;
  tasks: ComposerTask[];
  /** Preselected when the composer sits inside one task's card. */
  taskId?: string | null;
  canCreatePurchases: boolean;
  onSent?: () => void;
}

export function WorkerComposer({ token, tasks, taskId, canCreatePurchases, onSent }: Props) {
  const { t } = useTranslation();

  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [intent, setIntent] = useState<FieldIntent | null>(null);
  const [quantity, setQuantity] = useState(1);
  // Only asked when the composer is not already inside a task AND there is
  // more than one candidate. One task is not a question worth asking.
  const [chosenTask, setChosenTask] = useState<string | null>(taskId ?? null);
  const [sending, setSending] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stream.getTracks().forEach((tr) => tr.stop());
        recorderRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Typing "10 penslar" fills the quantity before it is ever asked for.
  useEffect(() => {
    const parsed = parseNeed(text);
    if (parsed.quantity) setQuantity(parsed.quantity);
  }, [text]);

  const suggested = guessIntent(text);
  const effectiveTaskId = taskId ?? chosenTask;
  const needsTaskChoice =
    !taskId && tasks.length > 1 && (intent === 'klart' || intent === 'behover');
  const hasContent = !!text.trim() || !!photo;
  const availableIntents = FIELD_INTENTS.filter(
    (i) => i !== 'behover' || canCreatePurchases
  );

  const reset = () => {
    setText('');
    setPhoto(null);
    setIntent(null);
    setQuantity(1);
    if (!taskId) setChosenTask(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ---------------------------------------------------------------------------
  // Voice — sent immediately, because a recording is already a finished thought
  // ---------------------------------------------------------------------------
  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;
        setSending(true);
        try {
          const fd = new FormData();
          fd.append('token', token);
          if (effectiveTaskId) fd.append('taskId', effectiveTaskId);
          fd.append('intent', intent ?? 'info');
          fd.append('voice', blob, `voice-${Date.now()}.webm`);
          if (photo) fd.append('photo', photo);
          const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-send-message`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
            body: fd,
          });
          if (!res.ok) throw new Error('voice failed');
          toast.success(t('field.sent', 'Skickat'));
          reset();
          onSent?.();
        } catch {
          toast.error(t('common.error', 'Kunde inte skicka'));
        } finally {
          setSending(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((s) => s + 1), 1000);
    } catch {
      toast.error(t('worker.micDenied', 'Mikrofonen är inte tillåten'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, effectiveTaskId, intent, photo, t, onSent]);

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------
  const send = async () => {
    if (!hasContent || sending) return;
    const chosen = intent ?? 'info';
    setSending(true);
    try {
      if (chosen === 'behover') {
        // A purchase is not a message: it becomes a real request the owner
        // approves, through the same endpoint and the same PO invariant the
        // rest of the app uses. Only `name` is required by the server — the
        // other eight fields the old dialog demanded are genuinely optional.
        const parsed = parseNeed(text);
        const fd = new FormData();
        fd.append('token', token);
        fd.append('mode', 'request');
        fd.append('name', parsed.name || text.trim() || t('field.unnamedItem', 'Material'));
        fd.append('quantity', String(quantity));
        if (effectiveTaskId) fd.append('taskId', effectiveTaskId);
        if (text.trim()) fd.append('description', text.trim());
        if (photo) fd.append('photo', photo);
        const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-create-purchase`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
          body: fd,
        });
        if (!res.ok) throw new Error('purchase failed');
      } else {
        const fd = new FormData();
        fd.append('token', token);
        if (effectiveTaskId) fd.append('taskId', effectiveTaskId);
        fd.append('intent', chosen);
        if (text.trim()) fd.append('message', text.trim());
        if (photo) fd.append('photo', photo);
        const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-send-message`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
          body: fd,
        });
        if (!res.ok) throw new Error('message failed');
      }
      toast.success(t('field.sent', 'Skickat'));
      reset();
      onSent?.();
    } catch (err) {
      console.error('Field message failed:', err);
      toast.error(t('common.error', 'Kunde inte skicka'));
    } finally {
      setSending(false);
    }
  };

  const meta = intent ? FIELD_INTENT_META[intent] : null;

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      {/* Photo preview — the message itself, not an attachment */}
      {photoPreview && (
        <div className="relative">
          <img
            src={photoPreview}
            alt=""
            className="w-full max-h-52 rounded-lg object-cover"
          />
          <button
            type="button"
            onClick={() => setPhoto(null)}
            aria-label={t('common.remove', 'Ta bort')}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Input row: camera · text · mic */}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => fileRef.current?.click()}
          aria-label={t('field.takePhoto', 'Ta ett foto')}
        >
          <Camera className="h-5 w-5" />
        </Button>

        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('field.placeholder', 'Skriv, eller skicka bara en bild')}
          className="h-11"
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
        />

        <Button
          type="button"
          variant={recording ? 'destructive' : 'outline'}
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={recording ? stopRecording : startRecording}
          aria-label={t('field.voice', 'Spela in')}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        </Button>
      </div>

      {recording && (
        <p className="text-center text-sm text-destructive tabular-nums">
          {t('field.recording', 'Spelar in')} {Math.floor(recordingTime / 60)}:
          {String(recordingTime % 60).padStart(2, '0')}
        </p>
      )}

      {/* The four-way choice — icon first, so it reads without the word */}
      <div className="grid grid-cols-4 gap-1.5">
        {availableIntents.map((key) => {
          const m = FIELD_INTENT_META[key];
          const active = intent === key;
          const isSuggested = !intent && suggested === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setIntent(active ? null : key)}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-xs transition-colors ${
                active
                  ? 'border-primary bg-primary/10 font-medium'
                  : isSuggested
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-background'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {m.icon}
              </span>
              <span className="leading-tight">{t(m.labelKey, m.labelFallback)}</span>
            </button>
          );
        })}
      </div>

      {/* Quantity — only for a purchase, pre-filled, thumb-sized */}
      {intent === 'behover' && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-sm">{t('field.howMany', 'Hur många?')}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="-"
            >
              −
            </Button>
            <span className="w-10 text-center text-lg font-medium tabular-nums">{quantity}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="+"
            >
              +
            </Button>
          </div>
        </div>
      )}

      {/* Which job — asked only when it cannot be derived */}
      {needsTaskChoice && (
        <div className="space-y-1.5">
          <span className="text-sm text-muted-foreground">
            {t('field.whichTask', 'Vilket arbete?')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setChosenTask(chosenTask === task.id ? null : task.id)}
                className={`min-h-[40px] rounded-full border px-3 py-1.5 text-sm ${
                  chosenTask === task.id
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border bg-background'
                }`}
              >
                {task.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* What happens next, in the worker's own language */}
      {meta && hasContent && (
        <p className="text-xs text-muted-foreground">{t(meta.promiseKey, meta.promiseFallback)}</p>
      )}

      <Button
        type="button"
        onClick={send}
        disabled={!hasContent || sending || recording}
        className="h-11 w-full gap-2"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {t('field.send', 'Skicka')}
      </Button>
    </div>
  );
}

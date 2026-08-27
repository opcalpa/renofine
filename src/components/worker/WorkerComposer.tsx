/**
 * The one place a worker says anything about the day.
 *
 * What it replaces, in two steps:
 *   1. a "Be om inköp" dialog with NINE fields, used exactly zero times;
 *   2. four chips where exactly ONE had to be picked before speaking.
 *
 * Step 2 was our own mistake. A tradesperson says everything in one breath —
 * "8 timmar, kaklet 70 %, behöver fog, kommer sent imorgon" — and making them
 * sort that into four separate flows put the sorting BEFORE the saying. In
 * Carl's words: "hur ska dom ens fatta det!?"
 *
 * So: one field for what happened (type, speak, photograph, or any mix), and
 * four OPTIONAL add-ons ticked only when they apply. Question and info are
 * never buttons — a question mark makes it a question, and the receiver then
 * owes an answer. The server reads the rest out of the words and returns what
 * it understood, which is shown as a receipt AFTER sending. Nothing is
 * confirmed beforehand: hours and purchases wait for the builder's yes anyway,
 * so a misreading costs a correction, never money.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check, Loader2, Mic, Percent, Send, ShoppingCart, Square, Timer, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseNeed } from '@/lib/fieldIntent';
import { analytics, AnalyticsEvents } from '@/lib/analytics';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Matches MAX_PURCHASE_ITEMS in worker-send-report — the server trims to this. */
const MAX_ORDER_ITEMS = 20;

/**
 * How long Send stays take-back-able.
 *
 * Three, like Gmail — regret arrives in the first breath after the tap, not
 * ten seconds later, and a countdown that outlasts the regret just makes the
 * screen feel busy. The server still allows two minutes, so a slow phone on
 * site never loses a legitimate undo to a stopwatch.
 */
const UNDO_SECONDS = 3;

/** One thing to order: what it is, and how many. */
interface OrderItem {
  name: string;
  quantity: number;
}

export interface ComposerTask {
  id: string;
  title: string;
}

/** One part of what the server understood, echoed back as the receipt. */
interface ReportPart {
  kind: 'note' | 'question' | 'done' | 'progress' | 'hours' | 'purchase';
  value?: number;
  name?: string;
}

interface Props {
  token: string;
  tasks: ComposerTask[];
  /** Preselected when the composer sits inside one task's card. */
  taskId?: string | null;
  canCreatePurchases: boolean;
  onSent?: () => void;
}

type AddOn = 'done' | 'progress' | 'hours' | 'purchase';

export function WorkerComposer({ token, tasks, taskId, canCreatePurchases, onSent }: Props) {
  const { t } = useTranslation();

  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Add-ons: off until ticked. Nothing here is ever required.
  const [active, setActive] = useState<Set<AddOn>>(new Set());
  const [progress, setProgress] = useState(50);
  const [hours, setHours] = useState(8);
  /** One line per thing needed. A day on site rarely needs exactly one item. */
  const [items, setItems] = useState<OrderItem[]>([{ name: '', quantity: 1 }]);
  /** Once the worker edits the list themselves, the text stops overwriting it. */
  const itemsTouched = useRef(false);

  const [chosenTask, setChosenTask] = useState<string | null>(taskId ?? null);
  /** The receipt: what the server made of the last report. */
  const [receipt, setReceipt] = useState<ReportPart[] | null>(null);
  /** The ten seconds in which sending is still take-back-able. */
  const [sentReportId, setSentReportId] = useState<string | null>(null);
  const [undoLeft, setUndoLeft] = useState(0);
  const [retracting, setRetracting] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // The undo window runs down on its own; when it hits zero the report is
  // simply a report. Nothing is scheduled server-side — the row is already
  // written, which is what makes sending feel instant.
  const undoRunning = undoLeft > 0;
  useEffect(() => {
    if (!undoRunning) return;
    undoTimerRef.current = setInterval(() => setUndoLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    };
  }, [undoRunning]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Typing "10 penslar" fills the quantity and the product before either is
  // ever asked for — the same courtesy the old composer did for quantity only.
  // Only the first line, and only until the worker touches the list: filling in
  // rows someone is already editing takes the pen out of their hand.
  useEffect(() => {
    if (itemsTouched.current) return;
    const parsed = parseNeed(text);
    if (!parsed.quantity && !parsed.name) return;
    setItems((prev) => {
      const [first, ...rest] = prev;
      return [
        { name: parsed.name || first.name, quantity: parsed.quantity || first.quantity },
        ...rest,
      ];
    });
  }, [text]);

  const setItem = (i: number, patch: Partial<OrderItem>) => {
    itemsTouched.current = true;
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const addItem = () => {
    itemsTouched.current = true;
    setItems((prev) => (prev.length >= MAX_ORDER_ITEMS ? prev : [...prev, { name: '', quantity: 1 }]));
  };
  const removeItem = (i: number) => {
    itemsTouched.current = true;
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  };

  // "Which task?" is skipped when there is exactly one — so the one must
  // actually be chosen, or the report lands on the project and moves nothing.
  const effectiveTaskId = taskId ?? chosenTask ?? (tasks.length === 1 ? tasks[0].id : null);
  const needsTaskChoice = !taskId && tasks.length > 1 && active.size > 0;
  const hasContent = !!text.trim() || !!photo || active.size > 0;

  const toggle = (key: AddOn) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Done and a partial percentage are the same statement twice; the tick
      // that says "finished" wins and the slider goes away.
      if (key === 'done' && next.has('done')) next.delete('progress');
      if (key === 'progress' && next.has('progress')) next.delete('done');
      return next;
    });

  const reset = () => {
    setText('');
    setPhoto(null);
    setActive(new Set());
    setItems([{ name: '', quantity: 1 }]);
    itemsTouched.current = false;
    if (!taskId) setChosenTask(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  /** Everything the worker said, in one request. Voice included. */
  const buildForm = useCallback(
    (voice?: Blob) => {
      const fd = new FormData();
      fd.append('token', token);
      if (effectiveTaskId) fd.append('taskId', effectiveTaskId);
      if (text.trim()) fd.append('text', text.trim());
      if (photo) fd.append('photo', photo);
      if (voice) fd.append('voice', voice, `voice-${Date.now()}.webm`);
      if (active.has('done')) fd.append('done', 'true');
      if (active.has('progress')) fd.append('progress', String(progress));
      if (active.has('hours')) fd.append('hours', String(hours));
      if (active.has('purchase')) {
        const listed = items
          .filter((it) => it.name.trim())
          .map((it) => ({ name: it.name.trim(), quantity: it.quantity }));
        // Ticking "Beställ" and naming nothing still means something is needed —
        // the words become the item rather than the request being dropped.
        fd.append(
          'purchaseItems',
          JSON.stringify(
            listed.length > 0
              ? listed
              : [{ name: text.trim() || t('field.unnamedItem', 'Material'), quantity: items[0]?.quantity ?? 1 }]
          )
        );
      }
      return fd;
    },
    [token, effectiveTaskId, text, photo, active, progress, hours, items, t]
  );

  const post = useCallback(
    async (fd: FormData) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-send-report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        body: fd,
      });
      if (!res.ok) throw new Error(`report failed: ${res.status}`);
      const data = await res.json();
      const parts: ReportPart[] = Array.isArray(data?.parts) ? data.parts : [];
      setReceipt(parts);
      setSentReportId(typeof data?.reportId === 'string' ? data.reportId : null);
      setUndoLeft(UNDO_SECONDS);
      // What a report actually carries is the question worth answering: did
      // combining parts in one message happen, or do people still send one
      // thing at a time?
      analytics.capture(AnalyticsEvents.FIELD_REPORT_SENT, {
        parts: parts.map((p) => p.kind),
        part_count: parts.length,
        has_photo: !!photo,
        has_voice: fd.has('voice'),
        has_text: !!fd.get('text'),
      });
      toast.success(t('field.sent', 'Skickat'));
      reset();
      onSent?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, onSent]
  );

  // ---------------------------------------------------------------------------
  // Voice — carries the ticked add-ons too, and is transcribed on the server
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
          await post(buildForm(blob));
        } catch (err) {
          console.error('Voice report failed:', err);
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
  }, [buildForm, post, t]);

  const retract = async () => {
    if (!sentReportId || retracting) return;
    setRetracting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-retract-report`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, reportId: sentReportId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // The builder got there first, or the window closed. Either way the
        // report stands, and saying so is kinder than a generic failure.
        toast.error(
          data?.error === 'builder_acted'
            ? t('field.undoTooLateBuilder', 'Byggaren har redan tagit ställning')
            : t('field.undoTooLate', 'För sent att ångra')
        );
        setUndoLeft(0);
        return;
      }
      analytics.capture(AnalyticsEvents.FIELD_REPORT_RETRACTED, { seconds_left: undoLeft });
      toast.success(t('field.undone', 'Ångrat'));
      setReceipt(null);
      setSentReportId(null);
      setUndoLeft(0);
      onSent?.();
    } catch (err) {
      console.error('Retract failed:', err);
      toast.error(t('common.error', 'Kunde inte ångra'));
    } finally {
      setRetracting(false);
    }
  };

  const send = async () => {
    if (!hasContent || sending) return;
    setSending(true);
    try {
      await post(buildForm());
    } catch (err) {
      console.error('Field report failed:', err);
      toast.error(t('common.error', 'Kunde inte skicka'));
    } finally {
      setSending(false);
    }
  };

  const addOns: { key: AddOn; icon: JSX.Element; label: string }[] = [
    { key: 'done', icon: <Check className="h-4 w-4" />, label: t('field.addDone', 'Klart') },
    { key: 'progress', icon: <Percent className="h-4 w-4" />, label: t('field.addProgress', 'Framsteg') },
    { key: 'hours', icon: <Timer className="h-4 w-4" />, label: t('field.addHours', 'Timmar') },
    ...(canCreatePurchases
      ? [{ key: 'purchase' as AddOn, icon: <ShoppingCart className="h-4 w-4" />, label: t('field.addPurchase', 'Beställ') }]
      : []),
  ];

  /** The receipt line: "Skickat: fråga · 10 × penslar · 8 h". */
  const receiptLabel = (p: ReportPart): string => {
    switch (p.kind) {
      case 'hours':
        return t('field.receiptHours', '{{count}} h', { count: p.value ?? 0 });
      case 'progress':
        return `${p.value ?? 0} %`;
      case 'purchase':
        return `${p.value ?? 1} × ${p.name ?? ''}`.trim();
      case 'done':
        return t('field.addDone', 'Klart');
      case 'question':
        return t('field.intent.fraga', 'Fråga');
      default:
        return t('field.intent.info', 'Info');
    }
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      {/* What we understood, AFTER sending. Never a gate before it. */}
      {receipt && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t('field.sentColon', 'Skickat:')}</span>
          <span className="font-medium">{receipt.map(receiptLabel).filter(Boolean).join(' · ')}</span>
          {undoLeft > 0 && sentReportId ? (
            <button
              type="button"
              onClick={retract}
              disabled={retracting}
              className="ml-auto min-h-[32px] font-medium text-primary underline underline-offset-2 disabled:opacity-50"
            >
              {t('field.undo', 'Ångra')} {undoLeft}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="ml-auto text-xs text-muted-foreground underline underline-offset-2"
            >
              {t('common.close', 'Stäng')}
            </button>
          )}
        </div>
      )}

      {/* Photo preview — the message itself, not an attachment */}
      {photoPreview && (
        <div className="relative">
          <img src={photoPreview} alt="" className="w-full max-h-52 rounded-lg object-cover" />
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
          className="h-12 w-12 shrink-0"
          onClick={() => fileRef.current?.click()}
          aria-label={t('field.takePhoto', 'Ta ett foto')}
        >
          <Camera className="h-5 w-5" />
        </Button>

        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('field.placeholderV2', 'Vad hände? Skriv, prata eller fota')}
          className="h-12"
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
        />

        <Button
          type="button"
          variant={recording ? 'destructive' : 'outline'}
          size="icon"
          className="h-12 w-12 shrink-0"
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

      {/* Add-ons — tick only what applies. Combine freely. */}
      <div className="flex flex-wrap gap-1.5">
        {addOns.map(({ key, icon, label }) => {
          const on = active.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              aria-pressed={on}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
                on ? 'border-primary bg-primary/10 font-medium' : 'border-border bg-background'
              }`}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {/* Each add-on asks for its one number, and nothing else */}
      {active.has('progress') && (
        <div className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('field.addProgress', 'Framsteg')}</span>
            <span className="text-lg font-medium tabular-nums">{progress} %</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="h-8 w-full accent-primary"
            aria-label={t('field.addProgress', 'Framsteg')}
          />
        </div>
      )}

      {active.has('hours') && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-sm">{t('field.hoursToday', 'Timmar idag')}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => setHours((h) => Math.max(0.5, h - 0.5))}
              aria-label="-"
            >
              −
            </Button>
            <span className="w-12 text-center text-lg font-medium tabular-nums">{hours}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => setHours((h) => Math.min(24, h + 0.5))}
              aria-label="+"
            >
              +
            </Button>
          </div>
        </div>
      )}

      {active.has('purchase') && (
        <div className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2">
          {/* Item and count share a row: a phone held in a glove has little
              screen, and a stacked "Hur många?" label per item would push the
              send button off it once more than one thing is needed. */}
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={item.name}
                onChange={(e) => setItem(i, { name: e.target.value })}
                placeholder={t('field.whatToBuy', 'Vad behövs?')}
                className="h-11 min-w-0 flex-1"
              />
              <div
                role="group"
                aria-label={t('field.howMany', 'Hur många?')}
                className="flex shrink-0 items-center gap-0.5"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-10"
                  onClick={() => setItem(i, { quantity: Math.max(1, item.quantity - 1) })}
                  aria-label="-"
                >
                  −
                </Button>
                <span className="w-6 text-center text-base font-medium tabular-nums">{item.quantity}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-10"
                  onClick={() => setItem(i, { quantity: item.quantity + 1 })}
                  aria-label="+"
                >
                  +
                </Button>
              </div>
              {items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-8 shrink-0 text-muted-foreground"
                  onClick={() => removeItem(i)}
                  aria-label={t('field.removeItem', 'Ta bort')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {items.length < MAX_ORDER_ITEMS && (
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full text-sm text-muted-foreground"
              onClick={addItem}
            >
              + {t('field.addAnotherItem', 'Lägg till fler')}
            </Button>
          )}
        </div>
      )}

      {/* Which job — asked only when an add-on needs one and it cannot be derived */}
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
                className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm ${
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

      <Button
        type="button"
        onClick={send}
        disabled={!hasContent || sending || recording}
        className="h-12 w-full gap-2"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {t('field.send', 'Skicka')}
      </Button>
    </div>
  );
}

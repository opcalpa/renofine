/**
 * "Den här mappen hör till bostaden" — reading a dropped folder as the home's
 * papers rather than a renovation (P4).
 *
 * This engine does one thing: work out a first guess at what each file is. It
 * never writes. The guesses go to ReviewDocumentsDialog, the person corrects
 * what is wrong, and only then does anything reach storage — the same order P3
 * established for the address page's own upload button.
 *
 * The guess is local by default: the file name alone identifies most papers a
 * broker hands over. Scans arrive as `scan0012.pdf` often enough that a second
 * pass reads the opening of those documents' text, and ONLY those — a folder
 * of well-named files costs nothing at all.
 *
 * Unknown is a fine answer. Anything that fails to match stays `other`, gets
 * saved anyway, and can be re-tagged later. Nothing is dropped silently: what
 * this returns always accounts for every file it was handed.
 */

import { extractFileText } from './ingestProjectFolder';
import { guessCategory, wasRecognised, type PropertyDocumentCategory } from './propertyDocumentService';

/** Files above this are stored without a text pass — see MAX_TEXT_READS. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/**
 * How many unnamed documents get their text read.
 *
 * Each read is a network call, so a 60-file scan dump would otherwise be an
 * invisible bill. Whatever this cap leaves out is reported, not hidden.
 */
const MAX_TEXT_READS = 25;
const CONCURRENCY = 4;

const isPdf = (f: File) =>
  (f.type || '').toLowerCase().includes('pdf') || /\.pdf$/i.test(f.name);
const isDoc = (f: File) =>
  /\.(docx?|odt)$/i.test(f.name) ||
  (f.type || '').includes('word') ||
  (f.type || '').includes('officedocument');
const isTextLike = (f: File) =>
  (f.type || '').startsWith('text/') || /\.(txt|md|markdown|csv|rtf)$/i.test(f.name);

/** Only these are worth a text read — an image's name is all we go on. */
const readableAsText = (f: File) => isPdf(f) || isDoc(f) || isTextLike(f);

export interface PropertyIngestGuess {
  file: File;
  category: PropertyDocumentCategory;
  /** True when a keyword matched, rather than falling back to `other`. */
  recognised: boolean;
}

export interface PropertyIngestPlan {
  guesses: PropertyIngestGuess[];
  /** How many were identified from their file name alone (no network). */
  fromName: number;
  /** How many needed their text read before they could be identified. */
  fromText: number;
  /** Read, and still nothing recognisable — they will be saved as `other`. */
  unrecognised: number;
  /** Over the size limit: still saved, just never opened to look inside. */
  oversized: number;
  /** Documents left unread because the text-read cap was reached. */
  notRead: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Guess what each dropped file is. Writes nothing.
 *
 * Every file handed in comes back in `guesses` — including the ones nothing
 * could be made of. A file the app cannot identify is still the person's file,
 * and losing it would be a far worse answer than filing it under Övrigt.
 */
export async function planPropertyFolderIngest(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<PropertyIngestPlan> {
  const guesses: PropertyIngestGuess[] = files.map((file) => {
    const category = guessCategory(file.name);
    return { file, category, recognised: wasRecognised(category) };
  });

  const fromName = guesses.filter((g) => g.recognised).length;

  // Only the ones the name could not place, and only those worth opening.
  const candidates = guesses
    .map((g, index) => ({ g, index }))
    .filter(({ g }) => !g.recognised && readableAsText(g.file));

  const oversized = candidates.filter(({ g }) => g.file.size > MAX_FILE_BYTES).length;
  const readable = candidates.filter(({ g }) => g.file.size <= MAX_FILE_BYTES);
  const toRead = readable.slice(0, MAX_TEXT_READS);
  const notRead = readable.length - toRead.length;

  let done = 0;
  onProgress?.(0, toRead.length);
  await mapLimit(toRead, CONCURRENCY, async ({ g, index }) => {
    const text = await extractFileText(g.file);
    if (text) {
      const category = guessCategory(g.file.name, text);
      if (wasRecognised(category)) {
        guesses[index] = { file: g.file, category, recognised: true };
      }
    }
    done += 1;
    onProgress?.(done, toRead.length);
  });

  const fromText = guesses.filter((g) => g.recognised).length - fromName;

  return {
    guesses,
    fromName,
    fromText,
    unrecognised: guesses.filter((g) => !g.recognised).length,
    oversized,
    notRead,
  };
}

/**
 * The landing page's real door: "Vad ska du renovera?"
 *
 * It replaces the secondary CTA "Se demoprojekt", which 1.8 % of visitors
 * clicked over 90 days. The demo is somebody else's kitchen; this field is the
 * visitor's own, and it leads straight to the plan — no role modal, no language
 * step, no quick-start grid in between. Those three screens are what stood
 * between 791 landing visitors and the value the app can compute in a second.
 *
 * 82 % of visitors arrive on a phone from Facebook, so the presets are
 * thumb-sized taps and the free-text field is optional, never required. The
 * typed sentence is the better input, but a tap must be enough.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';

export interface PlanStarterProps {
  /** Called with the visitor's own words (or the preset's sentence). */
  onStart: (description: string, preset: string | null) => void;
  variant: 'desktop' | 'mobile';
}

/**
 * Presets are written as SENTENCES, not labels, because they are fed straight
 * into the same description parser the wizard uses — "Kök" parses to nothing,
 * "Jag ska renovera köket" parses to a kitchen with work types.
 */
const PRESETS: Array<{ key: string; labelKey: string; label: string; sentenceKey: string; sentence: string }> = [
  { key: 'kitchen', labelKey: 'landingV2.starter.preset.kitchen', label: 'Köket', sentenceKey: 'landingV2.starter.sentence.kitchen', sentence: 'Jag ska renovera köket — nya skåp, bänkskiva, kakel och el.' },
  { key: 'bathroom', labelKey: 'landingV2.starter.preset.bathroom', label: 'Badrummet', sentenceKey: 'landingV2.starter.sentence.bathroom', sentence: 'Jag ska renovera badrummet — rivning, tätskikt, kakel, VVS och el.' },
  { key: 'painting', labelKey: 'landingV2.starter.preset.painting', label: 'Måla om', sentenceKey: 'landingV2.starter.sentence.painting', sentence: 'Jag ska måla om vardagsrummet, sovrummet och hallen.' },
  { key: 'flooring', labelKey: 'landingV2.starter.preset.flooring', label: 'Nytt golv', sentenceKey: 'landingV2.starter.sentence.flooring', sentence: 'Jag ska lägga nytt golv i vardagsrummet, sovrummet och hallen.' },
  { key: 'electrical', labelKey: 'landingV2.starter.preset.electrical', label: 'El', sentenceKey: 'landingV2.starter.sentence.electrical', sentence: 'Jag ska dra om elen i hela lägenheten och byta elcentral.' },
  { key: 'whole', labelKey: 'landingV2.starter.preset.whole', label: 'Hela bostaden', sentenceKey: 'landingV2.starter.sentence.whole', sentence: 'Jag ska totalrenovera lägenheten — kök, badrum, vardagsrum, sovrum och hall.' },
];

export function PlanStarter({ onStart, variant }: PlanStarterProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const isMobile = variant === 'mobile';

  const submitTyped = () => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    onStart(trimmed, null);
  };

  return (
    <div style={{ marginTop: isMobile ? 20 : 28 }}>
      <div
        style={{
          fontFamily: '"Inter Tight", Inter, sans-serif',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--lp-fg)',
          marginBottom: 10,
        }}
      >
        {t('landingV2.starter.title', 'Vad ska du renovera?')}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitTyped();
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('landingV2.starter.placeholder', 'T.ex. måla om vardagsrummet och lägga nytt golv')}
          aria-label={t('landingV2.starter.title', 'Vad ska du renovera?')}
          style={{
            flex: 1,
            minWidth: 0,
            padding: isMobile ? '13px 14px' : '11px 14px',
            borderRadius: 6,
            border: '1px solid var(--lp-hairline)',
            background: 'var(--lp-bg)',
            color: 'var(--lp-fg)',
            fontSize: isMobile ? 15 : 14,
            fontFamily: '"Inter Tight", Inter, sans-serif',
            minHeight: isMobile ? 48 : undefined,
          }}
        />
        <button
          type="submit"
          disabled={text.trim().length < 3}
          className="inline-flex items-center gap-2 border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            padding: isMobile ? '13px 18px' : '11px 18px',
            borderRadius: 6,
            background: 'var(--lp-accent-ink)',
            color: 'var(--lp-bg)',
            fontSize: isMobile ? 15 : 14,
            fontWeight: 500,
            minHeight: isMobile ? 48 : undefined,
            whiteSpace: 'nowrap',
          }}
        >
          {t('landingV2.starter.submit', 'Visa min plan')}
          <ArrowRight size={14} />
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onStart(t(preset.sentenceKey, preset.sentence), preset.key)}
            className="cursor-pointer"
            style={{
              padding: isMobile ? '9px 14px' : '7px 12px',
              borderRadius: 999,
              border: '1px solid var(--lp-hairline)',
              background: 'transparent',
              color: 'var(--lp-fg-muted)',
              fontSize: isMobile ? 14 : 13,
              fontFamily: '"Inter Tight", Inter, sans-serif',
              minHeight: isMobile ? 40 : undefined,
            }}
          >
            {t(preset.labelKey, preset.label)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--lp-fg-subtle)' }}>
        {t('landingV2.starter.micro', 'Kostnadsspann, ROT och tidsplan på under en minut · inget konto')}
      </div>
    </div>
  );
}

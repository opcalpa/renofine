import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { HoverTabMenu } from '@/components/ui/HoverTabMenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ResponsiveTabSubItem = {
  label: string;
  value: string;
  description?: string;
};

export type ResponsiveTabDefinition = {
  key: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  items?: ResponsiveTabSubItem[];
  onMainClick?: () => void;
  onSelect?: (value: string) => void;
  activeValue?: string;
};

interface Props {
  tabs: ResponsiveTabDefinition[];
}

const OVERFLOW_BUTTON_WIDTH = 36;
const TAB_TRIGGER_CLASS =
  'px-2.5 py-1.5 text-[13px] tracking-[-0.002em] cursor-pointer rounded-md transition-colors';

export const ResponsiveTabBar: React.FC<Props> = ({ tabs }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measurer = measureRef.current;
    if (!container || !measurer) return;

    const recompute = () => {
      const available = container.clientWidth;
      const items = Array.from(measurer.children) as HTMLElement[];
      const widths = items.map((el) => el.offsetWidth);

      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const remaining = widths.length - i - 1;
        const reserve = remaining > 0 ? OVERFLOW_BUTTON_WIDTH : 0;
        if (used + widths[i] + reserve <= available) {
          used += widths[i];
          count++;
        } else {
          break;
        }
      }
      setVisibleCount((prev) => (prev === count ? prev : count));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    Array.from(measurer.children).forEach((el) => ro.observe(el as Element));
    return () => ro.disconnect();
  }, [tabs]);

  const visibleTabs = tabs.slice(0, visibleCount);
  const overflowTabs = tabs.slice(visibleCount);

  const renderTab = (tab: ResponsiveTabDefinition) => {
    const triggerClass = cn(
      TAB_TRIGGER_CLASS,
      tab.active
        ? 'bg-accent/60 text-foreground font-medium'
        : 'text-muted-foreground hover:text-foreground font-normal',
    );
    if (tab.items && tab.items.length > 0) {
      return (
        <HoverTabMenu
          key={tab.key}
          trigger={<div className={triggerClass}>{tab.label}</div>}
          items={tab.items}
          onSelect={(v) => tab.onSelect?.(v)}
          onMainClick={tab.onMainClick}
          activeValue={tab.activeValue}
        />
      );
    }
    const handleClick = tab.onClick ?? tab.onMainClick;
    return (
      <div key={tab.key} className={triggerClass} onClick={handleClick}>
        {tab.label}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      {/* Visible row */}
      <div className="flex items-center gap-0.5 flex-nowrap">
        {visibleTabs.map(renderTab)}
        {overflowTabs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('common.more', 'Mer')}
                className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {overflowTabs.map((tab, idx) => {
                const hasSub = !!tab.items && tab.items.length > 0;
                const activeClass = tab.active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : '';
                if (hasSub) {
                  return (
                    <div key={tab.key}>
                      {idx > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        className={cn('cursor-pointer', activeClass)}
                        onSelect={() => tab.onMainClick?.()}
                      >
                        {tab.label}
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="pl-5 text-xs text-muted-foreground">
                          {t('common.more', 'Mer')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {tab.items!.map((sub) => (
                            <DropdownMenuItem
                              key={sub.value}
                              className={cn(
                                'cursor-pointer',
                                tab.activeValue === sub.value &&
                                  'bg-accent text-accent-foreground font-medium',
                              )}
                              onSelect={() => tab.onSelect?.(sub.value)}
                            >
                              {sub.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </div>
                  );
                }
                return (
                  <DropdownMenuItem
                    key={tab.key}
                    className={cn('cursor-pointer', activeClass)}
                    onSelect={() => (tab.onClick ?? tab.onMainClick)?.()}
                  >
                    {tab.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Offscreen measurer — renders every tab at natural width */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-0.5 flex-nowrap"
      >
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className={cn(TAB_TRIGGER_CLASS, 'flex items-center')}
          >
            {tab.label}
            {tab.items && tab.items.length > 0 && (
              <ChevronDown className="h-3 w-3 ml-1" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

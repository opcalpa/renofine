/**
 * One address, every renovation on it (S3).
 *
 * The reason this page exists: when a home is sold, the improvement costs from
 * ALL its projects have to be summed — and until now two projects in the same
 * flat knew nothing about each other. Here they finally do.
 *
 * The numbers come from the same engine the project summary uses, so an
 * address and its projects can never report different totals.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Home, MapPin, CalendarDays, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { PageLoadingSkeleton } from '@/components/ui/skeleton-screens';
import { SpendSummaryPanel } from '@/components/property/SpendSummaryPanel';
import { fetchSpendRollup, type SpendRollup } from '@/lib/spendRollup';
import { formatCurrency } from '@/lib/currency';
import { normalizeStatus, STATUS_META } from '@/lib/projectStatus';
import { useTaxDeductionVisible } from '@/hooks/useTaxDeduction';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserRole } from '@/hooks/useUserRole';
import { propertyLabel, hasRealAddress, type PropertyRow } from '@/services/propertyService';
import { EditPropertyDialog } from '@/components/property/EditPropertyDialog';
import { PropertyMembersSection } from '@/components/property/PropertyMembersSection';
import { MergeSuggestionCard } from '@/components/property/MergeSuggestionCard';
import { isPropertyOwner } from '@/services/propertyMemberService';
import { Button } from '@/components/ui/button';
import { isDemoProject } from '@/services/demoProjectService';

interface AddressProject {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  finish_goal_date: string | null;
  created_at: string;
  currency: string | null;
  project_type: string | null;
}

export default function AddressDetail() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuthSession();
  const { role } = useUserRole(user?.id);

  const [profile, setProfile] = useState<{ name: string | null; email: string | null; avatar_url: string | null } | null>(null);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [projects, setProjects] = useState<AddressProject[]>([]);
  const [rollup, setRollup] = useState<SpendRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Shapes the UI only — the database is the real guard (20260824100000).
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Guarded: while auth is still resolving this ran as `user_id=eq.` and
      // PostgREST answered 400 on every load of the page.
      if (user?.id) {
        supabase
          .from('profiles')
          .select('name, email, avatar_url')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (!cancelled) setProfile(data ?? null);
          });
      }

      // RLS decides visibility — no owner filter here, so a property shared to
      // the user (S4) opens the same way their own does.
      const { data: prop } = await supabase
        .from('properties')
        .select('id, name, address, postal_code, city, country, property_designation')
        .eq('id', propertyId)
        .maybeSingle();

      if (cancelled) return;
      if (!prop) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProperty(prop);
      isPropertyOwner(prop.id).then((owner) => {
        if (!cancelled) setCanManage(owner);
      });

      const { data: rows } = await supabase
        .from('projects')
        .select('id, name, status, start_date, finish_goal_date, created_at, currency, project_type')
        .eq('property_id', propertyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      const live = (rows ?? []).filter((p) => !isDemoProject(p.project_type));
      setProjects(live);

      const r = await fetchSpendRollup(live.map((p) => p.id));
      if (cancelled) return;
      setRollup(r);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [propertyId, user?.id, reloadKey]);

  // Projects on one address are realistically in one currency; take it from the
  // newest rather than inventing a mixed-currency sum.
  const currency = projects[0]?.currency ?? 'SEK';
  const country = property?.country ?? 'SE';
  const { showTaxDeduction } = useTaxDeductionVisible(country);
  const isHomeowner = role !== 'contractor';

  const timeline = useMemo(
    () =>
      projects.map((p) => ({
        ...p,
        spend: rollup?.byProject.get(p.id) ?? 0,
      })),
    [projects, rollup]
  );

  if (authLoading || loading) return <PageLoadingSkeleton />;

  if (notFound || !property) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader
        userName={profile?.name ?? undefined}
        userEmail={profile?.email ?? user?.email}
        avatarUrl={profile?.avatar_url ?? undefined}
      />
        <main className="mx-auto max-w-3xl px-4 py-12 text-center">
          <p className="text-muted-foreground">
            {t('addresses.detail.notFound', 'Adressen hittades inte.')}
          </p>
          <button className="mt-4 text-sm text-primary underline" onClick={() => navigate('/start')}>
            {t('addresses.detail.backToProjects', 'Tillbaka till projekt')}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        userName={profile?.name ?? undefined}
        userEmail={profile?.email ?? user?.email}
        avatarUrl={profile?.avatar_url ?? undefined}
      />

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <button
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
          onClick={() => navigate('/start')}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('addresses.detail.backToProjects', 'Tillbaka till projekt')}
        </button>

        <header className="flex items-start gap-3">
          <span className="mt-1 rounded-lg bg-primary/10 p-2">
            <Home className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate">{property.name}</h1>
            {hasRealAddress(property) || property.city ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {propertyLabel(property)}
                {property.postal_code && <span>· {property.postal_code}</span>}
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {t(
                  'addresses.detail.noAddressYet',
                  'Ingen adress angiven — namnet kommer från projektet.'
                )}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {t('addresses.detail.projectCount', { count: projects.length })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0 print:hidden"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {t('addresses.edit.title', 'Redigera adress')}
          </Button>
        </header>

        {!hasRealAddress(property) && (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground print:hidden">
            {t(
              'addresses.detail.addAddressPrompt',
              'Lägg till gatuadressen så hittar nästa renovering hit av sig själv.'
            )}
          </p>
        )}

        <EditPropertyDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          property={property}
          onSaved={() => setReloadKey((k) => k + 1)}
        />

        <MergeSuggestionCard
          propertyId={property.id}
          canMerge={canManage}
          onMerged={() => setReloadKey((k) => k + 1)}
        />

        {rollup && rollup.poCount > 0 && (
          <SpendSummaryPanel
            rollup={rollup}
            currency={currency}
            isHomeowner={isHomeowner}
            showTaxDeduction={showTaxDeduction}
            title={t('addresses.detail.summaryTitle', 'Allt som lagts ner här')}
            icon={<Home className="h-4 w-4 text-primary shrink-0" />}
            note={
              showTaxDeduction
                ? t(
                    'addresses.detail.rotNote',
                    'Summan är ett underlag från dina egna dokument — ROT räknas per person och år, inte per fastighet.'
                  )
                : undefined
            }
          />
        )}

        <PropertyMembersSection propertyId={property.id} canManage={canManage} />

        <section className="rounded-xl border bg-card">
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-sm font-semibold">
              {t('addresses.detail.timeline', 'Renoveringar över tid')}
            </h2>
          </header>

          {timeline.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t('addresses.detail.noProjects', 'Inga projekt på den här adressen ännu.')}
            </p>
          ) : (
            <ul className="divide-y">
              {timeline.map((p) => {
                const meta = STATUS_META[normalizeStatus(p.status)];
                const when = p.start_date ?? p.created_at.slice(0, 10);
                return (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{when}</span>
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.color}`}
                          >
                            {t(meta.labelKey)}
                          </span>
                        </div>
                      </div>
                      {p.spend > 0 && (
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(p.spend, p.currency ?? currency)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {projects.length === 1 && (
          <p className="text-center text-sm text-muted-foreground print:hidden">
            {t(
              'addresses.detail.singleProjectHint',
              'Nästa renovering i samma bostad kan kopplas hit — då räknas allt ihop automatiskt.'
            )}
          </p>
        )}
      </main>
    </div>
  );
}

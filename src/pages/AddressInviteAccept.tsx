/**
 * Accepting an invitation to an address (S4).
 *
 * The whole check lives in the database (`accept_property_invitation`): expiry,
 * email match, already-used, and the already-a-member case. This page only
 * reports what it said and sends the person on.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, TriangleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { acceptPropertyInvitation } from '@/services/propertyMemberService';

export default function AddressInviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuthSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !token) return;

    // Not signed in: keep the token so the invite survives the round trip.
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/address-invite/${token}`)}`, {
        replace: true,
      });
      return;
    }

    let cancelled = false;
    acceptPropertyInvitation(token).then((result) => {
      if (cancelled) return;
      if (result.ok === true) {
        navigate(`/addresses/${result.propertyId}`, { replace: true });
        return;
      }
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [token, user, authLoading, navigate]);

  if (error) {
    // The DB messages are precise; map the two a person can act on.
    const isEmailMismatch = /different email/i.test(error);
    const isExpired = /expired/i.test(error);

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <TriangleAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">
            {t('addresses.accept.failedTitle', 'Inbjudan kunde inte användas')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isEmailMismatch
              ? t(
                  'addresses.accept.wrongEmail',
                  'Inbjudan gäller en annan e-postadress. Logga in med den adress inbjudan skickades till, eller be om en ny inbjudan.'
                )
              : isExpired
                ? t('addresses.accept.expired', 'Inbjudan har gått ut. Be om en ny.')
                : t('addresses.accept.generic', 'Inbjudan finns inte längre, eller är redan använd.')}
          </p>
          <Button className="mt-5" onClick={() => navigate('/start')}>
            {t('addresses.detail.backToProjects', 'Tillbaka till projekt')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <Home className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('addresses.accept.working', 'Kopplar dig till adressen…')}
        </p>
      </div>
    </div>
  );
}

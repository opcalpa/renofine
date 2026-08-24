/**
 * Who else reaches this address (S4).
 *
 * The household case is the point: invite once, and the other adult follows
 * every project on the home — the ones that exist and the ones to come. The
 * viewer role covers the narrower case of a trusted builder who may see what
 * earlier builders did here.
 *
 * The invite copy is deliberately blunt about scope. Nobody — neither the
 * inviter nor an earlier builder whose quotes become visible — should be
 * surprised afterwards.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, UserPlus, Copy, Trash2, ShieldCheck, Eye, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  listPropertyMembers,
  invitePropertyMember,
  removePropertyMember,
  updateMemberRole,
  type PropertyMember,
  type PropertyRole,
} from '@/services/propertyMemberService';

interface Props {
  propertyId: string;
  /** Only owner and admins may invite — mirrors the DB policy, never replaces it. */
  canManage: boolean;
}

export function PropertyMembersSection({ propertyId, canManage }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [members, setMembers] = useState<PropertyMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PropertyRole>('admin');
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(() => {
    listPropertyMembers(propertyId).then(setMembers);
  }, [propertyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    const result = await invitePropertyMember(propertyId, email, role);
    setInviting(false);

    if (!result.ok) {
      toast({
        title: t('common.error', 'Något gick fel'),
        description: t('addresses.members.inviteFailed', 'Kunde inte skapa inbjudan'),
        variant: 'destructive',
      });
      return;
    }
    setEmail('');
    setLastInviteUrl(result.inviteUrl ?? null);
    setCopied(false);
    reload();
  };

  const handleCopy = async () => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the link stays selectable on screen.
    }
  };

  const handleRoleChange = async (member: PropertyMember, role: PropertyRole) => {
    setMembers((current) =>
      (current ?? []).map((m) => (m.id === member.id ? { ...m, role } : m))
    );
    const ok = await updateMemberRole(member.id, role);
    if (!ok) {
      toast({
        title: t('addresses.members.roleFailed', 'Rollen kunde inte ändras'),
        variant: 'destructive',
      });
      reload();
      return;
    }
    toast({
      title:
        role === 'admin'
          ? t('addresses.members.roleNowAdmin', 'Personen delar nu hemmet')
          : t('addresses.members.roleNowViewer', 'Personen har nu bara insyn'),
    });
  };

  const handleRemove = async (member: PropertyMember) => {
    const ok = await removePropertyMember(member.id);
    if (!ok) {
      toast({
        title: t('common.error', 'Något gick fel'),
        description: t('addresses.members.removeFailed', 'Kunde inte ta bort personen'),
        variant: 'destructive',
      });
      return;
    }
    reload();
  };

  if (!members) return null;
  if (members.length === 0 && !canManage) return null;

  return (
    <section className="rounded-xl border bg-card print:hidden">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold">
          {t('addresses.members.title', 'Vilka når den här adressen')}
        </h2>
      </header>

      {members.length > 0 && (
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <span className="rounded-lg bg-muted p-1.5 shrink-0">
                {m.role === 'admin' ? (
                  <ShieldCheck className="h-4 w-4 text-primary" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.displayName || m.displayEmail || m.invited_email}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {m.role === 'admin'
                    ? t('addresses.members.roleAdmin', 'Delar hemmet — kan se och ändra allt')
                    : t('addresses.members.roleViewer', 'Insyn — kan se, men inte ändra')}
                  {!m.accepted_at && ` · ${t('addresses.members.pending', 'väntar på svar')}`}
                </span>
              </span>
              {canManage && (
                <>
                  {/* The line between the two roles now decides who reaches the
                      home's papers, so it has to be changeable without
                      removing and re-inviting the person. */}
                  <Select
                    value={m.role}
                    onValueChange={(value) => handleRoleChange(m, value as PropertyRole)}
                  >
                    <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        {t('addresses.members.optionAdmin', 'Delar hemmet')}
                      </SelectItem>
                      <SelectItem value="viewer">
                        {t('addresses.members.optionViewer', 'Bara insyn')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(m)}
                    aria-label={t('addresses.members.remove', 'Ta bort')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="space-y-3 border-t px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="member-email">
                {t('addresses.members.inviteLabel', 'Bjud in med e-post')}
              </Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                placeholder="namn@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-role" className="sr-only">
                {t('addresses.members.roleLabel', 'Roll')}
              </Label>
              <Select value={role} onValueChange={(v) => setRole(v as PropertyRole)}>
                <SelectTrigger id="member-role" className="sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    {t('addresses.members.optionAdmin', 'Delar hemmet')}
                  </SelectItem>
                  <SelectItem value="viewer">
                    {t('addresses.members.optionViewer', 'Bara insyn')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} disabled={inviting || !email.trim()}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {t('addresses.members.invite', 'Bjud in')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t(
              'addresses.members.scopeWarning',
              'Personen ser ALLA projekt på den här adressen — även tidigare och framtida. Inbjudan gäller bara den e-postadress du skriver in.'
            )}
          </p>

          {lastInviteUrl && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {t('addresses.members.linkHint', 'Skicka länken till personen:')}
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                  {lastInviteUrl}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      {t('common.copied', 'Kopierad')}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {t('common.copy', 'Kopiera')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Edit an address's own details.
 *
 * Closes the loop the backfill left open: a project with no address produced a
 * property named after the project ("Kitchen!"), and nothing could correct it.
 * That is not cosmetic — `propertyAddressKey` groups on the PROPERTY's address,
 * so an address left blank here can never collect the next renovation.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  updateProperty,
  setResidenceStatus,
  type PropertyRow,
  type ResidenceStatus,
  type Tenure,
} from '@/services/propertyService';
import { TENURE_OPTIONS } from '@/lib/rotIdentifiers';

/** The dropdown needs a value for "no answer"; the column stores NULL. */
const UNANSWERED = '__unanswered__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: PropertyRow;
  onSaved: () => void;
}

export function EditPropertyDialog({ open, onOpenChange, property, onSaved }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address ?? '');
  const [postalCode, setPostalCode] = useState(property.postal_code ?? '');
  const [city, setCity] = useState(property.city ?? '');
  const [designation, setDesignation] = useState(property.property_designation ?? '');
  const [residence, setResidence] = useState<string>(property.residence_status ?? UNANSWERED);
  // P2 — how the home is HELD. Decides which identifiers ROT asks for, and
  // therefore which fields below are worth showing at all.
  const [tenure, setTenure] = useState<string>(property.tenure ?? UNANSWERED);
  const [brfName, setBrfName] = useState(property.brf_name ?? '');
  const [brfOrgNumber, setBrfOrgNumber] = useState(property.brf_org_number ?? '');
  const [apartmentNumber, setApartmentNumber] = useState(property.apartment_number ?? '');
  // While the name is still the auto-generated one, let it follow the street
  // address the user types. Once they edit the name themselves, it stops.
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(property.name);
    setAddress(property.address ?? '');
    setPostalCode(property.postal_code ?? '');
    setCity(property.city ?? '');
    setDesignation(property.property_designation ?? '');
    setResidence(property.residence_status ?? UNANSWERED);
    setTenure(property.tenure ?? UNANSWERED);
    setBrfName(property.brf_name ?? '');
    setBrfOrgNumber(property.brf_org_number ?? '');
    setApartmentNumber(property.apartment_number ?? '');
    setNameTouched(Boolean(property.address?.trim()));
  }, [open, property]);

  const handleAddressChange = (value: string) => {
    setAddress(value);
    if (!nameTouched) setName(value);
  };

  const handleSave = async () => {
    if (!name.trim() && !address.trim()) return;
    setSaving(true);
    const ok = await updateProperty(property.id, {
      name: name.trim() || address.trim(),
      address,
      postalCode,
      city,
      propertyDesignation: designation,
      tenure: tenure === UNANSWERED ? null : (tenure as Tenure),
      brfName,
      brfOrgNumber,
      apartmentNumber,
    });

    // Always reversible: this is the durable way back from "Tidigare", and the
    // only way to answer the question after waving the prompt away.
    const nextStatus = residence === UNANSWERED ? null : (residence as ResidenceStatus);
    if (nextStatus !== (property.residence_status ?? null)) {
      await setResidenceStatus(property.id, nextStatus);
    }
    setSaving(false);

    if (!ok) {
      toast({
        title: t('common.error', 'Något gick fel'),
        description: t('addresses.edit.failed', 'Kunde inte spara adressen'),
        variant: 'destructive',
      });
      return;
    }
    toast({ title: t('addresses.edit.saved', 'Adressen är sparad') });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The bostadsrätt branch adds four fields — on a short viewport the
          footer would otherwise sit below the fold with no way to reach it. */}
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('addresses.edit.title', 'Redigera adress')}</DialogTitle>
          <DialogDescription>
            {t(
              'addresses.edit.description',
              'Uppgifterna här håller ihop bostadens alla renoveringar.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="prop-address">{t('projects.address', 'Gatuadress')}</Label>
            <Input
              id="prop-address"
              value={address}
              placeholder={t('projects.addressPlaceholder', 't.ex. Storgatan 5')}
              onChange={(e) => handleAddressChange(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prop-postal">{t('projects.postalCode', 'Postnummer')}</Label>
              <Input
                id="prop-postal"
                value={postalCode}
                placeholder="123 45"
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-city">{t('projects.city', 'Ort')}</Label>
              <Input id="prop-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prop-name">{t('addresses.edit.name', 'Namn')}</Label>
            <Input
              id="prop-name"
              value={name}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t('addresses.edit.nameHint', 'Vad bostaden kallas i appen — t.ex. "Hemma" eller "Sommarstugan".')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('addresses.residence.label', 'Bor ni här?')}</Label>
            <Select value={residence} onValueChange={setResidence}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">
                  {t('addresses.residence.optionCurrent', 'Ja — nuvarande bostad')}
                </SelectItem>
                <SelectItem value="former">
                  {t('addresses.residence.optionFormer', 'Tidigare bostad')}
                </SelectItem>
                <SelectItem value={UNANSWERED}>
                  {t('addresses.residence.optionUnanswered', 'Inte angivet')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t(
                'addresses.residence.hint',
                'Flera bostäder kan vara nuvarande samtidigt — hemmet och sommarstugan. Tidigare bostäder ligger kvar längst ner med allt sitt underlag.'
              )}
            </p>
          </div>

          {/* P2 — the answer that decides what Skatteverket asks for here.
              Reported, never advised: the hints say what they ask for and
              where to find it. */}
          <div className="space-y-2">
            <Label>{t('rot.tenure.label', 'Upplåtelseform')}</Label>
            <Select value={tenure} onValueChange={setTenure}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENURE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
                <SelectItem value={UNANSWERED}>
                  {t('addresses.residence.optionUnanswered', 'Inte angivet')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tenure === 'bostadsratt' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="prop-brf">{t('rot.tenure.brfName', 'Bostadsrättsförening')}</Label>
                <Input
                  id="prop-brf"
                  value={brfName}
                  placeholder={t('rot.tenure.brfNamePlaceholder', 't.ex. Brf Storgården')}
                  onChange={(e) => setBrfName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="prop-brf-org">{t('rot.tenure.brfOrgNumber', 'Föreningens org.nr')}</Label>
                  <Input
                    id="prop-brf-org"
                    value={brfOrgNumber}
                    placeholder="769612-3456"
                    onChange={(e) => setBrfOrgNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('rot.tenure.brfOrgNumberHint', 'Skatteverket ber om det vid ROT i bostadsrätt. Står i föreningens årsredovisning.')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prop-apartment">{t('rot.tenure.apartmentNumber', 'Lägenhetsnummer')}</Label>
                  <Input
                    id="prop-apartment"
                    value={apartmentNumber}
                    placeholder="1203"
                    onChange={(e) => setApartmentNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('rot.tenure.apartmentNumberHint', 'Vanligen fyra siffror. Står på lägenhetsdörren eller i föreningens papper.')}
                  </p>
                </div>
              </div>
            </>
          )}

          {tenure !== 'bostadsratt' && tenure !== 'hyresratt' && (
            <div className="space-y-2">
              <Label htmlFor="prop-designation">{t('rot.propertyDesignation', 'Fastighetsbeteckning')}</Label>
              <Input
                id="prop-designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('rot.tenure.designationHint', 'Skatteverket ber om den vid ROT på småhus. Står på taxeringsbeslutet eller under Fastigheter på Mina sidor.')}
              </p>
            </div>
          )}

          {tenure === 'hyresratt' && (
            <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              {t('rot.tenure.rentalNotice', 'Skatteverket kräver att man äger bostaden för ROT-avdrag, så det gäller inte en hyresrätt. Övriga kostnader räknas som vanligt.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Avbryt')}
          </Button>
          <Button onClick={handleSave} disabled={saving || (!name.trim() && !address.trim())}>
            {saving ? t('common.saving', 'Sparar…') : t('common.save', 'Spara')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

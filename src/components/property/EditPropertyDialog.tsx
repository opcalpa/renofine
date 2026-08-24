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
import { useToast } from '@/hooks/use-toast';
import { updateProperty, type PropertyRow } from '@/services/propertyService';

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
    });
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
      <DialogContent size="lg">
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
            <Label htmlFor="prop-designation">{t('rot.propertyDesignation', 'Fastighetsbeteckning')}</Label>
            <Input
              id="prop-designation"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
            />
          </div>
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

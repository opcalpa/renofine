/**
 * RoomPickerDialog - Dialog for selecting a room to view in elevation mode
 *
 * Shows all rooms with their colors and names.
 * Optionally highlights suggested rooms (e.g., rooms adjacent to a selected wall).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FloorMapShape } from './types';
import { Home } from 'lucide-react';

interface RoomPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: FloorMapShape[];
  /** Room IDs to highlight as suggested (e.g., adjacent to selected wall) */
  suggestedRoomIds?: string[];
  onSelectRoom: (room: FloorMapShape) => void;
}

export const RoomPickerDialog: React.FC<RoomPickerDialogProps> = ({
  open,
  onOpenChange,
  rooms,
  suggestedRoomIds = [],
  onSelectRoom,
}) => {
  const { t } = useTranslation();

  // Sort rooms: suggested first, then alphabetically
  const sortedRooms = [...rooms].sort((a, b) => {
    const aIsSuggested = suggestedRoomIds.includes(a.id);
    const bIsSuggested = suggestedRoomIds.includes(b.id);
    if (aIsSuggested && !bIsSuggested) return -1;
    if (!aIsSuggested && bIsSuggested) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            {t('elevation.selectRoom', 'Välj rum för väggvy')}
          </DialogTitle>
          <DialogDescription>
            {t('elevation.selectRoomDescription', 'Välj vilket rum du vill se väggvy för')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-4 max-h-[400px] overflow-y-auto">
          {sortedRooms.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t('elevation.noRoomsFound', 'Inga rum hittades. Rita rum i planlösningen först.')}
            </p>
          ) : (
            sortedRooms.map((room) => {
              const isSuggested = suggestedRoomIds.includes(room.id);
              return (
                <Button
                  key={room.id}
                  variant={isSuggested ? 'default' : 'outline'}
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    // onSelectRoom is the single "picked" signal; the parent closes
                    // the dialog. Calling onOpenChange(false) here too would fire the
                    // parent's cancel path with a stale elevationRoom and bounce back
                    // to the floor view.
                    onSelectRoom(room);
                  }}
                >
                  <span
                    className="w-6 h-6 rounded border-2 border-white shadow-sm flex-shrink-0"
                    style={{ backgroundColor: room.color || 'rgba(59, 130, 246, 0.3)' }}
                  />
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{room.name || t('common.unnamed', 'Namnlöst rum')}</span>
                    {isSuggested && (
                      <span className="text-xs opacity-75">
                        {t('elevation.suggestedRoom', 'Angränsande rum')}
                      </span>
                    )}
                  </span>
                </Button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

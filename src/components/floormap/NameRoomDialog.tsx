import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROOM_PRESETS, presetIconForName, type ProjectRoomOption } from './roomPresets';
import { cn } from '@/lib/utils';

interface NameRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** roomId is set when the user picked an existing project room, so the shape links to it. */
  onConfirm: (roomName: string, color?: string, roomId?: string) => void;
  onCancel: () => void;
  defaultName?: string;
  /** The project's already-created rooms that aren't placed on the plan yet. */
  projectRooms?: ProjectRoomOption[];
}

export const NameRoomDialog: React.FC<NameRoomDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  defaultName = '',
  projectRooms = [],
}) => {
  const { t } = useTranslation();
  const [roomName, setRoomName] = useState(defaultName);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const reset = () => {
    setRoomName('');
    setSelectedPreset(null);
    setSelectedRoomId(null);
  };

  const handleConfirm = () => {
    if (roomName.trim()) {
      const color = selectedRoomId
        ? projectRooms.find(r => r.id === selectedRoomId)?.color
        : ROOM_PRESETS.find(p => p.value === selectedPreset)?.color;
      onConfirm(roomName.trim(), color, selectedRoomId ?? undefined);
      reset();
    }
  };

  const handleCancel = () => {
    onCancel();
    reset();
  };

  const handlePresetClick = (preset: typeof ROOM_PRESETS[0]) => {
    setSelectedPreset(preset.value);
    setSelectedRoomId(null);
    setRoomName(t(preset.labelKey, preset.defaultName));
  };

  const handleProjectRoomClick = (room: ProjectRoomOption) => {
    setSelectedRoomId(room.id);
    setSelectedPreset(null);
    setRoomName(room.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && roomName.trim()) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const hasProjectRooms = projectRooms.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('nameRoomDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('nameRoomDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Project rooms — steer the user to the rooms they already created. */}
          {hasProjectRooms && (
            <div className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('nameRoomDialog.yourRooms', 'Projektets rum')}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {projectRooms.map((room) => {
                  const Icon = presetIconForName(room.name);
                  const isActive = selectedRoomId === room.id;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => handleProjectRoomClick(room)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-colors",
                        isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{room.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Default room type presets (fallback / new room types) */}
          <div className="grid gap-2">
            {hasProjectRooms && (
              <span className="text-xs font-medium text-muted-foreground">
                {t('nameRoomDialog.commonRooms', 'Vanliga rum')}
              </span>
            )}
            <div className="grid grid-cols-3 gap-2">
              {ROOM_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const isActive = selectedPreset === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t(preset.labelKey, preset.defaultName)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom name input */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="room-name" className="text-right">
              {t('common.name')}
            </Label>
            <Input
              id="room-name"
              value={roomName}
              onChange={(e) => {
                setRoomName(e.target.value);
                setSelectedPreset(null);
                setSelectedRoomId(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('nameRoomDialog.placeholder')}
              className="col-span-3"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            onClick={handleConfirm}
            disabled={!roomName.trim()}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

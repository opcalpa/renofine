import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, Image as ImageIcon, XCircle, Link as LinkIcon, Plus, Maximize2, Camera, Palette } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PinterestBoardEmbed, parsePinterestBoardUrl } from "@/components/pinterest";
import { fetchPinterestPin, parsePinterestPinUrl } from "@/services/pinterestOEmbed";
import { PhotoCarousel } from "@/components/ui/photo-carousel";
import { compressImage } from "@/lib/compressImage";
import { useTranslation } from "react-i18next";
import type { Photo } from "./types";

// Pinterest Logo SVG
const PinterestLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
  </svg>
);

interface PhotoSectionProps {
  roomId: string;
  showPinterest?: boolean;
}

export function PhotoSection({ roomId, showPinterest = false }: PhotoSectionProps) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pinterestDialogOpen, setPinterestDialogOpen] = useState(false);
  const [pinterestUrlInput, setPinterestUrlInput] = useState("");
  const [pinterestUrlError, setPinterestUrlError] = useState<string | null>(null);
  const [pinterestBoardUrl, setPinterestBoardUrl] = useState<string | null>(null);
  const [savingPinterest, setSavingPinterest] = useState(false);

  // Pin import state
  const [pinImportDialogOpen, setPinImportDialogOpen] = useState(false);
  const [pinUrlInput, setPinUrlInput] = useState("");
  const [pinUrlError, setPinUrlError] = useState<string | null>(null);
  const [importingPin, setImportingPin] = useState(false);

  // Carousel state
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const { data, error } = await supabase
        .from("photos")
        .select("*")
        .eq("linked_to_type", "room")
        .eq("linked_to_id", roomId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPhotos((data as Photo[]) || []);
    } catch (error) {
      console.error("Error loading photos:", error);
      toast.error(t('rooms.couldNotLoadPhotos', 'Could not load photos'));
    } finally {
      setLoadingPhotos(false);
    }
  }, [roomId]);

  const loadPinterestBoardUrl = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("pinterest_board_url")
        .eq("id", roomId)
        .single();

      if (error) throw error;
      setPinterestBoardUrl(data?.pinterest_board_url || null);
    } catch (error) {
      console.error("Error loading Pinterest board URL:", error);
    }
  }, [roomId]);

  useEffect(() => {
    loadPhotos();
    loadPinterestBoardUrl();
  }, [loadPhotos, loadPinterestBoardUrl]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t('rooms.mustBeLoggedInToUpload', 'You must be logged in to upload photos'));
        return;
      }

      // Get profile ID (foreign key requires profile.id, not auth.uid)
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        toast.error(t('rooms.profileNotFound', 'Profile not found'));
        return;
      }

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(t('rooms.notAnImage', '{{name}} is not an image', { name: file.name }));
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          toast.error(t('rooms.fileTooLarge', '{{name}} is too large (max 10MB)', { name: file.name }));
          continue;
        }

        // Compress image before upload
        const uploadFile = await compressImage(file);

        const fileExt = uploadFile.type === "image/jpeg" ? "jpg" : file.name.split(".").pop();
        const fileName = `${roomId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("project-files")
          .upload(fileName, uploadFile);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(t('rooms.couldNotUpload', 'Could not upload {{name}}', { name: file.name }));
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("project-files").getPublicUrl(fileName);

        const { error: dbError } = await supabase.from("photos").insert({
          linked_to_type: "room",
          linked_to_id: roomId,
          url: publicUrl,
          caption: file.name,
          uploaded_by_user_id: profile.id,
        });

        if (dbError) {
          console.error("Database error:", dbError);
          toast.error(t('rooms.couldNotSave', 'Could not save {{name}}', { name: file.name }));
          continue;
        }
      }

      toast.success(t('rooms.photosUploaded', 'Photos uploaded!'));
      loadPhotos();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error(t('rooms.couldNotUploadPhotos', 'Could not upload photos'));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDeletePhoto = async (photoId: string, photoUrl: string) => {
    if (!confirm(t('rooms.confirmDeletePhoto', 'Are you sure you want to delete this photo?'))) return;

    try {
      const urlParts = photoUrl.split("/project-files/");
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        const { error: storageError } = await supabase.storage
          .from("project-files")
          .remove([filePath]);

        if (storageError) {
          console.warn("Could not delete from storage:", storageError);
        }
      }

      const { error: dbError } = await supabase
        .from("photos")
        .delete()
        .eq("id", photoId);

      if (dbError) throw dbError;

      toast.success(t('rooms.photoDeleted', 'Photo deleted'));
      loadPhotos();
    } catch (error) {
      console.error("Error deleting photo:", error);
      toast.error(t('rooms.couldNotDeletePhoto', 'Could not delete photo'));
    }
  };

  const handleAddPinterestBoard = () => {
    setPinterestUrlInput(pinterestBoardUrl || "");
    setPinterestUrlError(null);
    setPinterestDialogOpen(true);
  };

  const savePinterestBoardToDb = async (url: string | null) => {
    setSavingPinterest(true);
    try {
      const { error } = await supabase
        .from("rooms")
        .update({ pinterest_board_url: url })
        .eq("id", roomId);

      if (error) throw error;

      setPinterestBoardUrl(url);
      return true;
    } catch (error) {
      console.error("Error saving Pinterest board URL:", error);
      toast.error(t('rooms.couldNotSavePinterestBoard', 'Could not save Pinterest board'));
      return false;
    } finally {
      setSavingPinterest(false);
    }
  };

  const handleSavePinterestBoard = async () => {
    const url = pinterestUrlInput.trim();

    if (!url) {
      // Allow clearing the URL
      const success = await savePinterestBoardToDb(null);
      if (success) {
        setPinterestDialogOpen(false);
        toast.success(t('rooms.pinterestBoardRemoved', 'Pinterest board removed'));
      }
      return;
    }

    // Validate URL
    const parsed = parsePinterestBoardUrl(url);
    if (!parsed) {
      setPinterestUrlError(t('rooms.invalidPinterestBoardUrl', 'Invalid Pinterest board URL. Use format: pinterest.com/user/board-name'));
      return;
    }

    const success = await savePinterestBoardToDb(url);
    if (success) {
      setPinterestDialogOpen(false);
      toast.success(t('rooms.pinterestBoardAdded', 'Pinterest board added!'));
    }
  };

  const handleRemovePinterestBoard = async () => {
    if (confirm(t('rooms.confirmRemovePinterestBoard', 'Are you sure you want to remove Pinterest board?'))) {
      const success = await savePinterestBoardToDb(null);
      if (success) {
        toast.success(t('rooms.pinterestBoardRemoved', 'Pinterest board removed'));
      }
    }
  };

  // Pin import handlers
  const handleOpenPinImport = () => {
    setPinUrlInput("");
    setPinUrlError(null);
    setPinImportDialogOpen(true);
  };

  const handleImportPin = async () => {
    const url = pinUrlInput.trim();

    if (!url) {
      setPinUrlError(t('rooms.enterPinterestPinUrl', 'Enter a Pinterest pin URL'));
      return;
    }

    // Validate URL format first
    if (!parsePinterestPinUrl(url)) {
      setPinUrlError(t('rooms.invalidPinterestPinUrl', 'Invalid Pinterest pin URL. Use format: pinterest.com/pin/123456789/'));
      return;
    }

    setImportingPin(true);
    setPinUrlError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t('rooms.mustBeLoggedIn', 'You must be logged in'));
        return;
      }

      // Get profile ID (foreign key requires profile.id, not auth.uid)
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        toast.error(t('rooms.profileNotFound', 'Profile not found'));
        return;
      }

      // Fetch pin data via oEmbed
      const pinData = await fetchPinterestPin(url);

      // Save to database
      const { error } = await supabase.from("photos").insert({
        linked_to_type: "room",
        linked_to_id: roomId,
        url: pinData.imageUrl,
        caption: pinData.title,
        uploaded_by_user_id: profile.id,
        source: "pinterest",
        source_url: pinData.sourceUrl,
        pinterest_pin_id: pinData.pinId,
      });

      if (error) throw error;

      toast.success(t('rooms.pinImported', 'Pin imported!'));
      setPinImportDialogOpen(false);
      loadPhotos();
    } catch (error) {
      console.error("Error importing pin:", error);
      if (error instanceof Error) {
        setPinUrlError(error.message);
      } else {
        toast.error(t('rooms.couldNotImportPin', 'Could not import pin'));
      }
    } finally {
      setImportingPin(false);
    }
  };

  // Carousel handlers
  const openCarousel = (index: number) => {
    setCarouselIndex(index);
    setCarouselOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* Add photo — single button with dropdown */}
      <input
        type="file"
        id="photo-camera"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploading}
      />
      <input
        type="file"
        id="photo-upload"
        accept="image/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploading}
      />
      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {uploading ? t('rooms.uploading', 'Laddar upp...') : t('rooms.addPhoto', 'Lägg till foto')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => document.getElementById("photo-camera")?.click()}>
              <Camera className="h-4 w-4 mr-2" />
              {t('rooms.takePhoto', 'Ta foto')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => document.getElementById("photo-upload")?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {t('rooms.uploadFile', 'Välj fil')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Pinterest — only for homeowners */}
        {showPinterest && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 border-[#E60023]/30 text-[#E60023] hover:bg-[#E60023]/5 hover:border-[#E60023]"
              >
                <PinterestLogo className="h-4 w-4" />
                Pinterest
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleOpenPinImport}>
                <PinterestLogo className="h-4 w-4 mr-2" />
                {t('rooms.importPin', 'Importera pin')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddPinterestBoard}>
                <Plus className="h-4 w-4 mr-2" />
                {pinterestBoardUrl ? t('rooms.changeBoard', 'Byt board') : t('rooms.linkBoard', 'Länka board')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Pinterest Pin Import Dialog */}
      <Dialog open={pinImportDialogOpen} onOpenChange={setPinImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PinterestLogo className="h-5 w-5 text-[#E60023]" />
              {t('rooms.importPinterestPin', 'Import Pinterest Pin')}
            </DialogTitle>
            <DialogDescription>
              {t('rooms.pastePinterestPinLink', 'Paste the link to a Pinterest pin to import the image to this room.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pin-url">Pin URL</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="pin-url"
                  placeholder="pinterest.com/pin/123456789/"
                  value={pinUrlInput}
                  onChange={(e) => {
                    setPinUrlInput(e.target.value);
                    setPinUrlError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !importingPin) {
                      handleImportPin();
                    }
                  }}
                  className="pl-9"
                  disabled={importingPin}
                />
              </div>
              {pinUrlError && (
                <p className="text-sm text-red-500">{pinUrlError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('rooms.openPinAndCopyUrl', 'Open a pin on Pinterest and copy the URL from the browser.')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinImportDialogOpen(false)} disabled={importingPin}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleImportPin} disabled={importingPin}>
              {importingPin ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('rooms.importing', 'Importing...')}
                </>
              ) : (
                t('rooms.import', 'Import')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pinterest Board URL Dialog */}
      <Dialog open={pinterestDialogOpen} onOpenChange={setPinterestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PinterestLogo className="h-5 w-5 text-[#E60023]" />
              {t('rooms.pinterestInspirationBoard', 'Pinterest Inspiration Board')}
            </DialogTitle>
            <DialogDescription>
              {t('rooms.pastePinterestBoardLink', 'Paste the link to your Pinterest board to display it as inspiration for this room.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pinterest-url">Board URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="pinterest-url"
                    placeholder="pinterest.com/user/board-name"
                    value={pinterestUrlInput}
                    onChange={(e) => {
                      setPinterestUrlInput(e.target.value);
                      setPinterestUrlError(null);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>
              {pinterestUrlError && (
                <p className="text-sm text-red-500">{pinterestUrlError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('rooms.openBoardAndCopyUrl', 'Open your Pinterest board and copy the URL from the browser.')}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {pinterestBoardUrl && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPinterestUrlInput("");
                  handleSavePinterestBoard();
                }}
                disabled={savingPinterest}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {t('rooms.removeBoard', 'Remove board')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setPinterestDialogOpen(false)} disabled={savingPinterest}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSavePinterestBoard} disabled={savingPinterest}>
              {savingPinterest ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.saving', 'Saving...')}
                </>
              ) : (
                t('common.save')

              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photos Grid (imported pins + uploads) */}
      {loadingPhotos ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : photos.length > 0 ? (
        <ScrollArea className="h-48">
          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="relative group cursor-pointer"
                onClick={() => openCarousel(index)}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || t('rooms.roomPhoto', 'Room photo')}
                  className="w-full h-32 object-cover rounded-lg border border-gray-200 transition-all group-hover:brightness-90"
                />
                {/* Expand icon overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/50 rounded-full p-2">
                    <Maximize2 className="h-5 w-5 text-white" />
                  </div>
                </div>
                {/* Pinterest badge */}
                {photo.source === 'pinterest' && (
                  <div
                    className="absolute top-2 left-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm"
                    title={t('rooms.importedFromPinterest', 'Imported from Pinterest')}
                  >
                    <PinterestLogo className="h-3.5 w-3.5 text-[#E60023]" />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePhoto(photo.id, photo.url);
                  }}
                  className="
                    absolute top-2 right-2
                    opacity-0 group-hover:opacity-100
                    transition-opacity
                    bg-red-500 hover:bg-red-600
                    text-white rounded-full p-1.5
                    z-10
                  "
                  title={t('rooms.deletePhoto', 'Delete photo')}
                >
                  <XCircle className="h-4 w-4" />
                </button>
                {photo.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 rounded-b-lg truncate">
                    {photo.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-6 text-gray-400 text-sm">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{t('rooms.noPhotosUploaded', 'Inga foton uppladdade än')}</p>
        </div>
      )}

      {/* Moodboard link */}
      {photos.length > 0 && (
        <MoodboardLink roomId={roomId} />
      )}

      {/* Pinterest Board Embed - Only for homeowners */}
      {showPinterest && pinterestBoardUrl && (
        <PinterestBoardEmbed
          boardUrl={pinterestBoardUrl}
          onRemove={handleRemovePinterestBoard}
          editable={true}
        />
      )}

      {/* Photo Carousel/Lightbox */}
      <PhotoCarousel
        photos={photos}
        initialIndex={carouselIndex}
        open={carouselOpen}
        onOpenChange={setCarouselOpen}
      />
    </div>
  );
}

/** Small link that navigates to Overview moodboard filtered to this room */
function MoodboardLink({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1"
      onClick={() => {
        // Persist moodboard view + room filter via localStorage (read by InspirationSection)
        localStorage.setItem("inspo-view-mode", JSON.stringify("moodboard"));
        localStorage.setItem("inspo-room-filter", JSON.stringify(roomId));
        // Navigate to overview tab
        setSearchParams({ tab: "overview" });
      }}
    >
      <Palette className="h-3 w-3" />
      {t("rooms.viewMoodboard", "Visa i moodboard →")}
    </button>
  );
}

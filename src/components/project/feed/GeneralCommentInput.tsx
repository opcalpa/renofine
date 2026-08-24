import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Camera, X } from "lucide-react";
import { MentionTextarea } from "./MentionTextarea";
import { parseMentions } from "./utils";
import { compressImage } from "@/lib/compressImage";

interface GeneralCommentInputProps {
  projectId: string;
  onPosted: () => void;
}

export const GeneralCommentInput = ({ projectId, onPosted }: GeneralCommentInputProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        const result = await compressImage(file);
        const compressed = result instanceof File
          ? result
          : new File([result], file.name, { type: "image/jpeg", lastModified: Date.now() });
        newFiles.push(compressed);
        newPreviews.push(URL.createObjectURL(compressed));
      }
    }
    setSelectedImages((prev) => [...prev, ...newFiles]);
    setImagePreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async () => {
    const uploaded: { id: string; url: string; filename: string }[] = [];
    for (const image of selectedImages) {
      const compressed = await compressImage(image);
      const fileName = `${Date.now()}-${image.name}`;
      const filePath = `comment-images/${fileName}`;
      const { error } = await supabase.storage.from("project-files").upload(filePath, compressed);
      if (error) { console.error("Upload error:", error); continue; }
      uploaded.push({ id: Date.now().toString(), url: filePath, filename: image.name });
    }
    return uploaded;
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      if (!profile) throw new Error("Profile not found");

      let uploadedImages: { id: string; url: string; filename: string }[] = [];
      if (selectedImages.length > 0) uploadedImages = await uploadImages();

      const trimmedContent = content.trim();
      const { data: commentData, error } = await supabase.from("comments").insert({
        content: trimmedContent,
        created_by_user_id: profile.id,
        project_id: projectId,
        images: uploadedImages.length > 0 ? uploadedImages : null,
      }).select("id").single();
      if (error) throw error;

      const mentions = parseMentions(trimmedContent);
      if (mentions.length > 0 && commentData) {
        await supabase.from("comment_mentions").insert(
          mentions.map((m) => ({ comment_id: commentData.id, mentioned_user_id: m.profileId }))
        );
      }

      setContent("");
      imagePreviews.forEach((p) => URL.revokeObjectURL(p));
      setSelectedImages([]);
      setImagePreviews([]);
      onPosted();

      toast({ title: t("comments.commentPosted"), description: t("comments.commentPostedDescription") });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("comments.postError");
      toast({ title: t("errors.generic"), description: message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="sticky bottom-0 bg-background border-t p-4 space-y-2">
      <MentionTextarea
        projectId={projectId}
        placeholder={t("feed.generalCommentPlaceholder")}
        value={content}
        onChange={setContent}
        className="min-h-16 resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePost(); }
        }}
      />
      {imagePreviews.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-md">
          {imagePreviews.map((preview, index) => (
            <div key={index} className="relative group">
              <img src={preview} alt={`Preview ${index + 1}`} className="w-16 h-16 object-cover rounded border" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
          <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="h-7 px-2 text-xs">
            <Camera className="h-3 w-3 mr-1" />
            {t("comments.addImage")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("comments.cmdEnterToPost")}</span>
        </div>
        <Button onClick={handlePost} disabled={posting || !content.trim()} size="sm">
          {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          {t("feed.postGeneral")}
        </Button>
      </div>
    </div>
  );
};

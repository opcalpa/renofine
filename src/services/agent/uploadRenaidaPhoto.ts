import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";

/**
 * A scene photo Renaida captured that is NOT a document (receipt/invoice/quote).
 * "progress" = utfört arbete, "inspiration" = önskat material / förebild.
 */
export type RenaidaPhotoKind = "progress" | "inspiration";

/**
 * Attach a scene photo to the project so it surfaces in the Bilder gallery.
 * Mirrors the inspiration upload path (bucket `project-files`, a `photos` row
 * with `linked_to_type: "project"` — which RecentPhotos queries on).
 */
export async function uploadRenaidaPhoto(
  file: File,
  projectId: string,
  profileId: string,
  kind: RenaidaPhotoKind,
): Promise<boolean> {
  try {
    const uploadFile = await compressImage(file);
    const isCompressed = uploadFile !== file;
    const ext = isCompressed ? "jpg" : (file.name.split(".").pop() || "jpg");
    const folder = kind === "inspiration" ? "inspiration" : "progress";
    const path = `projects/${projectId}/${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("project-files")
      .upload(path, uploadFile, { contentType: isCompressed ? "image/jpeg" : file.type });
    if (upErr) { console.error("Renaida photo upload failed:", upErr); return false; }

    const { error: dbErr } = await supabase.from("photos").insert({
      linked_to_type: "project",
      linked_to_id: projectId,
      // Store the storage path; readers sign it on demand.
      url: path,
      caption: null,
      uploaded_by_user_id: profileId,
      // "upload" is the inspiration convention; "progress" tags done-work photos.
      // kind = innehåll, source = proveniens. Den gamla strängen "progress"
      // kändes inte igen av någon läsare — bilden föll ner i inspirationsvyn.
      kind: kind === "inspiration" ? "inspiration" : "during",
      source: "renaida",
    });
    if (dbErr) { console.error("Renaida photo insert failed:", dbErr); return false; }
    return true;
  } catch (e) {
    console.error("Renaida photo upload error:", e);
    return false;
  }
}

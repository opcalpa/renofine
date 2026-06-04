const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type WorkerPhotoCategory = "progress" | "completed";

export interface UploadWorkerPhotoArgs {
  token: string;
  file: Blob;
  taskId?: string;
  roomId?: string;
  category?: WorkerPhotoCategory;
  /** Optional worker-reported progress 0-100; applied to the task(s) server-side. */
  progress?: number;
}

export interface UploadWorkerPhotoResult {
  photo: { id: string; url: string; caption: string | null };
}

export async function uploadWorkerPhoto({
  token,
  file,
  taskId,
  roomId,
  category,
  progress,
}: UploadWorkerPhotoArgs): Promise<UploadWorkerPhotoResult> {
  const formData = new FormData();
  formData.append("token", token);
  if (taskId) formData.append("taskId", taskId);
  if (roomId) formData.append("roomId", roomId);
  if (category) formData.append("category", category);
  if (progress != null) formData.append("progress", String(progress));
  const filename =
    "name" in file && typeof (file as File).name === "string"
      ? (file as File).name
      : `worker-${Date.now()}.jpg`;
  formData.append("file", file, filename);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-upload-photo`, {
    method: "POST",
    body: formData,
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`worker-upload-photo: ${res.status}`);
  return res.json();
}

export async function compressImage(
  file: File,
  maxSize = 1200,
  quality = 0.8,
): Promise<Blob> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

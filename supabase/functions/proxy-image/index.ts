import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5002',
  'http://localhost:3000',
  'https://app.renofine.com',
  'https://renofine.com',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const { imageUrl, projectId, filename } = await req.json();

    if (!imageUrl || !projectId) {
      return new Response(
        JSON.stringify({ error: "imageUrl and projectId are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Try different image URL sizes (Pinterest blocks /originals/ but allows /736x/)
    const urlsToTry = [imageUrl];
    if (imageUrl.includes("/originals/")) {
      urlsToTry.push(imageUrl.replace("/originals/", "/736x/"));
      urlsToTry.push(imageUrl.replace("/originals/", "/474x/"));
    }

    let imgResponse: Response | null = null;
    for (const tryUrl of urlsToTry) {
      const res = await fetch(tryUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.pinterest.com/",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site",
        },
        redirect: "follow",
      });
      if (res.ok) {
        imgResponse = res;
        break;
      }
    }

    if (!imgResponse || !imgResponse.ok) {

      return new Response(
        JSON.stringify({ error: "Failed to download image from all URL variants" }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const arrayBuffer = await imgResponse.arrayBuffer();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const safeName = filename || `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const filePath = `projects/${projectId}/inspiration/${safeName}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("project-files")
      .upload(filePath, arrayBuffer, { contentType });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("project-files")
      .getPublicUrl(filePath);

    return new Response(
      JSON.stringify({ storageUrl: urlData.publicUrl }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Proxy failed" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

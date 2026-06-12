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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  // Auth check
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const { pinUrl, projectId } = await req.json();

    if (!pinUrl) {
      return new Response(
        JSON.stringify({ error: "pinUrl is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Validate it's a Pinterest URL
    if (!pinUrl.includes("pinterest")) {
      return new Response(
        JSON.stringify({ error: "Invalid Pinterest URL" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Fetch from Pinterest oEmbed
    const oEmbedUrl = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pinUrl)}`;

    const response = await fetch(oEmbedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Renofine/1.0)",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return new Response(
          JSON.stringify({ error: "Pin not found" }),
          { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Pinterest API error: ${response.status}`);
    }

    const data = await response.json();

    // Get largest possible image URL
    // Pinterest sizes: 236x, 474x, 736x, originals
    let imageUrl = data.thumbnail_url || "";
    if (imageUrl.includes("/236x/")) {
      imageUrl = imageUrl.replace("/236x/", "/originals/");
    } else if (imageUrl.includes("/474x/")) {
      imageUrl = imageUrl.replace("/474x/", "/originals/");
    } else if (imageUrl.includes("/736x/")) {
      imageUrl = imageUrl.replace("/736x/", "/originals/");
    }

    // Extract pin ID from URL
    const pinIdMatch = pinUrl.match(/\/pin\/(\d+)/);
    const pinId = pinIdMatch ? pinIdMatch[1] : data.pin_id || "";

    // Download image server-side and upload to Supabase Storage to avoid CORS
    let storageUrl: string | null = null;
    if (imageUrl && projectId) {
      try {
        const imgResponse = await fetch(imageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Renofine/1.0)" },
        });
        if (imgResponse.ok) {
          const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const arrayBuffer = await imgResponse.arrayBuffer();

          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

          const filePath = `projects/${projectId}/Uppladdade filer/${Date.now()}-pin-${pinId}.${ext}`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from("project-files")
            .upload(filePath, arrayBuffer, { contentType });

          if (!uploadError) {
            const { data: urlData } = supabaseAdmin.storage
              .from("project-files")
              .getPublicUrl(filePath);
            storageUrl = urlData.publicUrl;
          } else {
            console.error("Storage upload error:", uploadError);
          }
        }
      } catch (imgErr) {
        console.error("Failed to proxy image to storage:", imgErr);
      }
    }

    const result = {
      pinId,
      title: data.title || "Pinterest pin",
      imageUrl,
      storageUrl,
      authorName: data.author_name || "",
      authorUrl: data.author_url || "",
      sourceUrl: pinUrl,
      width: data.width || data.thumbnail_width || 0,
      height: data.height || data.thumbnail_height || 0,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch pin data" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

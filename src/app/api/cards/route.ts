import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 2_000_000;
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return json({ error: "Sign in to view cards." }, 401);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("cards")
      .select("id, name, rarity, image_url, stats, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return json({ error: "Could not load cards." }, 503);
    }

    return json({ cards: data ?? [] });
  } catch {
    return json({ error: "Could not load cards." }, 503);
  }
}

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return json({ error: "Sign in to create cards." }, 401);
  }

  try {
    const form = await request.formData();
    const name = form.get("name");
    const rarity = form.get("rarity");
    const stats = form.get("stats");
    const file = form.get("image");

    if (typeof name !== "string" || !name.trim()) {
      return json({ error: "Card name is required." }, 400);
    }
    if (typeof rarity !== "string" || !["common", "uncommon", "rare", "epic", "legendary"].includes(rarity)) {
      return json({ error: "Invalid rarity. Must be: common, uncommon, rare, epic, or legendary." }, 400);
    }

    let parsedStats: Record<string, unknown> = {};
    if (typeof stats === "string") {
      try {
        parsedStats = JSON.parse(stats);
        if (typeof parsedStats !== "object" || parsedStats === null || Array.isArray(parsedStats)) {
          return json({ error: "Stats must be a JSON object." }, 400);
        }
      } catch {
        return json({ error: "Invalid stats JSON." }, 400);
      }
    }

    if (!(file instanceof File) || file.size === 0) {
      return json({ error: "Card image is required." }, 400);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return json({ error: "Keep card images under 2 MB." }, 413);
    }

    const mime = file.type.toLowerCase();
    const allowed = ALLOWED_MIME[mime];
    if (!allowed) {
      return json({ error: "Unsupported image format. Use PNG, JPEG, or WebP." }, 415);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Basic signature check
    const sig = new Uint8Array(bytes.slice(0, 12));
    let valid = false;
    if (mime === "image/png" && sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) valid = true;
    if (mime === "image/jpeg" && sig[0] === 0xff && sig[1] === 0xd8) valid = true;
    if (mime === "image/webp" && sig[8] === 0x57 && sig[9] === 0x45 && sig[10] === 0x42 && sig[11] === 0x50) valid = true;
    if (!valid) {
      return json({ error: "Invalid image file." }, 415);
    }

    const admin = createAdminClient();
    const path = `cards/${user.id}/${crypto.randomUUID()}.${allowed}`;

    const { error: uploadError } = await admin.storage
      .from("donation-photos")
      .upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      return json({ error: "Could not store card image." }, 503);
    }

    const { data: publicUrlData } = admin.storage.from("donation-photos").getPublicUrl(path);
    const imageUrl = publicUrlData.publicUrl;

    const { data: card, error: insertError } = await admin
      .from("cards")
      .insert({
        user_id: user.id,
        name: name.trim(),
        rarity,
        image_url: imageUrl,
        stats: parsedStats,
      })
      .select("id, name, rarity, image_url, stats, created_at")
      .single();

    if (insertError) {
      // Cleanup uploaded image on insert failure
      await admin.storage.from("donation-photos").remove([path]);
      return json({ error: "Could not create card." }, 503);
    }

    return json({ card }, 201);
  } catch {
    return json({ error: "Could not create card." }, 503);
  }
}

import { getStore } from "@netlify/blobs";

// One endpoint, several independent slots — each stored under its own key so
// they can NEVER overwrite each other:
//
//   /tour                  -> published itinerary       (key "current")
//   /tour?type=alerts      -> alerts list               (key "alerts")
//   /tour?type=checkins    -> check-in register         (key "checkins")
//   /tour?type=votes       -> Players' Player votes      (key "votes")
//   /tour?type=preorders   -> meal pre-orders            (key "preorders")
//   /tour?type=feedback    -> app feedback for staff      (key "feedback")
//
//   GET  -> returns whatever is stored for that slot, with a sensible empty
//           default if nothing is there yet (null for the tour, [] for alerts,
//           {} for everything else). It never hands back the wrong shape — this
//           is what fixes the "[object Object] / dates" vote results.
//   POST -> saves the body. The itinerary and alerts are replaced wholesale;
//           votes, pre-orders and check-ins are MERGED by their top-level keys
//           so two phones submitting at the same moment can't wipe each other.

const MERGE = new Set(["checkins", "votes", "preorders", "lineups", "feedback"]);

export default async (req) => {
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS, DELETE",
    "access-control-allow-headers": "content-type",
  };

  if (req.method === "OPTIONS") return new Response("", { headers });

  // STRONG consistency: every read returns the most recent write, in every region.
  // Without this, Netlify Blobs is eventually-consistent — a publish succeeds but a
  // read from another region can keep returning an older copy, which is what made the
  // app (and admin on reload) "revert" to a previously-published dataset.
  // Same store name as before, so all existing data is preserved.
  const store = getStore({ name: "parkside-tour", consistency: "strong" });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "";
  const key = type ? type : "current";            // "current" = the published itinerary

  // DELETE: wipe a test-data slot back to empty so a tour can be re-tested from scratch.
  // Restricted to the submission slots so a stray/hostile call can NEVER clear the published tour.
  if (req.method === "DELETE") {
    // Feedback can be removed one entry at a time (?id=...) or cleared wholesale.
    if (type === "feedback") {
      const id = url.searchParams.get("id");
      if (id) {
        let cur = {};
        try { cur = JSON.parse((await store.get(key)) || "{}"); } catch { cur = {}; }
        if (!cur || typeof cur !== "object" || Array.isArray(cur)) cur = {};
        delete cur[id];
        await store.set(key, JSON.stringify(cur));
        return reply(headers, 200, { ok: true, deleted: id });
      }
      await store.set(key, "{}");
      return reply(headers, 200, { ok: true, cleared: key });
    }
    const RESETTABLE = new Set(["votes", "preorders", "checkins"]);
    if (!RESETTABLE.has(type)) return reply(headers, 400, { ok: false, error: "refused: that slot can't be cleared" });
    await store.set(key, "{}");
    return reply(headers, 200, { ok: true, cleared: key });
  }

  if (req.method === "POST") {
    const text = await req.text();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return reply(headers, 400, { ok: false, error: "invalid JSON" }); }

    // --- Itinerary: must look like a real tour object, never an array/empty blob. ---
    if (!type) {
      const looksLikeTour =
        parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.events);
      if (!looksLikeTour) return reply(headers, 400, { ok: false, error: "refused: not a tour object" });
      await store.set(key, text);
      return reply(headers, 200, { ok: true });
    }

    // --- Alerts: must be an array. Replaced wholesale. ---
    if (type === "alerts") {
      if (!Array.isArray(parsed)) return reply(headers, 400, { ok: false, error: "refused: alerts must be a list" });
      await store.set(key, text);
      return reply(headers, 200, { ok: true });
    }

    // --- checkins / votes / preorders (and any future object slot): must be an object. ---
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reply(headers, 400, { ok: false, error: "refused: expected an object" });
    }

    if (MERGE.has(type)) {
      // Merge this submission into whatever is already stored, by top-level key
      // (the per-device id for votes/pre-orders). Keeps everyone else's entries,
      // so concurrent submissions don't clobber each other.
      let cur = {};
      try { cur = JSON.parse((await store.get(key)) || "{}"); } catch { cur = {}; }
      if (!cur || typeof cur !== "object" || Array.isArray(cur)) cur = {};
      for (const k of Object.keys(parsed)) cur[k] = parsed[k];
      await store.set(key, JSON.stringify(cur));
    } else {
      await store.set(key, text);
    }
    return reply(headers, 200, { ok: true });
  }

  // --- GET ---
  const data = await store.get(key);
  if (data != null) return new Response(data, { headers });
  const empty = !type ? "null" : (type === "alerts" ? "[]" : "{}");
  return new Response(empty, { headers });
};

function reply(headers, status, obj) {
  return new Response(JSON.stringify(obj), { status, headers });
}

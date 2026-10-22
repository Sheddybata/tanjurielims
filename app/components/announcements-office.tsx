"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ListLoader } from "@/app/components/list-loader";

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

export function AnnouncementsOffice() {
  const [rows, setRows] = useState<any[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("corp");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const headers = await authHeaders();
    const response = await fetch("/api/announcements", { headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load announcements");
    setRows(payload.announcements ?? []);
    setCanWrite(Boolean(payload.canWrite));
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function publish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, audience })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Publish failed");
      setTitle("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="hidden sm:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">People</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Announcements</h2>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {canWrite && (
        <form onSubmit={publish} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5">
          <input className="form-control" placeholder="Title" required value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea className="form-control min-h-28" placeholder="Notice" required value={body} onChange={(event) => setBody(event.target.value)} />
          <select className="form-control max-w-xs" value={audience} onChange={(event) => setAudience(event.target.value)}>
            <option value="corp">Whole corporation</option>
            <option value="subsidiary">My subsidiary</option>
            <option value="department">My department</option>
          </select>
          <button type="submit" disabled={busy} className="primary-button disabled:opacity-60">
            {busy ? "Publishing..." : "Publish"}
          </button>
        </form>
      )}
      {loading ? (
        <ListLoader label="Loading announcements…" />
      ) : (
        <div className="space-y-3">
          {rows.map((item) => (
            <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-800">{item.audience}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.body}</p>
              <p className="mt-3 text-xs text-slate-500">{new Date(item.created_at).toLocaleString("en-GB")}</p>
            </article>
          ))}
          {!rows.length && <p className="text-sm text-slate-500">No announcements yet.</p>}
        </div>
      )}
    </div>
  );
}

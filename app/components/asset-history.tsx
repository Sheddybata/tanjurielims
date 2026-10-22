"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

export function AssetHistory({ canWrite }: { canWrite: boolean }) {
  const [assetId, setAssetId] = useState("");
  const [log, setLog] = useState<any[]>([]);
  const [asset, setAsset] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ action: "", fault: "", parts: "", cost: "" });

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/assets/history?assetId=${encodeURIComponent(assetId)}`, { headers });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Not found");
      setAsset(payload.asset);
      setLog(payload.log ?? []);
    } catch (err) {
      setAsset(null);
      setLog([]);
      setError(err instanceof Error ? err.message : "Not found");
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/assets/history", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, action: form.action, fault: form.fault, parts: form.parts, cost: form.cost })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save failed");
      setForm({ action: "", fault: "", parts: "", cost: "" });
      const refresh = await fetch(`/api/assets/history?assetId=${encodeURIComponent(assetId)}`, { headers });
      const next = await refresh.json();
      setLog(next.log ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-950">Maintenance history</h3>
      <form onSubmit={lookup} className="flex flex-wrap gap-2">
        <input className="form-control max-w-xs" placeholder="Asset ID" value={assetId} onChange={(event) => setAssetId(event.target.value)} />
        <button type="submit" className="secondary-button">
          Look up
        </button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {asset && (
        <p className="text-sm text-slate-600">
          {asset.asset_id} · {asset.name} · {asset.status}
        </p>
      )}
      {canWrite && asset && (
        <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
          <input className="form-control" placeholder="Action taken" required value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })} />
          <input className="form-control" placeholder="Fault" value={form.fault} onChange={(event) => setForm({ ...form, fault: event.target.value })} />
          <input className="form-control" placeholder="Parts" value={form.parts} onChange={(event) => setForm({ ...form, parts: event.target.value })} />
          <input className="form-control" placeholder="Cost" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} />
          <button type="submit" className="primary-button w-fit">
            Add log entry
          </button>
        </form>
      )}
      {log.length > 0 && (
        <ul className="space-y-2 text-sm text-slate-700">
          {log.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-100 px-3 py-2">
              <span className="font-semibold">{item.work_date}</span> · {item.action}
              {item.fault ? ` · ${item.fault}` : ""}
              {item.profiles?.full_name ? ` · ${item.profiles.full_name}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

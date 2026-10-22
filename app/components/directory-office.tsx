"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ListLoader } from "@/app/components/list-loader";

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

export function DirectoryOffice() {
  const [people, setPeople] = useState<any[]>([]);
  const [scope, setScope] = useState<"department" | "subsidiary" | "all">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const response = await fetch("/api/directory", { headers });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load directory");
        setPeople(payload.people ?? []);
        setScope(payload.scope === "department" || payload.scope === "subsidiary" ? payload.scope : "all");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load directory");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) =>
      [person.fullName, person.jobTitle, person.department, person.subsidiary, person.staffNumber, person.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [people, query]);

  return (
    <div className="space-y-6">
      <div className="hidden sm:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">People</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Directory</h2>
        <p className="mt-2 text-sm text-slate-600">
          {scope === "department"
            ? "Staff in your department only. Bank details and national IDs stay in HR files."
            : scope === "subsidiary"
              ? "Staff in your subsidiary only. Bank details and national IDs stay in HR files."
              : "Verified staff only. Bank details and national IDs stay in HR files."}
        </p>
      </div>
      <input
        className="form-control w-full sm:max-w-md"
        placeholder={scope === "all" ? "Search name, department, Staff ID" : "Search name or Staff ID"}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <ListLoader label="Loading directory…" variant="cards" />}
      {!loading && (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((person) => (
          <article key={person.id} className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              {person.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={person.photoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-sm font-bold text-blue-800">
                  {String(person.fullName ?? "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-950">{person.fullName}</p>
                <p className="text-sm text-slate-600">{person.jobTitle}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {[person.subsidiary, person.department].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{person.staffNumber || "Staff ID pending"}</p>
            {person.phone && (
              <a href={`tel:${String(person.phone).replace(/\s+/g, "")}`} className="mt-2 inline-block text-sm font-semibold text-blue-800">
                {person.phone}
              </a>
            )}
          </article>
        ))}
      </div>
      )}
      {!loading && !filtered.length && !error && <p className="text-sm text-slate-500">No matching staff.</p>}
    </div>
  );
}

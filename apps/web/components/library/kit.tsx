"use client";
// Shared pieces of Training and the Resource Centre.
import { useRef, useState, type ReactNode } from "react";
import { embedUrl, FILE_MAX_BYTES, type LibraryFileDto, type LibraryRightsDto, type LibraryScope, type LibraryUploadTicketDto } from "@daveup/shared";
import { api, ApiError } from "@/lib/api";
import { Segmented } from "@/components/ui";

/** Upload a file for a resource or lesson, reporting progress (0 to 1). */
export async function uploadLibraryFile(file: File, scope: LibraryScope, onProgress: (p: number) => void): Promise<LibraryFileDto> {
  if (file.size > FILE_MAX_BYTES) throw new ApiError(400, "TOO_LARGE", `Files can be up to ${Math.round(FILE_MAX_BYTES / 1024 / 1024)} MB`);
  const ticket = await api<LibraryUploadTicketDto>("/library/uploads", { method: "POST", body: { name: file.name, mime: file.type || "application/octet-stream", size: file.size, scope } });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.uploadUrl);
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    xhr.withCredentials = ticket.uploadUrl.startsWith("/");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, "UPLOAD_FAILED", "The upload failed. Please try again.")));
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", "The upload failed. Check your connection and try again."));
    xhr.send(file);
  });
  return api<LibraryFileDto>(`/library/${ticket.fileId}/complete`, { method: "POST" });
}

export const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Choose a file and upload it straight away. */
export function FilePicker({ scope, value, onChange, accept }: { scope: LibraryScope; value: LibraryFileDto | null; onChange: (f: LibraryFileDto | null) => void; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      onChange(await uploadLibraryFile(file, scope, setProgress));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The upload failed. Please try again.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div>
      <input ref={input} type="file" className="hidden" accept={accept} onChange={(e) => void pick(e.target.files?.[0])} />
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl border border-surface-line bg-surface px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{value.name}</span>
            <span className="text-[13px] text-ink-muted">{sizeLabel(value.size)}</span>
          </span>
          <button type="button" onClick={() => onChange(null)} className="text-[14px] font-semibold text-ink-muted hover:text-danger">
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={progress !== null}
          onClick={() => input.current?.click()}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-surface-line px-4 text-[15px] font-semibold text-ink-muted hover:border-brand-line hover:text-brand disabled:opacity-70"
        >
          {progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : "Choose a file (up to 50 MB)"}
        </button>
      )}
      {error && <p className="mt-2 text-[14px] text-danger">{error}</p>}
    </div>
  );
}

/** Who new content is for, when the person may add both kinds. */
export function ScopePicker({ rights, value, onChange }: { rights: LibraryRightsDto; value: LibraryScope; onChange: (s: LibraryScope) => void }) {
  if (!(rights.daveup && rights.org)) return null;
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[14px] font-semibold text-ink">Who is it for?</p>
      <Segmented<LibraryScope>
        value={value}
        onChange={onChange}
        options={[
          { value: "org", label: rights.orgName ?? "My organization" },
          { value: "daveup", label: "Every organization" },
        ]}
      />
    </div>
  );
}

export const defaultScope = (r: LibraryRightsDto): LibraryScope => (r.org ? "org" : "daveup");

export function ScopeBadge({ scope, orgName }: { scope: LibraryScope; orgName: string | null }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold ${scope === "daveup" ? "bg-brand-soft text-brand" : "bg-ok-soft text-ok"}`}>
      {scope === "daveup" ? "DaveUp" : (orgName ?? "Your organization")}
    </span>
  );
}

/** A YouTube or Vimeo player, or a plain link for any other video site. */
export function VideoEmbed({ url, title }: { url: string; title: string }): ReactNode {
  const src = embedUrl(url);
  if (!src) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex aspect-video w-full items-center justify-center rounded-2xl bg-brand-deep text-[16px] font-bold text-white hover:bg-brand">
        Watch the video ↗
      </a>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <iframe src={src} title={title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  );
}

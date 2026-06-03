// Backend'e basit fetch sarmalayıcı.
// VITE_API_BASE_URL boşsa Vite proxy'si kullanılır (/api -> 127.0.0.1:8000).
const BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`İstek başarısız (${res.status}): ${path}`);
  }
  return res.json();
}

// Bir kaydı kısmi günceller (PATCH, JSON).
export async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Güncelleme başarısız (${res.status})`);
  return res.json();
}

// CSV dosya(ları) yükler (multipart/form-data).
export async function apiUpload(path, files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: fd });
  if (!res.ok) {
    let msg = `Yükleme başarısız (${res.status})`;
    try {
      const j = await res.json();
      if (j.detail) msg = j.detail;
    } catch {
      /* yoksay */
    }
    throw new Error(msg);
  }
  return res.json();
}

"use client";

/**
 * Client half of the two-step upload (see `lib/staged-upload.ts`): send the raw
 * bytes to `/api/uploads/stage` with XHR (fetch gives no upload progress), then
 * submit the ordinary form with a token instead of the file.
 *
 * Anything above the threshold goes this way; small files keep riding along in
 * the multipart form, which is one request less for the common case.
 */
export const STAGE_THRESHOLD_BYTES = 8 * 1024 * 1024;

export function uploadErrorMessage(status: number) {
  if (status === 413) {
    return "Сервер отклонил файл как слишком большой. Если это админ и файл в пределах лимита — на сервере не поднят client_max_body_size в nginx.";
  }
  if (status === 401) return "Сессия истекла — войдите заново.";
  if (status === 504 || status === 502) return "Сервер не дождался конца загрузки. Попробуйте ещё раз или загрузите файл по SSH и укажите путь.";
  return "Не удалось загрузить файл.";
}

export function stageFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads/stage?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data: { token?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as typeof data;
      } catch {
        /* nginx 413/504 pages are HTML, not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.token) {
        onProgress?.(1);
        resolve(data.token);
        return;
      }
      reject(new Error(data.error || uploadErrorMessage(xhr.status)));
    };
    xhr.onerror = () => reject(new Error("Связь с сервером оборвалась во время загрузки."));
    xhr.onabort = () => reject(new Error("Загрузка отменена."));
    xhr.send(file);
  });
}

/**
 * Replaces a large file field with a staging token, in place. Returns false if
 * nothing needed staging, so callers can skip their progress UI.
 */
export async function stageLargeField(
  formData: FormData,
  field: string,
  tokenField: string,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  const value = formData.get(field);
  if (!(value instanceof File) || value.size === 0) return false;
  if (value.size < STAGE_THRESHOLD_BYTES) return false;
  const token = await stageFile(value, onProgress);
  formData.delete(field);
  formData.set(tokenField, token);
  formData.set(`${tokenField}Name`, value.name);
  return true;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

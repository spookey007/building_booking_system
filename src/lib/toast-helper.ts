import { toast } from "sonner";

export function showSuccess(message: string) {
  toast.success(message);
}

export function showError(message: string) {
  toast.error(message);
}

export function showInfo(message: string) {
  toast.info(message);
}

export function showActionResult(result: { ok: boolean; message: string }) {
  if (result.ok) {
    showSuccess(result.message);
    return;
  }
  showError(result.message);
}

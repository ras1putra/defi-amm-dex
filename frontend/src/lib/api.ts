import axios from 'axios';
import { toast } from 'sonner';
import type { ApiErrorResponse } from '@/types/api';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
  withCredentials: true,
});

export function showErrorToast(error: unknown, defaultMessage: string = "An error occurred") {
  if (axios.isAxiosError(error)) {
    const apiMsg = (error.response?.data as ApiErrorResponse | undefined)?.message;
    toast.error(apiMsg || error.message);
    return;
  }

  if (error && typeof error === 'object') {
    const err = error as { message?: string; shortMessage?: string };
    const msg = (err.message || "").toLowerCase();
    const shortMsg = (err.shortMessage || "").toLowerCase();

    // Clean up user rejections
    if (msg.includes("rejected") || msg.includes("denied") || shortMsg.includes("rejected")) {
      toast.error("User rejected the request");
      return;
    }

    // Clean up RPC custom reverts
    if (err.shortMessage) {
      let cleanMsg = err.shortMessage;
      if (cleanMsg.includes("reverted with the following reason:")) {
        const parts = cleanMsg.split("reverted with the following reason:");
        if (parts.length > 1) {
          cleanMsg = parts[1].trim();
        }
      }
      toast.error(cleanMsg);
      return;
    }

    // Fallback to general message
    if (err.message) {
      toast.error(err.message);
      return;
    }
  }

  if (error instanceof Error) {
    toast.error(error.message);
  } else {
    toast.error(defaultMessage);
  }
}

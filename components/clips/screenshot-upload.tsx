"use client";

import { useState } from "react";
import { ImageUp } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { attachScreenshotAction } from "@/app/campaigns/clip-actions";

const SHRINK_ABOVE_BYTES = 3.5 * 1024 * 1024; // the server rejects > 4 MB; shrink well before that
const MAX_SIDE_PX = 2600; // still easily readable for analytics text

/** Re-encode a big image as a smaller JPEG in the browser. Falls back to the original if anything fails. */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Screenshot alternative to the video link, shown only while the clip has fewer than 10,000 views. */
export function ScreenshotUpload({ campaignId, clipId, replacing }: { campaignId: string; clipId: string; replacing: boolean }) {
  const [note, setNote] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setNote(null);
    if (!file || file.size <= SHRINK_ABOVE_BYTES) return;
    setNote("Large image — resizing it for upload…");
    const smaller = await shrink(file);
    if (smaller !== file) {
      const dt = new DataTransfer();
      dt.items.add(smaller);
      input.files = dt.files;
      setNote(`Resized to ${(smaller.size / (1024 * 1024)).toFixed(1)} MB.`);
    } else {
      setNote(null);
    }
  }

  return (
    <ActionForm action={attachScreenshotAction.bind(null, campaignId, clipId)} className="flex flex-wrap items-center gap-2">
      <input
        type="file"
        name="screenshot"
        accept="image/png,image/jpeg,image/webp"
        required
        onChange={onPick}
        aria-label="Analytics screenshot"
        className="min-w-0 max-w-full flex-1 rounded-xl border border-subtle bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-text-primary"
      />
      <Button type="submit" variant="outline" size="sm">
        <ImageUp className="h-3.5 w-3.5" aria-hidden /> {replacing ? "Replace screenshot" : "Upload screenshot"}
      </Button>
      <p className="w-full text-xs text-text-secondary">PNG, JPEG or WebP, up to 4 MB.{note && <span className="ml-1 text-gold-light">{note}</span>}</p>
    </ActionForm>
  );
}

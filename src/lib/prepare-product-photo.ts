const MAX_BYTES = 1_800_000;

// Las fotos del celular pesan varios MB. Las reducimos en el navegador antes de subirlas.
export async function prepareProductPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const attempts = [
      { max: 1200, quality: 0.85 },
      { max: 1000, quality: 0.75 },
      { max: 800, quality: 0.65 },
    ];
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.max / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", attempt.quality));
      if (blob && blob.size <= MAX_BYTES) return new File([blob], "foto.jpg", { type: "image/jpeg" });
    }
  } finally {
    bitmap.close();
  }
  throw new Error("foto");
}

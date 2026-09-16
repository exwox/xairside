/** URL foto yang aman dipasang sebagai src/href pada HTML popup Leaflet. */
export function damagePopupPhotoUrls(
  parts: ReadonlyArray<{ photoUrl?: string | null }>,
): string[] {
  const urls = new Set<string>();

  for (const part of parts) {
    const photoUrl = part.photoUrl?.trim();
    if (!photoUrl) continue;

    // Unggahan aplikasi memakai path lokal; tolak URL protocol-relative dan backslash.
    if (photoUrl.startsWith('/')) {
      if (!photoUrl.startsWith('//') && !photoUrl.includes('\\')) urls.add(photoUrl);
      continue;
    }

    // Pertahankan dukungan foto lama yang tersimpan sebagai URL absolut.
    if (!/^https?:\/\//i.test(photoUrl)) continue;
    try {
      const parsed = new URL(photoUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') urls.add(parsed.href);
    } catch {
      // URL rusak tidak boleh masuk ke atribut HTML popup.
    }
  }

  return [...urls];
}

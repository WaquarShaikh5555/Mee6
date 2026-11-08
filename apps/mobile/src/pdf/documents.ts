/**
 * Picking files, and the small amount of plumbing around it.
 *
 * Two pickers are used because they are two different intents: a document comes
 * from Files/Drive, a photo comes from the gallery. Neither asks for a
 * permission on Android 13+ — both go through the system picker, which is the
 * only thing that sees the file list.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export type PickedFile = {
  /** A `file://` URI from the cache, or a `content://` URI from the picker. */
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
};

const PDF_TYPES = ['application/pdf'];

function nameFromUri(uri: string, fallback: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const last = clean.split('/').pop() ?? '';
  return last.length > 0 ? decodeURIComponent(last) : fallback;
}

/** One or more PDFs. `multiple` is what the merge tool asks for. */
export async function pickPdfs(multiple = false): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: PDF_TYPES,
    multiple,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return [];

  return result.assets.map((asset, index) => ({
    uri: asset.uri,
    name: asset.name || nameFromUri(asset.uri, `document-${index + 1}.pdf`),
    size: asset.size ?? 0,
    mimeType: asset.mimeType,
  }));
}

/** Photos and screenshots, in the order the person chose them. */
export async function pickImages(): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    orderedSelection: true,
    quality: 1,
  });

  if (result.canceled) return [];

  return result.assets.map((asset, index) => ({
    uri: asset.uri,
    name: asset.fileName || nameFromUri(asset.uri, `image-${index + 1}.jpg`),
    size: asset.fileSize ?? 0,
    mimeType: asset.mimeType,
  }));
}

/** A single photo, for a signature taken with the camera or from the gallery. */
export async function pickSignaturePhoto(): Promise<PickedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName || nameFromUri(asset.uri, 'signature.jpg'),
    size: asset.fileSize ?? 0,
    mimeType: asset.mimeType,
  };
}

export function pickerFor(input: 'pdf' | 'pdfs' | 'images' | 'two'): () => Promise<PickedFile[]> {
  if (input === 'images') return () => pickImages();
  if (input === 'pdfs') return () => pickPdfs(true);
  return () => pickPdfs(false);
}

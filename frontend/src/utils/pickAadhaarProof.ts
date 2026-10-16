import * as DocumentPicker from 'expo-document-picker';

export interface AadhaarProof {
  dataUri: string;   // data:<mime>;base64,....  (ready to POST)
  name: string;
  mimeType: string;
  sizeKB: number;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

// Lets the priest pick their Aadhaar proof as a JPEG / PNG / PDF, enforces
// the 2 MB cap, and returns a base64 data URI ready to send to the backend.
export function pickAadhaarProof(): Promise<AadhaarProof | null> {
  return pickProofDocument('aadhaar-proof');
}

// Same rules for any uploaded proof document (e.g. the Agama certificate).
// `fallbackName` is used when the picker doesn't report a file name.
export async function pickProofDocument(fallbackName: string): Promise<AadhaarProof | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png', 'application/pdf'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;

  const asset = res.assets[0];
  const mime = (asset.mimeType || '').toLowerCase();
  const nameLc = (asset.name || '').toLowerCase();
  const looksAllowed =
    ALLOWED.includes(mime) ||
    nameLc.endsWith('.jpg') || nameLc.endsWith('.jpeg') ||
    nameLc.endsWith('.png') || nameLc.endsWith('.pdf');
  if (!looksAllowed) {
    throw new Error('Only JPEG, PNG or PDF files are allowed.');
  }
  if (typeof asset.size === 'number' && asset.size > MAX_BYTES) {
    throw new Error(`File is ${(asset.size / (1024 * 1024)).toFixed(1)} MB. Maximum allowed is 2 MB.`);
  }

  // Read the file into a base64 data URI without needing expo-file-system.
  const blob = await (await fetch(asset.uri)).blob();
  if (blob.size > MAX_BYTES) {
    throw new Error(`File is ${(blob.size / (1024 * 1024)).toFixed(1)} MB. Maximum allowed is 2 MB.`);
  }
  const rawDataUri: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

  const resolvedMime =
    ALLOWED.includes(mime) ? mime
      : nameLc.endsWith('.pdf') ? 'application/pdf'
        : nameLc.endsWith('.png') ? 'image/png'
          : 'image/jpeg';

  // On some platforms re-fetching a picked file:// URI loses the real MIME
  // type (the blob comes back as e.g. "application/octet-stream"), so
  // FileReader stamps the data URI with the wrong prefix even though the
  // file itself is a valid PDF/JPEG/PNG. Re-stamp it with the MIME type we
  // already validated above, so the backend's strict prefix check passes.
  const base64Payload = rawDataUri.slice(rawDataUri.indexOf(',') + 1);
  const dataUri = `data:${resolvedMime};base64,${base64Payload}`;

  return {
    dataUri,
    name: asset.name || fallbackName,
    mimeType: resolvedMime,
    sizeKB: Math.round((blob.size || asset.size || 0) / 1024),
  };
}

import type { DocumentPickerAsset } from 'expo-document-picker';

export type FormValue = string | DocumentPickerAsset;

// Native form values retain repeated checkbox names and document URIs.
export class FormValues {
  private values: [string, FormValue][];
  constructor(values?: Iterable<[string, FormValue]>) {
    this.values = values ? [...values] : [];
  }
  append(name: string, value: FormValue) {
    this.values.push([name, value]);
  }
  get(name: string): FormValue | null {
    return this.values.find(([key]) => key === name)?.[1] ?? null;
  }
  getAll(name: string): FormValue[] {
    return this.values.filter(([key]) => key === name).map(([, value]) => value);
  }
  has(name: string): boolean {
    return this.values.some(([key]) => key === name);
  }
  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }
  multipart(): FormData {
    const data = new FormData();
    for (const [key, value] of this.values) {
      if (typeof value === 'string') data.append(key, value);
      else
        data.append(key, {
          uri: value.uri,
          name: value.name,
          type: value.mimeType || 'application/octet-stream',
        } as unknown as Blob);
    }
    return data;
  }
}

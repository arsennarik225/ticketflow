import * as SecureStore from 'expo-secure-store';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    clear: () => values.clear(),
  };
}

// Guest receipts and checkout retry keys live only for this app session, like the website.
export const flowStorage = memoryStorage();
export const preferences = memoryStorage();
export async function loadLanguage() {
  const language = await SecureStore.getItemAsync('biletflow.language');
  if (language) preferences.setItem('biletflow.language', language);
  return language;
}
export async function saveLanguage(language: string) {
  preferences.setItem('biletflow.language', language);
  await SecureStore.setItemAsync('biletflow.language', language);
}

/** The name a change from the site is made under, kept in this browser. */
export interface Author {
  read(): string;
  keep(name: string): void;
}

export const AUTHOR_KEY = "riki-author";
export const AUTHOR_MOST = 100;

const clean = (name: string) => name.trim().slice(0, AUTHOR_MOST);

export function storedAuthor(storage: () => Storage = () => localStorage): Author {
  return {
    read() {
      try {
        return clean(storage().getItem(AUTHOR_KEY) ?? "");
      } catch {
        return "";
      }
    },
    keep(name) {
      try {
        const kept = clean(name);
        if (kept) storage().setItem(AUTHOR_KEY, kept);
        else storage().removeItem(AUTHOR_KEY);
      } catch { /* the name is used for this visit only */ }
    }
  };
}

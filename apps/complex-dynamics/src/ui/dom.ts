/** Tiny typed DOM helpers. */

/** Get an element by id, throwing if it is missing (fail fast on typos). */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Expected element #${id} to exist`);
  return el as T;
}

/** Get an input/textarea element's value by id. */
export function valueOf(id: string): string {
  return byId<HTMLInputElement | HTMLTextAreaElement>(id).value;
}

/** Set an input/textarea element's value by id. */
export function setValue(id: string, value: string | number): void {
  byId<HTMLInputElement | HTMLTextAreaElement>(id).value = String(value);
}

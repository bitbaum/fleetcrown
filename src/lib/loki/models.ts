/**
 * The shape of the composer's model menu.
 *
 * Lives here rather than in the route so a CLIENT component can name the type
 * without importing a server route module. A type-only import is erased at
 * build time and would have worked, but it puts a route in the import graph of
 * a bundle that must never reach for one — and the next person to add a
 * non-type import to that line would get no warning at all.
 */

export type LokiModelOption = {
  /** The `model` value to send back with a message. */
  id: string;
  /** The model name on its own, for the row. */
  label: string;
  /** Vendor, for the row's subtitle and grouping. */
  provider: string;
  /** False = listed but not selectable, with `reason` saying why. */
  usable: boolean;
  reason?: string;
};

export type LokiModelsResponse = {
  /** Vendors that answered as reachable, in chain order. */
  options: LokiModelOption[];
  /** The model the chain would start at on "Auto", for the Auto row's subtitle. */
  autoStartsAt: string | null;
};

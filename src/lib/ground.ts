/** The ground `portable` adds for the map's regions; not the stack's to change. */
export function groundID(mapID: string): string {
  const tail = parseInt(mapID.slice(-4), 16) ^ 0x5aa5;
  return (mapID.slice(0, -4) + tail.toString(16).padStart(4, "0")).toUpperCase();
}

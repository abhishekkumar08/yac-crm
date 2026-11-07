import { useMemo } from "react";
import { useSession } from "@/hooks.js";

export function useObjectForId() {
  const { objects } = useSession();
  return useMemo(() => {
    const byPrefix = new Map(objects.map((o) => [o.prefix, o]));
    return (id) => (id ? byPrefix.get(String(id).slice(0, 3)) ?? null : null);
  }, [objects]);
}

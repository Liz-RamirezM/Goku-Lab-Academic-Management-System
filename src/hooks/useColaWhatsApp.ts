import { useCallback, useRef, useState } from "react";
import type { ItemWhatsAppCola } from "../utils/avisosWhatsAppProfesor";

export function useColaWhatsApp() {
  const [state, setState] = useState<{ items: ItemWhatsAppCola[]; index: number }>({
    items: [],
    index: 0,
  });
  const [activo, setActivo] = useState(false);
  const alTerminarRef = useRef<(() => void) | undefined>();

  const iniciar = useCallback((lista: ItemWhatsAppCola[], cb?: () => void) => {
    if (!lista.length) {
      cb?.();
      return;
    }
    alTerminarRef.current = cb;
    setState({ items: lista, index: 0 });
    setActivo(true);
  }, []);

  const cerrar = useCallback(() => {
    setState(({ items, index }) => {
      const next = index + 1;
      if (next >= items.length) {
        setActivo(false);
        const cb = alTerminarRef.current;
        alTerminarRef.current = undefined;
        if (cb) queueMicrotask(cb);
        return { items: [], index: 0 };
      }
      return { items, index: next };
    });
  }, []);

  const actual = activo ? state.items[state.index] ?? null : null;

  return { actual, activo, iniciar, cerrar };
}

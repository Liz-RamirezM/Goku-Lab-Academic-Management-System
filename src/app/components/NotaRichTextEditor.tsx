import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";
import { notaHtmlVacia, sanitizarNotaHtml } from "../../utils/notaClase";

const COLORES = [
  { label: "Negro", value: "#111827" },
  { label: "Rojo", value: "#dc2626" },
  { label: "Verde", value: "#16a34a" },
  { label: "Azul", value: "#2563eb" },
  { label: "Morado", value: "#7c3aed" },
  { label: "Naranja", value: "#ea580c" },
];

interface NotaRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

export function NotaRichTextEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = "Escribe una nota para esta clase…",
}: NotaRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || readOnly) return;
    const actual = sanitizarNotaHtml(el.innerHTML);
    const externo = sanitizarNotaHtml(value);
    if (actual !== externo) {
      el.innerHTML = externo || "";
    }
  }, [value, readOnly]);

  const ejecutar = (comando: string, argumento?: string) => {
    document.execCommand(comando, false, argumento);
    editorRef.current?.focus();
    onChange(sanitizarNotaHtml(editorRef.current?.innerHTML || ""));
  };

  if (readOnly) {
    if (notaHtmlVacia(value)) {
      return (
        <p className="text-sm italic text-gray-400">Sin notas para esta clase.</p>
      );
    }
    return (
      <div
        className="prose prose-sm max-w-none text-sm leading-relaxed text-gray-800 [&_b]:font-bold [&_strong]:font-bold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: sanitizarNotaHtml(value) }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
        <button
          type="button"
          title="Negrita"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutar("bold");
          }}
          className="rounded p-1.5 text-gray-600 hover:bg-white hover:text-gray-900"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Cursiva"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutar("italic");
          }}
          className="rounded p-1.5 text-gray-600 hover:bg-white hover:text-gray-900"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Subrayado"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutar("underline");
          }}
          className="rounded p-1.5 text-gray-600 hover:bg-white hover:text-gray-900"
        >
          <Underline className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Viñetas"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutar("insertUnorderedList");
          }}
          className="rounded p-1.5 text-gray-600 hover:bg-white hover:text-gray-900"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Lista numerada"
          onMouseDown={(e) => {
            e.preventDefault();
            ejecutar("insertOrderedList");
          }}
          className="rounded p-1.5 text-gray-600 hover:bg-white hover:text-gray-900"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        {COLORES.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onMouseDown={(e) => {
              e.preventDefault();
              ejecutar("foreColor", c.value);
            }}
            className="h-6 w-6 rounded-full border border-gray-200 shadow-sm hover:scale-110"
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() =>
          onChange(sanitizarNotaHtml(editorRef.current?.innerHTML || ""))
        }
        data-placeholder={placeholder}
        className="min-h-[96px] w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none transition-colors focus:border-cyan-300 focus:bg-white empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)] [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5"
      />
    </div>
  );
}

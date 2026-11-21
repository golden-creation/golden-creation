import { useCallback, useRef } from "react";

function useEditorScroll() {
  const editorRef = useRef(null);

  const scrollToEditor = useCallback((focusPrimaryField = false) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const editor = editorRef.current;

        if (!editor) return;

        editor.scrollIntoView({ behavior: "smooth", block: "start" });

        if (focusPrimaryField) {
          editor
            .querySelector("[data-editor-primary]")
            ?.focus({ preventScroll: true });
        }
      });
    });
  }, []);

  return { editorRef, scrollToEditor };
}

export default useEditorScroll;

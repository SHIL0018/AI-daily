import { useEffect, useId } from "react";
import { X } from "lucide-react";

export function Drawer({ open, title, wide = false, onClose, children }: {
  open: boolean;
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className={`drawer ${wide ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="drawer-header">
          <h2 id={titleId}>{title}</h2>
          <button autoFocus className="icon-button" type="button" title="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="drawer-content">{children}</div>
      </aside>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

export function CompanionProcess({ text, expanded }: { text: string; expanded?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(Boolean(expanded));
  if (!text.trim()) return null;
  return (
    <div className="rounded-md border border-slate-200/80 bg-slate-50/80">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-500"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
        {t("companion.process")}
      </button>
      {open ? (
        <p className="whitespace-pre-wrap break-words border-t border-slate-200/70 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
          {text.trim()}
        </p>
      ) : null}
    </div>
  );
}

import { useCallback } from "react";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentSelectorProps {
  availableDocuments: string[];
  selectedDocuments: string[];
  onSelectionChange: (docs: string[]) => void;
  disabled?: boolean;
}

export const DocumentSelector = ({
  availableDocuments,
  selectedDocuments,
  onSelectionChange,
  disabled = false,
}: DocumentSelectorProps) => {
  const allSelected =
    selectedDocuments.length === 0 ||
    selectedDocuments.length === availableDocuments.length;

  const handleToggle = useCallback(
    (doc: string) => {
      if (selectedDocuments.includes(doc)) {
        const next = selectedDocuments.filter((d) => d !== doc);
        onSelectionChange(next);
      } else {
        onSelectionChange([...selectedDocuments, doc]);
      }
    },
    [selectedDocuments, onSelectionChange],
  );

  const handleAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  if (availableDocuments.length === 0) return null;

  const shortName = (doc: string) => {
    try {
      return new URL(doc).hostname.replace(/^www\./, "");
    } catch {
      return doc.length > 24 ? doc.slice(0, 22) + "…" : doc;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={handleAll}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50",
          allSelected
            ? "border-primary/60 bg-primary/15 text-primary"
            : "border-border/40 bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
      >
        All sources
      </button>
      {availableDocuments.map((doc) => {
        const active = selectedDocuments.includes(doc);
        return (
          <button
            key={doc}
            type="button"
            onClick={() => handleToggle(doc)}
            disabled={disabled}
            title={doc}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50",
              active
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/40 bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <FileText className="h-3 w-3 shrink-0" />
            <span className="max-w-[120px] truncate">{shortName(doc)}</span>
            {active && <X className="h-2.5 w-2.5 shrink-0 opacity-70" />}
          </button>
        );
      })}
    </div>
  );
};

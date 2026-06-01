import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Check, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDeleteChatDialogProps {
  open: boolean;
  chatTitle: string;
  documentCount: number;
  onConfirmDelete: (moveToGlobal: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmDeleteChatDialog = ({
  open,
  chatTitle,
  documentCount,
  onConfirmDelete,
  onCancel,
  isLoading = false,
}: ConfirmDeleteChatDialogProps) => {
  const [selectedOption, setSelectedOption] = useState<
    "delete" | "move" | null
  >(null);

  useEffect(() => {
    if (!open) {
      setSelectedOption(null);
    }
  }, [open]);

  const hasDocuments = documentCount > 0;

  if (!hasDocuments) {
    return (
      <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
        <AlertDialogContent className="border-0 bg-transparent shadow-none p-0">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-500/5 px-4 py-3 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-500/10 text-amber-500 shadow-lg shadow-amber-500/10">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle className="truncate text-sm font-semibold">
                  Delete conversation?
                </AlertDialogTitle>
                <AlertDialogDescription className="truncate text-xs text-muted-foreground">
                  {chatTitle}
                </AlertDialogDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <AlertDialogCancel
                disabled={isLoading}
                className="h-8 w-8 shrink-0 rounded-lg border border-border/40 bg-background/50 p-0 hover:border-border/60 hover:bg-background/70 hover:shadow-lg transition-all disabled:opacity-50"
                title="Cancel"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isLoading}
                onClick={() => onConfirmDelete(false)}
                className="h-8 w-8 shrink-0 rounded-lg border border-foreground/20 bg-foreground p-0 text-background hover:bg-foreground/90 hover:shadow-lg transition-all disabled:opacity-50"
                title="Delete"
              >
                <Check className="h-4 w-4" />
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="border-0 bg-transparent shadow-none p-0">
        <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-500/5 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-500/10 text-amber-500 shadow-lg shadow-amber-500/10">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="truncate text-sm font-semibold">
                Delete conversation?
              </AlertDialogTitle>
              <AlertDialogDescription className="truncate text-xs text-muted-foreground">
                {chatTitle}
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogDescription className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-xs text-foreground/75 backdrop-blur-xl">
            This chat contains {documentCount} document
            {documentCount !== 1 ? "s" : ""}. Choose what to keep.
          </AlertDialogDescription>

          <div className="grid gap-2 grid-cols-2">
            <button
              onClick={() => setSelectedOption("move")}
              disabled={isLoading}
              className={cn(
                "flex h-9 items-center justify-center rounded-lg border transition-all disabled:opacity-50",
                selectedOption === "move"
                  ? "border-primary/60 bg-primary/20 text-primary shadow-lg shadow-primary/20"
                  : "border-border/40 bg-background/50 text-foreground/70 hover:border-primary/50 hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/10",
              )}
              title="Keep documents in global knowledge base"
            >
              <Check className="h-4 w-4" />
            </button>

            <button
              onClick={() => setSelectedOption("delete")}
              disabled={isLoading}
              className={cn(
                "flex h-9 items-center justify-center rounded-lg border transition-all disabled:opacity-50",
                selectedOption === "delete"
                  ? "border-destructive/60 bg-destructive/20 text-destructive shadow-lg shadow-destructive/20"
                  : "border-border/40 bg-background/50 text-foreground/70 hover:border-destructive/50 hover:bg-destructive/10 hover:shadow-lg hover:shadow-destructive/10",
              )}
              title="Delete documents"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-1.5 pt-2">
            <AlertDialogCancel
              disabled={isLoading}
              className="h-8 w-8 shrink-0 rounded-lg border border-border/40 bg-background/50 p-0 hover:border-border/60 hover:bg-background/70 hover:shadow-lg transition-all disabled:opacity-50"
              title="Cancel"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </AlertDialogCancel>
            <Button
              disabled={!selectedOption || isLoading}
              onClick={() => {
                if (selectedOption) {
                  onConfirmDelete(selectedOption === "move");
                }
              }}
              className={cn(
                "h-8 w-8 shrink-0 rounded-lg p-0 transition-all disabled:opacity-50 border",
                "bg-foreground text-background hover:bg-foreground/90 border-foreground/20",
              )}
              title={isLoading ? "Processing..." : "Confirm"}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

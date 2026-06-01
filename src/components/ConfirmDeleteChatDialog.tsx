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
import { AlertTriangle, Check, X } from "lucide-react";
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
        <AlertDialogContent className="max-h-[calc(100vh-2rem)] w-[min(92vw,32rem)] overflow-hidden border border-primary/20 bg-gradient-to-br from-background/95 via-background/90 to-background/80 p-0 backdrop-blur-2xl shadow-2xl before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-transparent before:pointer-events-none">
          <AlertDialogHeader className="p-5 text-left">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              {/* Left Side: Icon and Text info */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <AlertDialogTitle className="truncate text-base">
                    Delete conversation?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="truncate text-xs text-muted-foreground">
                    {chatTitle}
                  </AlertDialogDescription>
                </div>
              </div>

              {/* Right Side: Action Buttons inline */}
              <div className="flex shrink-0 items-center gap-2">
                <AlertDialogCancel
                  disabled={isLoading}
                  className="mt-0 h-9 rounded-xl border-border/40 bg-background/40 px-3 text-xs hover:bg-background/70"
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isLoading}
                  onClick={() => onConfirmDelete(false)}
                  className="h-9 rounded-xl bg-gradient-to-r from-destructive to-rose-500 px-3 text-xs text-destructive-foreground shadow-lg shadow-destructive/20 hover:from-destructive hover:to-rose-600"
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Delete
                </AlertDialogAction>
              </div>
            </div>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-h-[calc(100vh-2rem)] w-[min(92vw,34rem)] overflow-hidden border border-primary/20 bg-gradient-to-br from-background/95 via-background/90 to-background/80 p-0 backdrop-blur-2xl shadow-2xl before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-transparent before:pointer-events-none">
        <AlertDialogHeader className="space-y-3 p-5 pb-3 text-left">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <AlertDialogTitle className="truncate text-base">
                Delete conversation?
              </AlertDialogTitle>
              <AlertDialogDescription className="truncate text-xs text-muted-foreground">
                {chatTitle}
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogDescription className="rounded-2xl border border-border/30 bg-background/40 px-4 py-3 text-sm text-foreground/80 backdrop-blur-xl">
            This chat contains {documentCount} document
            {documentCount !== 1 ? "s" : ""}. Choose what to keep.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-5 pb-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => setSelectedOption("move")}
              disabled={isLoading}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-all",
                selectedOption === "move"
                  ? "border-primary/60 bg-primary/10 text-primary shadow-lg shadow-primary/15"
                  : "border-border/40 bg-background/40 text-foreground/80 hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              <Check className="h-4 w-4" />
              Keep docs
            </button>

            <button
              onClick={() => setSelectedOption("delete")}
              disabled={isLoading}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-all",
                selectedOption === "delete"
                  ? "border-destructive/60 bg-destructive/10 text-destructive shadow-lg shadow-destructive/15"
                  : "border-border/40 bg-background/40 text-foreground/80 hover:border-destructive/50 hover:bg-destructive/5",
              )}
            >
              <X className="h-4 w-4" />
              Delete docs
            </button>
          </div>
        </div>

        <AlertDialogFooter className="flex-row items-center justify-end gap-2 border-t border-border/20 p-5 pt-4">
          <AlertDialogCancel
            disabled={isLoading}
            className="h-10 rounded-xl border-border/40 bg-background/40 hover:bg-background/70"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </AlertDialogCancel>
          <Button
            disabled={!selectedOption || isLoading}
            onClick={() => {
              if (selectedOption) {
                onConfirmDelete(selectedOption === "move");
              }
            }}
            className={cn(
              "h-10 rounded-xl",
              selectedOption === "move"
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-gradient-to-r from-destructive to-rose-500 text-destructive-foreground shadow-lg shadow-destructive/20 hover:from-destructive hover:to-rose-600",
            )}
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Processing...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Confirm
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

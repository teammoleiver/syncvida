import { Button } from "@/components/ui/button";
import { Download, Image as ImageIcon, Link2, Loader2, FileText, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Shared editor toolbar — same vocabulary across Canvas, LinkedIn Cheat Sheet,
 * Carousel, and Square editors. Each action is optional so editors can opt in
 * to only what they support (e.g. PDF only makes sense for carousels).
 */
export type EditorActionsProps = {
  /** Plain PNG download to the user's machine. */
  onExportImage?: () => void;
  /** Save the rendered canvas to the Asset Library + (if hasPlan) link to post. */
  onSaveImage?: () => void;
  /** Carousel-only: render every slide → PDF → save → link as document. */
  onSavePdf?: () => void;
  /** Optional secondary action (e.g. "Export this slide" for carousels). */
  onSecondary?: { label: string; onClick: () => void };
  /** Whether a plan is linked — flips wording from "Save" to "Save & link to post". */
  hasPlan?: boolean;
  /** Loading flags so we can show a spinner per action. */
  exporting?: boolean;
  saving?: boolean;
  savingPdf?: boolean;
};

export default function EditorActions({
  onExportImage,
  onSaveImage,
  onSavePdf,
  onSecondary,
  hasPlan,
  exporting,
  saving,
  savingPdf,
}: EditorActionsProps) {
  return (
    <>
      {/* Desktop view: standard buttons */}
      <div className="hidden sm:flex justify-end gap-2">
        {onExportImage && (
          <Button variant="outline" onClick={onExportImage} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Export PNG
          </Button>
        )}
        {onSecondary && (
          <Button variant="outline" onClick={onSecondary.onClick} disabled={exporting}>
            {onSecondary.label}
          </Button>
        )}
        {onSaveImage && (
          <Button variant="outline" onClick={onSaveImage} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-1" />}
            {hasPlan ? "Save image & link to post" : "Save image to assets"}
          </Button>
        )}
        {onSavePdf && (
          <Button onClick={onSavePdf} disabled={savingPdf} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {savingPdf ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
            {hasPlan ? "Save PDF & link to post" : "Save PDF carousel"}
          </Button>
        )}
        {hasPlan && !onSavePdf && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            <Link2 className="w-3 h-3" /> Linked to post
          </span>
        )}
      </div>

      {/* Mobile view: unified dropdown */}
      <div className="flex sm:hidden justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="bg-primary text-primary-foreground font-semibold flex items-center gap-1 h-8">
              {(exporting || saving || savingPdf) ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Actions</span>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 bg-background border border-border">
            {onExportImage && (
              <DropdownMenuItem onClick={onExportImage} disabled={exporting} className="flex items-center gap-2 cursor-pointer text-xs p-2">
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Download className="w-3.5 h-3.5 shrink-0" />}
                <span>Export PNG</span>
              </DropdownMenuItem>
            )}
            {onSecondary && (
              <DropdownMenuItem onClick={onSecondary.onClick} disabled={exporting} className="flex items-center gap-2 cursor-pointer text-xs p-2">
                <span className="truncate">{onSecondary.label}</span>
              </DropdownMenuItem>
            )}
            {onSaveImage && (
              <DropdownMenuItem onClick={onSaveImage} disabled={saving} className="flex items-center gap-2 cursor-pointer text-xs p-2">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <ImageIcon className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{hasPlan ? "Save & link image" : "Save image"}</span>
              </DropdownMenuItem>
            )}
            {onSavePdf && (
              <DropdownMenuItem onClick={onSavePdf} disabled={savingPdf} className="flex items-center gap-2 cursor-pointer text-xs p-2 text-emerald-400 font-semibold focus:text-emerald-300">
                {savingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{hasPlan ? "Save & link PDF" : "Save PDF carousel"}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

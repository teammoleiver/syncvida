import { Key, X, Check } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ApiKeyModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card rounded-xl p-6 max-w-sm w-full shadow-xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-foreground flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" /> AI is built-in
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
            <Check className="w-4 h-4 text-success" />
            <span className="text-sm text-foreground">AI is enabled by default</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Instaleadsync now runs AI features through a secure server-side gateway. You no longer need to provide your own OpenAI API key — analysis, chat, and insights are handled automatically.
          </p>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary-dark transition">Got it</button>
        </div>
      </motion.div>
    </div>
  );
}

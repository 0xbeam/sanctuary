import { useState, useEffect } from "react";
import { X, ExternalLink, Image, CheckSquare, Square } from "lucide-react";
import { Modal } from "../ui/Modal";
import { CategoryBadge } from "./CategoryBadge";
import { SourceIcon } from "./SourceIcon";
import { useData } from "../../contexts/DataContext";

export function InstructionDetail({ instruction, onClose }) {
  const { loadInstruction, instructionCache } = useData();
  const [detail, setDetail] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});

  useEffect(() => {
    const cached = instructionCache[instruction.id];
    if (cached) {
      setDetail(cached);
    } else {
      loadInstruction(instruction.id).then(setDetail);
    }
  }, [instruction.id, loadInstruction, instructionCache]);

  const toggleCheck = (idx) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!detail) {
    return (
      <Modal onClose={onClose} maxWidth="max-w-3xl">
        <div className="p-8 text-center text-stone-400">
          <div className="skeleton-shimmer h-6 w-48 mx-auto rounded mb-4" />
          <div className="skeleton-shimmer h-4 w-64 mx-auto rounded" />
        </div>
      </Modal>
    );
  }

  const blockers = detail.replies?.filter((r) => r.category === "blocker") || [];
  const revisions = detail.replies?.filter((r) => r.category === "revision") || [];
  const questions = detail.replies?.filter((r) => r.category === "question") || [];
  const approvals = detail.replies?.filter((r) => r.category === "approval") || [];
  const actionItems = [...blockers, ...revisions, ...questions];

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <SourceIcon source={detail.source} />
        <div className="flex-1">
          <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900 leading-tight">
            {detail.title}
          </h2>
          <div className="flex items-center gap-3 mt-1.5">
            {detail.project && (
              <span className="font-mono text-accent font-medium uppercase tracking-wider text-[10px]">
                {detail.project}
              </span>
            )}
            <span className="text-xs text-stone-500">
              {new Date(detail.scrapedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <a
              href={detail.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Original
            </a>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Context */}
      <div className="mb-6">
        <p className="gravity-label mb-2">Context</p>
        <div className="bg-surface rounded-lg p-4 text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
          <p className="text-xs text-stone-500 mb-2 font-medium">{detail.root?.author}</p>
          {detail.root?.text}
        </div>
        {detail.root?.attachments?.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto">
            {detail.root.attachments.filter((a) => a.type === "image").map((att, i) => (
              <div key={i} className="flex-shrink-0 bg-stone-100 rounded-lg p-2">
                <div className="flex items-center gap-1.5 text-xs text-stone-500">
                  <Image className="w-3 h-3" />
                  {att.title || att.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Instructions Checklist */}
      {actionItems.length > 0 && (
        <div className="mb-6">
          <p className="gravity-label mb-2">Agent Instructions</p>
          <div className="space-y-1.5">
            {actionItems.map((item, idx) => (
              <div
                key={idx}
                onClick={() => toggleCheck(idx)}
                className="flex items-start gap-2.5 p-3 bg-white border border-stone-200 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors"
              >
                {checkedItems[idx] ? (
                  <CheckSquare className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-4 h-4 text-stone-300 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${checkedItems[idx] ? "line-through text-stone-400" : "text-stone-800"}`}>
                    {item.text}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <CategoryBadge category={item.category} />
                    <span className="text-xs text-stone-400">{item.author}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approvals */}
      {approvals.length > 0 && (
        <div className="mb-6">
          <p className="gravity-label mb-2">Approvals</p>
          <div className="space-y-1">
            {approvals.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-stone-600 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-medium">{a.author}</span>
                <span className="text-stone-400 truncate">{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Thread */}
      <details className="mt-6">
        <summary className="gravity-label cursor-pointer hover:text-stone-700">
          Full Thread ({detail.allEntries?.length || 0} entries)
        </summary>
        <div className="mt-3 space-y-3">
          {detail.allEntries?.map((entry, i) => (
            <div key={i} className="flex gap-3 p-3 bg-white rounded-lg border border-stone-100">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-stone-700">{entry.author}</span>
                  <CategoryBadge category={entry.category} />
                  <span className="text-xs text-stone-400">
                    {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-sm text-stone-600 whitespace-pre-wrap">{entry.text}</p>
                {entry.attachments?.length > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {entry.attachments.map((att, j) => (
                      <span key={j} className="text-xs bg-stone-100 px-2 py-0.5 rounded flex items-center gap-1">
                        <Image className="w-3 h-3" />
                        {att.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Modal>
  );
}

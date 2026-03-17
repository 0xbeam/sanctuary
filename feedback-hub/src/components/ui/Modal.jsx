export function Modal({ children, onClose, maxWidth = "max-w-2xl" }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div
        className={`bg-white rounded-xl p-8 ${maxWidth} w-full shadow-2xl max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

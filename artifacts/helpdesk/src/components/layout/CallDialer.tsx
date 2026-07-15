import { useState, useRef, useEffect } from "react";
import { Phone, X, Delete } from "lucide-react";

const DIALPAD: { digit: string; letters?: string }[][] = [
  [{ digit: "1" }, { digit: "2", letters: "ABC" }, { digit: "3", letters: "DEF" }],
  [{ digit: "4", letters: "GHI" }, { digit: "5", letters: "JKL" }, { digit: "6", letters: "MNO" }],
  [{ digit: "7", letters: "PQRS" }, { digit: "8", letters: "TUV" }, { digit: "9", letters: "WXYZ" }],
  [{ digit: "*" }, { digit: "0", letters: "+" }, { digit: "#" }],
];

export function CallDialer({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("");
  const [calling, setCalling] = useState(false);
  const [callTimer, setCallTimer] = useState(0);

  const dialerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  // Initialize position
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    posRef.current = { x: w - 300, y: h - 540 };
    if (dialerRef.current) {
      dialerRef.current.style.left = `${posRef.current.x}px`;
      dialerRef.current.style.top = `${posRef.current.y}px`;
    }
  }, []);

  // Call timer
  useEffect(() => {
    if (!calling) { setCallTimer(0); return; }
    const id = setInterval(() => setCallTimer((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [calling]);

  const formatTimer = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      posRef.current = {
        x: dragRef.current.origX + ev.clientX - dragRef.current.startX,
        y: dragRef.current.origY + ev.clientY - dragRef.current.startY,
      };
      if (dialerRef.current) {
        dialerRef.current.style.left = `${posRef.current.x}px`;
        dialerRef.current.style.top = `${posRef.current.y}px`;
      }
    };
    const onUp = () => { dragRef.current.active = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => { window.removeEventListener("mousemove", onMove); };
  };

  const pressKey = (digit: string) => setDisplay((d) => d + digit);
  const backspace = () => setDisplay((d) => d.slice(0, -1));

  const handleCall = () => {
    if (!display) return;
    if (calling) { setCalling(false); return; }
    setCalling(true);
  };

  return (
    <div
      ref={dialerRef}
      className="fixed z-50 w-[260px] bg-white rounded-2xl shadow-2xl border border-slate-200 select-none overflow-hidden"
      style={{ position: "fixed" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-slate-900 cursor-grab active:cursor-grabbing"
        onMouseDown={startDrag}
      >
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-medium text-slate-400">From:</span>
          <span className="text-xs font-mono text-slate-200">+1 (415) 555-0192</span>
        </div>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Display */}
      <div className="px-5 pt-5 pb-3">
        <div className="relative flex items-center justify-center">
          <div className="text-2xl font-mono font-semibold text-slate-900 tracking-widest min-h-[36px] text-center flex items-center">
            {calling ? (
              <div className="text-center">
                <div className="text-sm text-emerald-600 font-medium mb-0.5">Connected</div>
                <div className="text-xl font-mono text-slate-900">{formatTimer(callTimer)}</div>
              </div>
            ) : display ? (
              display
            ) : (
              <span className="text-slate-300 text-base font-normal">Enter number</span>
            )}
          </div>
          {display && !calling && (
            <button
              className="absolute right-0 text-slate-400 hover:text-slate-700 transition-colors"
              onClick={backspace}
            >
              <Delete className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dial Pad */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 gap-2">
          {DIALPAD.map((row, ri) =>
            row.map((key) => (
              <button
                key={`${ri}-${key.digit}`}
                className="h-14 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 flex flex-col items-center justify-center transition-colors"
                onClick={() => !calling && pressKey(key.digit)}
                disabled={calling}
              >
                <span className="text-base font-semibold text-slate-900 leading-none">{key.digit}</span>
                {key.letters && (
                  <span className="text-[8px] font-medium text-slate-400 mt-0.5 tracking-widest">{key.letters}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Call Button */}
      <div className="px-5 pb-5 flex justify-center">
        <button
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
            calling
              ? "bg-rose-500 hover:bg-rose-600 shadow-rose-200"
              : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 disabled:bg-slate-200 disabled:shadow-none"
          }`}
          onClick={handleCall}
          disabled={!calling && !display}
        >
          <Phone className={`h-6 w-6 text-white ${calling ? "rotate-[135deg]" : ""} transition-transform`} />
        </button>
      </div>
    </div>
  );
}

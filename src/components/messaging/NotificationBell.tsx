import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/hooks/useMessages";

/**
 * Sininho global de notificações (MD-19) — usar no topbar dos perfis.
 */
export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const PRIO_DOT: Record<string, string> = {
    baixa: "bg-slate-400",
    media: "bg-blue-500",
    alta: "bg-amber-500",
    critica: "bg-red-500",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-lg hover:bg-muted/60 flex items-center justify-center"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5 text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[360px] max-h-[480px] bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <h3 className="text-sm font-bold">Notificações</h3>
              <button
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="text-[11px] font-semibold text-[hsl(217,91%,50%)] hover:underline disabled:opacity-40 flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Nenhuma notificação.
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      if (n.link) navigate(n.link);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/40 transition ${
                      n.read_at ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${PRIO_DOT[n.priority] || "bg-slate-400"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{n.title}</div>
                        {n.body && (
                          <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(n.created_at).toLocaleString("pt-BR")}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

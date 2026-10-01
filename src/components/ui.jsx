import { useEffect, useRef, useState } from "react";
import { X, Info, Columns3, AlertTriangle, Lock } from "lucide-react";
import { fmtDate } from "../lib/dates.js";
import { useApp } from "../lib/store.jsx";

export const ICON = (name) => `${import.meta.env.BASE_URL}assets/icons/${name}.webp`;
/** Icon 3D trang trí: alt rỗng vì luôn có nhãn chữ bên cạnh. */
export const Icon3D = ({ name, size = 64 }) => <img className="icon3d" src={ICON(name)} width={size} height={size} alt="" loading="lazy" />;

export const Btn = ({ kind = "", sm, icon: I, children, ...p }) => (
  <button type="button" className={`btn ${kind} ${sm ? "sm" : ""}`} {...p}>{I && <I size={sm ? 14 : 16} aria-hidden />}{children}</button>
);
/** Nhãn bọc ô nhập => gắn nhãn đúng cho trình đọc màn hình. group=true khi bên trong nhiều điều khiển. */
export const Field = ({ label, children, hint, span, group }) => {
  const style = span ? { gridColumn: `span ${span}` } : undefined;
  const inner = <><span className="lbl">{label}</span>{children}{hint && <span className="small mut" style={{ display: "block", marginTop: 3 }}>{hint}</span>}</>;
  return group
    ? <div className="field" role="group" aria-label={label} style={style}>{inner}</div>
    : <label className="field" style={{ display: "block", ...style }}>{inner}</label>;
};
export const Inp = (p) => <input className="inp" {...p} />;
export const Sel = ({ children, ...p }) => <select className="sel" {...p}>{children}</select>;
export const TA = (p) => <textarea className="ta" {...p} />;
export const Badge = ({ tone = "gray", children, title }) => <span className={`bdg ${tone}`} title={title}>{children}</span>;
export const Tag = ({ children }) => <span className="tag">{children}</span>;

export const fmtD = (d) => fmtDate(d) || "—";
const nf = new Intl.NumberFormat("vi-VN");
export const money = (v, cur = "VND") => (v === null || v === undefined || v === "" ? "—" : `${nf.format(Math.round(Number(v)))}${cur && cur !== "VND" ? " " + cur : ""}`);
export const ty = (v) => (v === null || v === undefined ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(v) / 1e9)} tỷ`);

export function Modal({ title, sub, size = "", onClose, children, footer, labelledBy = "modal-title" }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    el?.querySelector("input,select,textarea,button:not(.x)")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Tab" && el) {                                     // giữ focus trong hộp thoại
        const f = [...el.querySelectorAll("button,input,select,textarea,a[href],[tabindex='0']")].filter((x) => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        <div className="modal-h">
          <div><h3 id={labelledBy}>{title}</h3>{sub && <div className="small mut" style={{ marginTop: 3 }}>{sub}</div>}</div>
          <button className="x" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/** Hỏi lý do (bắt buộc khi đổi hạn / giá trị / trạng thái). Trả về Promise<string|null>. */
let reasonResolver = null;
let setReasonState = null;
export function askReason(title, extra) {
  return new Promise((res) => { reasonResolver = res; setReasonState?.({ title, extra, value: "", opt: extra?.defaultOpt ?? true }); });
}
export function ReasonHost() {
  const [st, setSt] = useState(null);
  setReasonState = setSt;
  if (!st) return null;
  const done = (v) => { const r = reasonResolver; reasonResolver = null; setSt(null); r?.(v); };
  return (
    <Modal title={st.title} onClose={() => done(null)} footer={<>
      <Btn kind="ghost" onClick={() => done(null)}>Hủy</Btn>
      <Btn disabled={!st.value.trim()} onClick={() => done(st.extra?.optLabel ? { reason: st.value.trim(), opt: st.opt } : st.value.trim())}>Xác nhận</Btn>
    </>}>
      <Field label="Lý do thay đổi (bắt buộc, lưu vào lịch sử)">
        <TA value={st.value} onChange={(e) => setSt({ ...st, value: e.target.value })} placeholder="VD: Theo văn bản số ..., chờ ý kiến thẩm định..." />
      </Field>
      {st.extra?.optLabel && (
        <label className="row"><input type="checkbox" checked={st.opt} onChange={(e) => setSt({ ...st, opt: e.target.checked })} /> {st.extra.optLabel}</label>
      )}
      {st.extra?.note && <div className="note" style={{ marginTop: 8 }}>{st.extra.note}</div>}
    </Modal>
  );
}

export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return <div className={`toast ${toast.tone === "err" ? "err" : ""}`} role={toast.tone === "err" ? "alert" : "status"}>{toast.msg}</div>;
}

export const Empty = ({ icon = "06-progress", title = "Chưa có dữ liệu", children }) => (
  <div className="empty"><Icon3D name={icon} size={72} /><div className="b" style={{ color: "var(--text)" }}>{title}</div>{children && <div className="small">{children}</div>}</div>
);
export const NoPerm = ({ children = "Anh/chị không có quyền thực hiện thao tác này." }) => (
  <div className="empty"><Lock size={28} aria-hidden /><div className="b">Không có quyền</div><div className="small">{children}</div></div>
);
export const Loading = ({ text = "Đang tải dữ liệu…" }) => <div className="empty" role="status"><div className="b">{text}</div></div>;
export const ErrorBox = ({ title = "Không tải được dữ liệu", children, onRetry }) => (
  <div className="empty" role="alert"><AlertTriangle size={30} color="var(--red)" aria-hidden /><div className="b">{title}</div>
    <div className="small" style={{ maxWidth: 560, margin: "4px auto 10px" }}>{children}</div>{onRetry && <Btn kind="ghost" onClick={onRetry}>Thử lại</Btn>}</div>
);

export const InfoTip = ({ text }) => (
  <span title={text} aria-label={text} role="img" style={{ display: "inline-flex", color: "var(--muted)", cursor: "help", verticalAlign: "middle" }}><Info size={14} /></span>
);

export function Progress({ value }) {
  if (value === null || value === undefined) return <span className="small mut">Chưa có bộ mốc</span>;
  const p = Math.round(value * 100);
  return (
    <div className="prog" title="Tiến độ các mốc: tỷ lệ mốc áp dụng đã hoàn thành (theo trọng số)">
      <div className="prog-bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ các mốc"><i style={{ width: `${p}%` }} /></div>
      <span className="small num">{p}%</span>
    </div>
  );
}

/** Menu bật/tắt cột */
export function ColumnMenu({ columns, visible, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="rel" ref={ref}>
      <Btn kind="ghost" sm icon={Columns3} aria-expanded={open} onClick={() => setOpen(!open)}>Cột</Btn>
      {open && (
        <div className="menu" role="menu">
          {columns.map((c) => (
            <label key={c.key}><input type="checkbox" disabled={c.fixed} checked={visible.includes(c.key)}
              onChange={(e) => onChange(e.target.checked ? [...visible, c.key] : visible.filter((k) => k !== c.key))} />{c.label}</label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bảng có cột cố định (2 cột đầu), cuộn ngang/dọc trong vùng bảng. */
export function DataTable({ columns, rows, rowKey = (r) => r.id, onRow, empty, short, hl }) {
  // Thanh cuộn ngang phụ ở TRÊN bảng (đồng bộ với thanh dưới) — không phải kéo xuống cuối bảng mới cuộn được
  const wrap = useRef(null), top = useRef(null), inner = useRef(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const upd = () => { setOver(w.scrollWidth > w.clientWidth + 2); if (inner.current) inner.current.style.width = `${w.scrollWidth}px`; };
    upd();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(upd) : null;
    ro?.observe(w); if (w.firstChild) ro?.observe(w.firstChild);
    return () => ro?.disconnect();
  }, [rows, columns, over]);
  const sync = (from, to) => { if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft) to.current.scrollLeft = from.current.scrollLeft; };
  if (!rows.length) return empty || <Empty title="Không có hồ sơ phù hợp bộ lọc" />;
  return (
    <>
    {over && <div className="top-scroll" ref={top} onScroll={() => sync(top, wrap)} aria-hidden><div ref={inner} style={{ height: 1 }} /></div>}
    <div className={`tbl-wrap ${short ? "short" : ""}`} ref={wrap} onScroll={() => sync(wrap, top)}>
      <table className="tbl">
        <thead><tr>{columns.map((c, i) => <th key={c.key} className={`${i === 0 && c.stick ? "stick1" : ""} ${i === 1 && c.stick ? "stick2" : ""} ${c.right ? "r" : ""}`} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={hl?.(r) ? "hl" : ""} onDoubleClick={() => onRow?.(r)}>
              {columns.map((c, i) => <td key={c.key} className={`${i === 0 && c.stick ? "stick1" : ""} ${i === 1 && c.stick ? "stick2" : ""} ${c.right ? "r" : ""} ${c.cls || ""}`}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export const useLocalState = (key, init) => {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; } });
  const set = (n) => { setV(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* bỏ qua */ } };
  return [v, set];
};

export function Banner({ icon, title, sub, children }) {
  return (
    <header className="banner">
      <div className="banner-in">
        <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
          {icon && <Icon3D name={icon} size={64} />}
          <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
        </div>
        {children && <div className="row">{children}</div>}
      </div>
    </header>
  );
}

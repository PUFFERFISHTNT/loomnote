export function ComingSoon({ title, icon, desc }: { title: string; icon: string; desc: string }) {
  return (
    <div className="view">
      <h1 className="view-title">{title}</h1>
      <p className="view-sub">该视图按里程碑排期开发中。</p>
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div className="big">{icon}</div>
        <b>{title} · 即将上线</b>
        <span>{desc}</span>
      </div>
    </div>
  )
}
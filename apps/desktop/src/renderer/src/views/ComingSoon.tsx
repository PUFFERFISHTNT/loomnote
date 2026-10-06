import { t, useLang } from '../i18n.js'

export function ComingSoon({ title, icon, desc }: { title: string; icon: string; desc: string }) {
  useLang()
  return (
    <div className="view">
      <h1 className="view-title">{title}</h1>
      <p className="view-sub">{t('comingSoon.body')}</p>
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div className="big">{icon}</div>
        <b>
          {title} · {t('comingSoon.title')}
        </b>
        <span>{desc}</span>
      </div>
    </div>
  )
}

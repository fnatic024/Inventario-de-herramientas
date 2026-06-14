import { useState, useEffect } from 'react'
import { auth, db, googleProvider } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore'

const CATS = ['Medición','Corte','Fijación','Electricidad','Levantamiento','Protección','Otro']

export default function App() {
  const [user, setUser] = useState(null)
  const [tools, setTools] = useState([])
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('tools')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setLoading(false) }), [])

  useEffect(() => {
    if (!user) return
    const uid = user.uid
    const q1 = query(collection(db, `users/${uid}/tools`), orderBy('createdAt', 'desc'))
    const q2 = query(collection(db, `users/${uid}/logs`), orderBy('createdAt', 'desc'))
    const u1 = onSnapshot(q1, s => setTools(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u2 = onSnapshot(q2, s => setLogs(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { u1(); u2() }
  }, [user])

  const avail = (toolId) => {
    const tl = logs.filter(l => l.toolId === toolId)
    const out = tl.filter(l => l.dir === 'out').reduce((a, l) => a + (l.qty || 1), 0)
    const inn = tl.filter(l => l.dir === 'in').reduce((a, l) => a + (l.qty || 1), 0)
    const tool = tools.find(t => t.id === toolId)
    return Math.max(0, (tool?.qty || 0) - (out - inn))
  }

  const saveTool = async () => {
    const uid = user.uid
    const data = { ...form, qty: parseInt(form.qty) || 1, createdAt: serverTimestamp() }
    if (modal.id) await updateDoc(doc(db, `users/${uid}/tools`, modal.id), data)
    else await addDoc(collection(db, `users/${uid}/tools`), data)
    setModal(null)
  }

  const deleteTool = async (id) => {
    if (!confirm('¿Eliminar herramienta?')) return
    await deleteDoc(doc(db, `users/${user.uid}/tools`, id))
  }

  const saveMove = async () => {
    await addDoc(collection(db, `users/${user.uid}/logs`), {
      toolId: modal.tool.id,
      toolName: modal.tool.name,
      dir: modal.dir,
      person: form.person,
      qty: parseInt(form.qty) || 1,
      date: form.date,
      notes: form.notes || '',
      createdAt: serverTimestamp()
    })
    setModal(null)
  }

  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const filtered = tools.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div style={S.center}><div style={S.spinner}/></div>

  if (!user) return (
    <div style={S.loginWrap}>
      <div style={S.loginCard}>
        <div style={S.logoIcon}>🔧</div>
        <h1 style={S.loginTitle}>HerraControl</h1>
        <p style={S.loginSub}>Inventario de herramientas de construcción</p>
        <button style={S.btnGoogle} onClick={() => signInWithPopup(auth, googleProvider)}>
          <span style={{fontSize:18}}>G</span> Entrar con Google
        </button>
      </div>
    </div>
  )

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logo}><span style={S.logoIconSm}>🔧</span><div><div style={S.logoText}>HerraControl</div><div style={S.logoSub}>{user.displayName}</div></div></div>
          <div style={{display:'flex',gap:8}}>
            <button style={S.btnPrimary} onClick={() => { setForm({ name:'', category:'Otro', qty:1, owner:'Mía', lender:'', notes:'' }); setModal({ type:'tool' }) }}>+ Agregar</button>
            <button style={S.btnOut2} onClick={() => signOut(auth)}>Salir</button>
          </div>
        </div>
      </div>

      <div style={S.main}>
        {/* Stats */}
        <div style={S.stats}>
          {[
            { label:'Herramientas', val: tools.length, color:'#E8EBF0' },
            { label:'Disponibles', val: tools.reduce((a,t) => a + avail(t.id), 0), color:'#3DD68C' },
            { label:'Fuera', val: tools.reduce((a,t) => a + (t.qty - avail(t.id)), 0), color:'#F07D00' },
          ].map(s => (
            <div key={s.label} style={S.stat}>
              <div style={{ ...S.statVal, color: s.color }}>{s.val}</div>
              <div style={S.statLbl}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {[['tools','🔧 Herramientas'],['activity','📋 Actividad']].map(([id,lbl]) => (
            <button key={id} style={{ ...S.tab, ...(tab===id ? S.tabActive : {}) }} onClick={() => setTab(id)}>{lbl}</button>
          ))}
        </div>

        {tab === 'tools' && <>
          <input style={S.search} placeholder="🔍 Buscar herramienta..." value={search} onChange={e => setSearch(e.target.value)} />
          {filtered.length === 0
            ? <div style={S.empty}><div style={{fontSize:48}}>🔧</div><p>No hay herramientas aún.</p><button style={S.btnPrimary} onClick={() => { setForm({ name:'', category:'Otro', qty:1, owner:'Mía', lender:'', notes:'' }); setModal({ type:'tool' }) }}>+ Agregar primera herramienta</button></div>
            : <div style={S.grid}>
                {filtered.map(t => {
                  const av = avail(t.id)
                  const pct = Math.round((av / t.qty) * 100)
                  const fillColor = av === 0 ? '#FF5B5B' : av < t.qty ? '#F07D00' : '#3DD68C'
                  const toolLogs = logs.filter(l => l.toolId === t.id)
                  const lastOut = toolLogs.filter(l => l.dir === 'out').sort((a,b) => b.date > a.date ? 1 : -1)[0]
                  const daysOut = lastOut && av < t.qty ? Math.floor((Date.now() - new Date(lastOut.date + 'T12:00:00')) / 86400000) : null
                  return (
                    <div key={t.id} style={{ ...S.card, borderColor: av < t.qty ? '#F07D0055' : '#2E3440' }}>
                      <div style={S.cardTop}>
                        <div style={S.cardName}>{t.name}</div>
                        <span style={S.catBadge}>{t.category}</span>
                      </div>
                      {t.owner === 'Prestada' && <div style={S.lenderBadge}>📦 Prestada de {t.lender}</div>}
                      {t.notes ? <div style={S.notes}>{t.notes}</div> : null}
                      <div style={S.availRow}>
                        <div style={S.bar}><div style={{ ...S.barFill, width: pct+'%', background: fillColor }} /></div>
                        <span style={{ ...S.availLbl, color: fillColor }}>{av}/{t.qty}</span>
                      </div>
                      {daysOut !== null && daysOut >= 3 && <div style={S.warnStrip}>⚠️ Fuera hace {daysOut} días</div>}
                      <div style={S.cardActions}>
                        <button style={{ ...S.btnAct, ...(av > 0 ? S.btnRed : S.btnDis) }} disabled={av <= 0} onClick={() => { setForm({ person:'', qty:1, date: new Date().toISOString().slice(0,10), notes:'' }); setModal({ type:'move', tool:t, dir:'out' }) }}>↗ Salida</button>
                        <button style={{ ...S.btnAct, ...(av < t.qty ? S.btnGreen : S.btnDis) }} disabled={av >= t.qty} onClick={() => { setForm({ person:'', qty:1, date: new Date().toISOString().slice(0,10), notes:'' }); setModal({ type:'move', tool:t, dir:'in' }) }}>↙ Entrada</button>
                        <button style={{ ...S.btnAct, ...S.btnMuted }} onClick={() => { const tl = logs.filter(l => l.toolId === t.id); setModal({ type:'history', tool:t, tl }) }}>📋 Historial</button>
                        <button style={{ ...S.btnAct, ...S.btnMuted }} onClick={() => { setForm({ ...t }); setModal({ type:'tool', id:t.id }) }}>✏️</button>
                        <button style={{ ...S.btnAct, ...S.btnMuted, color:'#FF5B5B' }} onClick={() => deleteTool(t.id)}>🗑</button>
                      </div>
                    </div>
                  )
                })}
              </div>
          }
        </>}

        {tab === 'activity' && (
          <div style={S.actList}>
            {logs.length === 0
              ? <div style={S.empty}><p>Sin movimientos aún.</p></div>
              : logs.slice(0,50).map(l => (
                <div key={l.id} style={S.actItem}>
                  <div style={{ ...S.actIcon, background: l.dir === 'out' ? '#FF5B5B22' : '#3DD68C22' }}>{l.dir === 'out' ? '↗' : '↙'}</div>
                  <div style={S.actInfo}>
                    <div style={S.actName}>{l.toolName}</div>
                    <div style={S.actDetail}>{l.dir === 'out' ? 'Salida con' : 'Entrada de'} <span style={{color:'#FF9A2E'}}>{l.person}</span>{l.qty > 1 ? ` · ${l.qty} unid.` : ''}{l.notes ? ` · ${l.notes}` : ''}</div>
                  </div>
                  <div style={S.actDate}>{fmtDate(l.date)}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Modal Tool */}
      {modal?.type === 'tool' && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}><span style={S.modalTitle}>{modal.id ? 'Editar' : 'Nueva'} herramienta</span><button style={S.btnClose} onClick={() => setModal(null)}>✕</button></div>
            <div style={S.modalBody}>
              {[['Nombre','name','text','Ej. Taladro percutor'],['Cantidad','qty','number','1'],['Notas','notes','text','Estado, accesorios...']].map(([lbl,key,type,ph]) => (
                <div key={key} style={S.field}><label style={S.lbl}>{lbl}</label><input style={S.inp} type={type} placeholder={ph} value={form[key]||''} onChange={e => setForm(f => ({...f,[key]:e.target.value}))} /></div>
              ))}
              <div style={S.field}><label style={S.lbl}>Categoría</label><select style={S.inp} value={form.category||'Otro'} onChange={e => setForm(f => ({...f,category:e.target.value}))}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
              <div style={S.field}><label style={S.lbl}>¿De quién es?</label>
                <div style={{display:'flex',gap:8}}>
                  {['Mía','Prestada'].map(o => <button key={o} style={{...S.ownerBtn,...(form.owner===o?S.ownerActive:{})}} onClick={() => setForm(f => ({...f,owner:o}))}>{o}</button>)}
                </div>
              </div>
              {form.owner === 'Prestada' && <div style={S.field}><label style={S.lbl}>Nombre del dueño</label><input style={S.inp} placeholder="¿Quién te la prestó?" value={form.lender||''} onChange={e => setForm(f => ({...f,lender:e.target.value}))} /></div>}
              <div style={S.formActions}><button style={S.btnCancel} onClick={() => setModal(null)}>Cancelar</button><button style={S.btnSubmit} onClick={saveTool}>{modal.id ? 'Guardar' : 'Agregar'}</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Move */}
      {modal?.type === 'move' && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}><span style={S.modalTitle}>{modal.dir === 'out' ? 'Salida' : 'Entrada'} — {modal.tool.name}</span><button style={S.btnClose} onClick={() => setModal(null)}>✕</button></div>
            <div style={S.modalBody}>
              <div style={S.field}><label style={S.lbl}>{modal.dir === 'out' ? '¿A quién se la llevan?' : '¿Quién la regresa?'}</label><input style={S.inp} placeholder="Nombre" value={form.person||''} onChange={e => setForm(f => ({...f,person:e.target.value}))} /></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={S.field}><label style={S.lbl}>Fecha</label><input style={S.inp} type="date" value={form.date||''} onChange={e => setForm(f => ({...f,date:e.target.value}))} /></div>
                <div style={S.field}><label style={S.lbl}>Cantidad</label><input style={S.inp} type="number" min="1" value={form.qty||1} onChange={e => setForm(f => ({...f,qty:e.target.value}))} /></div>
              </div>
              <div style={S.field}><label style={S.lbl}>Notas</label><input style={S.inp} placeholder="Opcional" value={form.notes||''} onChange={e => setForm(f => ({...f,notes:e.target.value}))} /></div>
              <div style={S.formActions}><button style={S.btnCancel} onClick={() => setModal(null)}>Cancelar</button><button style={{...S.btnSubmit,background:modal.dir==='out'?'#FF5B5B':'#3DD68C'}} onClick={saveMove}>Confirmar</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal History */}
      {modal?.type === 'history' && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}><span style={S.modalTitle}>Historial — {modal.tool.name}</span><button style={S.btnClose} onClick={() => setModal(null)}>✕</button></div>
            <div style={S.modalBody}>
              {modal.tl.length === 0
                ? <div style={S.empty}><p>Sin movimientos.</p></div>
                : modal.tl.sort((a,b) => b.date > a.date ? 1 : -1).map(l => (
                  <div key={l.id} style={S.actItem}>
                    <div style={{...S.actIcon,background:l.dir==='out'?'#FF5B5B22':'#3DD68C22'}}>{l.dir==='out'?'↗':'↙'}</div>
                    <div style={S.actInfo}>
                      <div style={S.actName}>{l.dir==='out'?'Salió con':'Regresó de'} <span style={{color:'#FF9A2E'}}>{l.person}</span></div>
                      {l.notes ? <div style={S.actDetail}>{l.notes}</div> : null}
                    </div>
                    <div style={S.actDate}>{fmtDate(l.date)}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  app:{ background:'#141619', minHeight:'100vh', fontFamily:"'Segoe UI',system-ui,sans-serif", color:'#E8EBF0' },
  center:{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#141619' },
  spinner:{ width:40, height:40, border:'4px solid #2E3440', borderTop:'4px solid #F07D00', borderRadius:'50%', animation:'spin 1s linear infinite' },
  loginWrap:{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#141619', padding:16 },
  loginCard:{ background:'#1E2128', border:'1px solid #2E3440', borderRadius:16, padding:40, textAlign:'center', maxWidth:360, width:'100%' },
  logoIcon:{ fontSize:48, marginBottom:12 },
  loginTitle:{ fontSize:28, fontWeight:800, margin:'0 0 8px' },
  loginSub:{ color:'#6B7689', fontSize:14, marginBottom:32 },
  btnGoogle:{ display:'flex', alignItems:'center', gap:10, background:'#fff', color:'#222', border:'none', borderRadius:10, padding:'12px 24px', fontWeight:700, fontSize:15, cursor:'pointer', width:'100%', justifyContent:'center' },
  header:{ background:'#1E2128', borderBottom:'1px solid #2E3440', padding:'14px 20px', position:'sticky', top:0, zIndex:50 },
  headerInner:{ maxWidth:960, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between' },
  logo:{ display:'flex', alignItems:'center', gap:10 },
  logoIconSm:{ fontSize:24 },
  logoText:{ fontWeight:800, fontSize:17 },
  logoSub:{ fontSize:11, color:'#6B7689' },
  btnPrimary:{ background:'#F07D00', border:'none', borderRadius:9, color:'#fff', fontWeight:700, fontSize:14, padding:'9px 16px', cursor:'pointer' },
  btnOut2:{ background:'none', border:'1px solid #2E3440', borderRadius:9, color:'#6B7689', fontWeight:600, fontSize:13, padding:'9px 12px', cursor:'pointer' },
  main:{ maxWidth:960, margin:'0 auto', padding:'20px 16px' },
  stats:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 },
  stat:{ background:'#1E2128', border:'1px solid #2E3440', borderRadius:10, padding:'14px' },
  statVal:{ fontSize:26, fontWeight:800, lineHeight:1 },
  statLbl:{ fontSize:11, color:'#6B7689', marginTop:3 },
  tabs:{ display:'flex', gap:4, background:'#1E2128', padding:4, borderRadius:10, border:'1px solid #2E3440', marginBottom:16 },
  tab:{ flex:1, padding:'9px', border:'none', borderRadius:8, background:'none', color:'#6B7689', fontWeight:700, fontSize:13, cursor:'pointer' },
  tabActive:{ background:'#F07D00', color:'#fff' },
  search:{ width:'100%', background:'#1E2128', border:'1px solid #2E3440', borderRadius:8, color:'#E8EBF0', padding:'10px 14px', fontSize:14, outline:'none', marginBottom:16, boxSizing:'border-box' },
  grid:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12 },
  card:{ background:'#252930', border:'1px solid #2E3440', borderRadius:12, padding:'14px', display:'flex', flexDirection:'column', gap:8 },
  cardTop:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 },
  cardName:{ fontWeight:700, fontSize:15 },
  catBadge:{ background:'#6B768922', color:'#6B7689', border:'1px solid #6B768944', borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' },
  lenderBadge:{ background:'#F5C51822', color:'#F5C518', border:'1px solid #F5C51844', borderRadius:6, padding:'4px 10px', fontSize:12 },
  notes:{ fontSize:12, color:'#6B7689' },
  availRow:{ display:'flex', alignItems:'center', gap:8 },
  bar:{ flex:1, height:6, background:'#141619', borderRadius:99, overflow:'hidden' },
  barFill:{ height:'100%', borderRadius:99, transition:'width .4s' },
  availLbl:{ fontSize:12, fontWeight:700, whiteSpace:'nowrap' },
  warnStrip:{ background:'#F07D0018', border:'1px solid #F07D0033', borderRadius:6, padding:'5px 10px', fontSize:12, color:'#F07D00' },
  cardActions:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto auto', gap:6, marginTop:4 },
  btnAct:{ padding:'7px 4px', borderRadius:8, fontSize:11, fontWeight:700, border:'1px solid #2E3440', background:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 },
  btnRed:{ borderColor:'#FF5B5B88', background:'#FF5B5B18', color:'#FF5B5B' },
  btnGreen:{ borderColor:'#3DD68C88', background:'#3DD68C18', color:'#3DD68C' },
  btnMuted:{ color:'#6B7689' },
  btnDis:{ color:'#2E3440', cursor:'default' },
  empty:{ textAlign:'center', padding:'60px 0', color:'#6B7689', display:'flex', flexDirection:'column', alignItems:'center', gap:12 },
  actList:{ background:'#1E2128', border:'1px solid #2E3440', borderRadius:12, overflow:'hidden' },
  actItem:{ display:'flex', gap:12, alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #2E3440' },
  actIcon:{ width:36, height:36, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 },
  actInfo:{ flex:1, minWidth:0 },
  actName:{ fontSize:14, fontWeight:600 },
  actDetail:{ fontSize:12, color:'#6B7689' },
  actDate:{ fontSize:12, color:'#6B7689', flexShrink:0 },
  overlay:{ position:'fixed', inset:0, background:'#000A', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modalBox:{ background:'#1E2128', border:'1px solid #2E3440', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' },
  modalHead:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px 14px', borderBottom:'1px solid #2E3440' },
  modalTitle:{ fontWeight:700, fontSize:16 },
  btnClose:{ background:'none', border:'none', color:'#6B7689', fontSize:18, cursor:'pointer' },
  modalBody:{ padding:20 },
  field:{ marginBottom:14 },
  lbl:{ display:'block', fontSize:12, fontWeight:600, color:'#6B7689', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  inp:{ background:'#252930', border:'1px solid #2E3440', border

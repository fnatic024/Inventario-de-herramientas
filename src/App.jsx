import { useState, useEffect, useRef } from 'react'
import { auth, db, googleProvider } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'

const CATS = ['Medición','Corte','Fijación','Electricidad','Levantamiento','Protección','Otro']

const compressImage = (file) => new Promise(resolve => {
  const reader = new FileReader()
  reader.onload = e => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const max = 800
      let w = img.width, h = img.height
      if (w > h && w > max) { h = h * max / w; w = max }
      else if (h > max) { w = w * max / h; h = max }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.6))
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
})

export default function App() {
  const [user, setUser] = useState(null)
  const [tools, setTools] = useState([])
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('tools')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const photoRef = useRef()

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setLoading(false) }), [])

  useEffect(() => {
    if (!user) return
    const uid = user.uid
    const u1 = onSnapshot(query(collection(db, `users/${uid}/tools`), orderBy('createdAt','desc')), s => setTools(s.docs.map(d => ({id:d.id,...d.data()}))))
    const u2 = onSnapshot(query(collection(db, `users/${uid}/logs`), orderBy('createdAt','desc')), s => setLogs(s.docs.map(d => ({id:d.id,...d.data()}))))
    return () => { u1(); u2() }
  }, [user])

  const avail = id => {
    const tl = logs.filter(l => l.toolId === id)
    const o = tl.filter(l => l.dir==='out').reduce((a,l) => a+(l.qty||1), 0)
    const i = tl.filter(l => l.dir==='in').reduce((a,l) => a+(l.qty||1), 0)
    return Math.max(0, (tools.find(t=>t.id===id)?.qty||0)-(o-i))
  }

  const saveTool = async () => {
    try {
      const uid = user.uid
      const data = {...form, qty:parseInt(form.qty)||1, createdAt:serverTimestamp()}
      if (modal.id) await updateDoc(doc(db,`users/${uid}/tools`,modal.id), data)
      else await addDoc(collection(db,`users/${uid}/tools`), data)
    } catch(e) { console.error(e) }
    setModal(null)
  }

  const deleteTool = async id => {
    if (!confirm('¿Eliminar?')) return
    await deleteDoc(doc(db,`users/${user.uid}/tools`,id))
  }

  const saveMove = async () => {
    await addDoc(collection(db,`users/${user.uid}/logs`), {
      toolId:modal.tool.id, toolName:modal.tool.name, dir:modal.dir,
      person:form.person, qty:parseInt(form.qty)||1, date:form.date,
      notes:form.notes||'', createdAt:serverTimestamp()
    })
    setModal(null)
  }

  const handlePhoto = async e => {
    const file = e.target.files[0]
    if (!file) return
    const compressed = await compressImage(file)
    setForm(f => ({...f, photo: compressed}))
  }

  const fmt = d => d ? new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '—'
  const filtered = tools.filter(t => t.name?.toLowerCase().includes(search.toLowerCase()))
  const H='#141619',S2='#1E2128',C='#252930',B='#2E3440',O='#F07D00',G='#3DD68C',R='#FF5B5B',M='#6B7689'

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:H,color:O,fontSize:32}}>🔧</div>

  if (!user) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:H}}>
      <div style={{background:S2,border:`1px solid ${B}`,borderRadius:16,padding:40,textAlign:'center',maxWidth:360,width:'100%'}}>
        <div style={{fontSize:48}}>🔧</div>
        <h1 style={{color:'#E8EBF0',fontSize:28,fontWeight:800,margin:'12px 0 8px'}}>HerraControl</h1>
        <p style={{color:M,fontSize:14,marginBottom:32}}>Inventario de herramientas</p>
        <button onClick={() => signInWithPopup(auth,googleProvider)} style={{display:'flex',alignItems:'center',gap:10,background:'#fff',color:'#222',border:'none',borderRadius:10,padding:'12px 24px',fontWeight:700,fontSize:15,cursor:'pointer',width:'100%',justifyContent:'center'}}><b>G</b> Entrar con Google</button>
      </div>
    </div>
  )

  return (
    <div style={{background:H,minHeight:'100vh',fontFamily:'system-ui,sans-serif',color:'#E8EBF0'}}>
      <div style={{background:S2,borderBottom:`1px solid ${B}`,padding:'14px 20px',position:'sticky',top:0,zIndex:50}}>
        <div style={{maxWidth:960,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:24}}>🔧</span>
            <div><div style={{fontWeight:800,fontSize:17}}>HerraControl</div><div style={{fontSize:11,color:M}}>{user.displayName}</div></div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => {setForm({name:'',category:'Otro',qty:1,owner:'Mía',lender:'',notes:'',photo:null});setModal({type:'tool'})}} style={{background:O,border:'none',borderRadius:9,color:'#fff',fontWeight:700,fontSize:14,padding:'9px 16px',cursor:'pointer'}}>+ Agregar</button>
            <button onClick={() => signOut(auth)} style={{background:'none',border:`1px solid ${B}`,borderRadius:9,color:M,fontWeight:600,fontSize:13,padding:'9px 12px',cursor:'pointer'}}>Salir</button>
          </div>
        </div>
      </div>
      <div style={{maxWidth:960,margin:'0 auto',padding:'20px 16px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:20}}>
          {[{l:'Herramientas',v:tools.length,c:'#E8EBF0'},{l:'Disponibles',v:tools.reduce((a,t)=>a+avail(t.id),0),c:G},{l:'Fuera',v:tools.reduce((a,t)=>a+(t.qty-avail(t.id)),0),c:O}].map(s=>(
            <div key={s.l} style={{background:S2,border:`1px solid ${B}`,borderRadius:10,padding:14}}>
              <div style={{fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:11,color:M,marginTop:3}}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:4,background:S2,padding:4,borderRadius:10,border:`1px solid ${B}`,marginBottom:16}}>
          {[['tools','🔧 Herramientas'],['activity','📋 Actividad']].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:9,border:'none',borderRadius:8,background:tab===id?O:'none',color:tab===id?'#fff':M,fontWeight:700,fontSize:13,cursor:'pointer'}}>{lbl}</button>
          ))}
        </div>
        {tab==='tools'&&<>
          <input style={{width:'100%',background:S2,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 14px',fontSize:14,outline:'none',marginBottom:16,boxSizing:'border-box'}} placeholder="🔍 Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {filtered.length===0
            ?<div style={{textAlign:'center',padding:'60px 0',color:M}}><div style={{fontSize:48}}>🔧</div><p>Sin herramientas aún.</p></div>
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}}>
              {filtered.map(t=>{
                const av=avail(t.id),pct=Math.round((av/t.qty)*100),fc=av===0?R:av<t.qty?O:G
                const lo=logs.filter(l=>l.toolId===t.id&&l.dir==='out').sort((a,b)=>b.date>a.date?1:-1)[0]
                const dy=lo&&av<t.qty?Math.floor((Date.now()-new Date(lo.date+'T12:00:00'))/86400000):null
                return(
                  <div key={t.id} style={{background:C,border:`1px solid ${av<t.qty?O+'55':B}`,borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                    {t.photo?<img src={t.photo} alt={t.name} style={{width:'100%',height:120,objectFit:'cover'}}/>:<div style={{width:'100%',height:120,background:H,display:'flex',alignItems:'center',justifyContent:'center',fontSize:40,opacity:.3}}>🔧</div>}
                    <div style={{padding:14,display:'flex',flexDirection:'column',gap:8}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                        <div style={{fontWeight:700,fontSize:15}}>{t.name}</div>
                        <span style={{background:M+'22',color:M,border:`1px solid ${M}44`,borderRadius:4,padding:'2px 8px',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>{t.category}</span>
                      </div>
                      {t.owner==='Prestada'&&<div style={{background:'#F5C51822',color:'#F5C518',border:'1px solid #F5C51844',borderRadius:6,padding:'4px 10px',fontSize:12}}>📦 Prestada de {t.lender}</div>}
                      {t.notes&&<div style={{fontSize:12,color:M}}>{t.notes}</div>}
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1,height:6,background:H,borderRadius:99,overflow:'hidden'}}><div style={{width:pct+'%',height:'100%',background:fc,borderRadius:99}}/></div>
                        <span style={{fontSize:12,fontWeight:700,color:fc}}>{av}/{t.qty}</span>
                      </div>
                      {dy!==null&&dy>=3&&<div style={{background:O+'18',border:`1px solid ${O}33`,borderRadius:6,padding:'5px 10px',fontSize:12,color:O}}>⚠️ Fuera hace {dy} días</div>}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto auto',gap:6}}>
                        <button disabled={av<=0} onClick={()=>{setForm({person:'',qty:1,date:new Date().toISOString().slice(0,10),notes:''});setModal({type:'move',tool:t,dir:'out'})}} style={{padding:'7px 4px',borderRadius:8,fontSize:11,fontWeight:700,border:`1px solid ${av>0?R+'88':B}`,background:av>0?R+'18':'none',color:av>0?R:B,cursor:av>0?'pointer':'default'}}>↗ Salida</button>
                        <button disabled={av>=t.qty} onClick={()=>{setForm({person:'',qty:1,date:new Date().toISOString().slice(0,10),notes:''});setModal({type:'move',tool:t,dir:'in'})}} style={{padding:'7px 4px',borderRadius:8,fontSize:11,fontWeight:700,border:`1px solid ${av<t.qty?G+'88':B}`,background:av<t.qty?G+'18':'none',color:av<t.qty?G:B,cursor:av<t.qty?'pointer':'default'}}>↙ Entrada</button>
                        <button onClick={()=>setModal({type:'history',tool:t,tl:logs.filter(l=>l.toolId===t.id)})} style={{padding:'7px 4px',borderRadius:8,fontSize:11,border:`1px solid ${B}`,background:'none',color:M,cursor:'pointer'}}>📋</button>
                        <button onClick={()=>{setForm({...t});setModal({type:'tool',id:t.id})}} style={{padding:'7px 4px',borderRadius:8,fontSize:11,border:`1px solid ${B}`,background:'none',color:M,cursor:'pointer'}}>✏️</button>
                        <button onClick={()=>deleteTool(t.id)} style={{padding:'7px 4px',borderRadius:8,fontSize:11,border:`1px solid ${B}`,background:'none',color:R,cursor:'pointer'}}>🗑</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          }
        </>}
        {tab==='activity'&&(
          <div style={{background:S2,border:`1px solid ${B}`,borderRadius:12,overflow:'hidden'}}>
            {logs.length===0?<div style={{textAlign:'center',padding:'50px 0',color:M}}>Sin movimientos aún.</div>
            :logs.slice(0,50).map(l=>(
              <div key={l.id} style={{display:'flex',gap:12,alignItems:'center',padding:'12px 16px',borderBottom:`1px solid ${B}`}}>
                <div style={{width:36,height:36,borderRadius:8,background:l.dir==='out'?R+'22':G+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>{l.dir==='out'?'↗':'↙'}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600}}>{l.toolName}</div>
                  <div style={{fontSize:12,color:M}}>{l.dir==='out'?'Salida con':'Entrada de'} <span style={{color:'#FF9A2E'}}>{l.person}</span>{l.notes?` · ${l.notes}`:''}</div>
                </div>
                <div style={{fontSize:12,color:M}}>{fmt(l.date)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {modal?.type==='tool'&&(
        <div style={{position:'fixed',inset:0,background:'#000A',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setModal(null)}>
          <div style={{background:S2,border:`1px solid ${B}`,borderRadius:14,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 20px 14px',borderBottom:`1px solid ${B}`}}>
              <span style={{fontWeight:700,fontSize:16}}>{modal.id?'Editar':'Nueva'} herramienta</span>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:M,fontSize:18,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{padding:20}}>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={handlePhoto}/>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>Foto</label>
                {form.photo
                  ?<div style={{position:'relative',marginBottom:8}}><img src={form.photo} style={{width:'100%',height:160,objectFit:'cover',borderRadius:8}}/><button onClick={()=>setForm(f=>({...f,photo:null}))} style={{position:'absolute',top:8,right:8,background:'#000A',border:'none',color:'#fff',borderRadius:6,padding:'4px 8px',cursor:'pointer',fontSize:12}}>Quitar</button></div>
                  :<button onClick={()=>photoRef.current.click()} style={{width:'100%',padding:16,border:`2px dashed ${B}`,borderRadius:8,background:'none',color:M,cursor:'pointer',fontSize:14}}>📷 Tomar / elegir foto</button>
                }
              </div>
              {[['Nombre','name','text','Ej. Taladro'],['Cantidad','qty','number','1'],['Notas','notes','text','Opcional']].map(([lb,k,tp,ph])=>(
                <div key={k} style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>{lb}</label>
                  <input style={{background:C,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 12px',width:'100%',fontSize:14,outline:'none',boxSizing:'border-box'}} type={tp} placeholder={ph} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
                </div>
              ))}
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>Categoría</label>
                <select style={{background:C,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 12px',width:'100%',fontSize:14,outline:'none'}} value={form.category||'Otro'} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                  {CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>¿De quién es?</label>
                <div style={{display:'flex',gap:8}}>
                  {['Mía','Prestada'].map(o=>(
                    <button key={o} onClick={()=>setForm(f=>({...f,owner:o}))} style={{flex:1,padding:10,borderRadius:8,border:`2px solid ${form.owner===o?O:B}`,background:form.owner===o?O+'22':C,color:form.owner===o?O:M,fontWeight:700,cursor:'pointer',fontSize:13}}>{o}</button>
                  ))}
                </div>
              </div>
              {form.owner==='Prestada'&&(
                <div style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>Dueño</label>
                  <input style={{background:C,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 12px',width:'100%',fontSize:14,outline:'none',boxSizing:'border-box'}} placeholder="¿Quién te la prestó?" value={form.lender||''} onChange={e=>setForm(f=>({...f,lender:e.target.value}))}/>
                </div>
              )}
              <div style={{display:'flex',gap:10,marginTop:8}}>
                <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:8,border:`1px solid ${B}`,background:'none',color:M,cursor:'pointer',fontWeight:600}}>Cancelar</button>
                <button onClick={saveTool} style={{flex:2,padding:11,borderRadius:8,border:'none',background:O,color:'#fff',cursor:'pointer',fontWeight:700,fontSize:15}}>{modal.id?'Guardar':'Agregar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {modal?.type==='move'&&(
        <div style={{position:'fixed',inset:0,background:'#000A',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setModal(null)}>
          <div style={{background:S2,border:`1px solid ${B}`,borderRadius:14,width:'100%',maxWidth:440,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 20px 14px',borderBottom:`1px solid ${B}`}}>
              <span style={{fontWeight:700,fontSize:16}}>{modal.dir==='out'?'Salida':'Entrada'} — {modal.tool.name}</span>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:M,fontSize:18,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{padding:20}}>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>{modal.dir==='out'?'¿A quién?':'¿Quién regresa?'}</label>
                <input autoFocus style={{background:C,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 12px',width:'100%',fontSize:14,outline:'none',boxSizing:'border-box'}} placeholder="Nombre" value={form.person||''} onChange={e=>setForm(f=>({...f,person:e.target.value}))}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>Fecha</label>
                  <input type="date" style={{background:C,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 12px',width:'100%',fontSize:14,outline:'none',boxSizing:'border-box'}} value={form.date||''} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>Cantidad</label>
                  <input type="number" min="1" style={{background:C,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 12px',width:'100%',fontSize:14,outline:'none',boxSizing:'border-box'}} value={form.qty||1} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/>
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:M,marginBottom:6,textTransform:'uppercase'}}>Notas</label>
                <input style={{background:C,border:`1px solid ${B}`,borderRadius:8,color:'#E8EBF0',padding:'10px 12px',width:'100%',fontSize:14,outline:'none',boxSizing:'border-box'}} placeholder="Opcional" value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
              </div>
              <div style={{display:'flex',gap:10,marginTop:8}}>
                <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:8,border:`1px solid ${B}`,background:'none',color:M,cursor:'pointer',fontWeight:600}}>Cancelar</button>
                <button onClick={saveMove} style={{flex:2,padding:11,borderRadius:8,border:'none',background:modal.dir==='out'?R:G,color:'#fff',cursor:'pointer',fontWeight:700,fontSize:15}}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {modal?.type==='history'&&(
        <div style={{position:'fixed',inset:0,background:'#000A',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={()=>setModal(null)}>
          <div style={{background:S2,border:`1px solid ${B}`,borderRadius:14,width:'100%',maxWidth:440,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 20px 14px',borderBottom:`1px solid ${B}`}}>
              <span style={{fontWeight:700,fontSize:16}}>Historial — {modal.tool.name}</span>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:M,fontSize:18,cursor:'pointer'}}>✕</button>
            </div>
            <div style={{padding:20}}>
              {modal.tl.length===0?<div style={{textAlign:'center',padding:'30px 0',color:M}}>Sin movimientos.</div>
              :modal.tl.sort((a,b)=>b.date>a.date?1:-1).map(l=>(
                <div key={l.id} style={{display:'flex',gap:12,alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${B}`}}>
                  <div style={{width:34,height:34,borderRadius:8,background:l.dir==='out'?R+'22':G+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>{l.dir==='out'?'↗':'↙'}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600}}>{l.dir==='out'?'Salió con':'Regresó de'} <span style={{color:'#FF9A2E'}}>{l.person}</span></div>
                    {l.notes&&<div style={{fontSize:12,color:M}}>{l.notes}</div>}
                  </div>
                  <div style={{fontSize:12,color:M}}>{fmt(l.date)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

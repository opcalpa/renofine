/* global React, Ico, icons */
const { useState: useS_r } = React;

// ————————————————————————————————————————————————————————————————
// Rum v2 — list + drawer + mobil bottom-sheet
// Uppdaterad efter feature-parity-audit:
//   • Lista: sort-dropdown, bulk-select, "Placera på ritning", tabellvy, fältinst.
//   • Drawer: inline-edit namn, klickbar status+prio, alltid-synliga notes,
//     El&Värme i Material, FilledDots, Checklistor + Kommentarer-tabs,
//     Delete + View Elevation i action bar, canvas-color picker.
//   • Mobil: matchar drawer.
// ————————————————————————————————————————————————————————————————

const ROOM_TYPE_ICONS = {
  kitchen: "M4 9h16M4 4v16M20 4v16M9 4v5M15 4v5M4 14h16",
  bath: "M3 10h18M5 10V7a3 3 0 0 1 6 0M5 10v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6",
  living: "M3 12v6M21 12v6M5 12h14a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2ZM6 12V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4",
  bedroom: "M2 17v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5M2 17h20M2 17v3M22 17v3M7 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3",
  hall: "M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 21v-7h6v7",
  storage: "M3 7h18v14H3zM3 7l2-4h14l2 4M9 12h6",
  office: "M3 11h18v9H3zM7 11V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4M9 16h6",
  generic: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
};

const SAMPLE_ROOMS = [
  { id:"r1", name:"Kök", type:"kitchen", area:14.2, status:"renoveras", priority:"high", color:"#7DA3A1", progress:62, tasksDone:8, tasksTotal:13, photos:4, placed:true, filled:{floor:8,floorTotal:9, walls:6,wallsTotal:8, electrical:4,electricalTotal:6, vision:2,visionTotal:3}, notes:"Värmegolv installerat. Inväntar montör för köksluckor.", points:[[0,0],[420,0],[420,260],[280,260],[280,340],[0,340]] },
  { id:"r2", name:"Badrum", type:"bath", area:5.1, status:"renoveras", priority:"high", color:"#C9A87A", progress:45, tasksDone:5, tasksTotal:11, photos:7, placed:true, filled:{floor:9,floorTotal:9, walls:7,wallsTotal:8, electrical:5,electricalTotal:6, vision:3,visionTotal:3}, notes:"Tätskikt klart. Klinker 30×30 levereras 14 maj.", points:[[0,0],[280,0],[280,260],[0,260]] },
  { id:"r3", name:"Vardagsrum", type:"living", area:24.8, status:"befintligt", priority:"medium", color:"#A8B5A2", progress:0, tasksDone:0, tasksTotal:0, photos:2, placed:true, filled:{floor:3,floorTotal:9, walls:1,wallsTotal:8, electrical:0,electricalTotal:6, vision:1,visionTotal:3}, notes:"Endast slipa & olja golv.", points:[[0,0],[520,0],[520,380],[0,380]] },
  { id:"r4", name:"Sovrum 1", type:"bedroom", area:12.4, status:"befintligt", priority:"low", color:"#B8A398", progress:100, tasksDone:3, tasksTotal:3, photos:0, placed:true, filled:{floor:5,floorTotal:9, walls:6,wallsTotal:8, electrical:2,electricalTotal:6, vision:1,visionTotal:3}, notes:"Klart — endast ommålning vägg + tak.", points:[[0,0],[360,0],[360,320],[0,320]] },
  { id:"r5", name:"Sovrum 2", type:"bedroom", area:9.6, status:"befintligt", priority:"low", color:"#B8A398", progress:0, tasksDone:0, tasksTotal:0, photos:0, placed:false, filled:{floor:0,floorTotal:9, walls:0,wallsTotal:8, electrical:0,electricalTotal:6, vision:0,visionTotal:3}, notes:"", points:[[0,0],[300,0],[300,280],[0,280]] },
  { id:"r6", name:"Hall", type:"hall", area:6.2, status:"befintligt", priority:"medium", color:"#9DA8B5", progress:30, tasksDone:1, tasksTotal:4, photos:1, placed:true, filled:{floor:4,floorTotal:9, walls:3,wallsTotal:8, electrical:1,electricalTotal:6, vision:1,visionTotal:3}, notes:"Garderob väggfast — beslut behövs.", points:[[0,0],[200,0],[200,280],[0,280]] },
  { id:"r7", name:"Tvättstuga", type:"storage", area:4.0, status:"nybygge", priority:"medium", color:"#A89D8B", progress:15, tasksDone:1, tasksTotal:7, photos:0, placed:true, filled:{floor:6,floorTotal:9, walls:2,wallsTotal:8, electrical:3,electricalTotal:6, vision:2,visionTotal:3}, notes:"Rivning klar. Ny golvbrunn beställd.", points:[[0,0],[180,0],[180,200],[0,200]] },
  { id:"r8", name:"Klädkammare", type:"storage", area:2.4, status:"nybygge", priority:"low", color:"#A89D8B", progress:0, tasksDone:0, tasksTotal:0, photos:0, placed:false, filled:{floor:0,floorTotal:9, walls:0,wallsTotal:8, electrical:0,electricalTotal:6, vision:0,visionTotal:3}, notes:"", points:[[0,0],[120,0],[120,180],[0,180]] },
];

const STATUS_OPTIONS = [
  { v:"befintligt", l:"Befintligt" },
  { v:"renoveras", l:"Renoveras" },
  { v:"nybygge", l:"Nybygge" },
];
const PRIORITY_OPTIONS = [
  { v:"high", l:"Hög" },
  { v:"medium", l:"Medel" },
  { v:"low", l:"Låg" },
];
const FIELD_OPTIONS = [
  { k:"area", l:"Yta", on:true },
  { k:"width", l:"Bredd", on:false },
  { k:"depth", l:"Djup", on:false },
  { k:"perimeter", l:"Omkrets", on:false },
  { k:"status", l:"Status", on:true },
  { k:"floorMaterial", l:"Golvmaterial", on:false },
  { k:"wallColor", l:"Väggfärg", on:false },
  { k:"ceilingHeight", l:"Takhöjd", on:false },
  { k:"priority", l:"Prioritet", on:true },
  { k:"created", l:"Skapad", on:false },
  { k:"description", l:"Kundens önskemål", on:false },
  { k:"notes", l:"Anteckningar", on:false },
  { k:"trimColor", l:"Listfärg", on:false },
  { k:"ceilingColor", l:"Takfärg", on:false },
  { k:"tasks", l:"Arbeten", on:true },
  { k:"progress", l:"Framsteg", on:true },
];
const SORT_OPTIONS = [
  { v:"created_desc", l:"Nyast först" },
  { v:"created_asc", l:"Äldst först" },
  { v:"name_asc", l:"Namn A–Ö" },
  { v:"name_desc", l:"Namn Ö–A" },
  { v:"area_desc", l:"Yta (störst)" },
  { v:"area_asc", l:"Yta (minst)" },
];

// Mini SVG of room shape from points
function RoomShape({ points, color = "var(--accent)", size = 36, stroke = 1.25 }) {
  if (!points || points.length < 3) {
    return <div style={{ width:size, height:size, borderRadius:6, background:"var(--bg-sunken)", border:"1px dashed var(--hairline)" }}/>;
  }
  const xs = points.map(p=>p[0]); const ys = points.map(p=>p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX-minX, h = maxY-minY;
  const pad = 6;
  const sc = (size - pad*2) / Math.max(w, h);
  const off = [pad + (Math.max(w,h)-w)/2*sc, pad + (Math.max(w,h)-h)/2*sc];
  const d = points.map((p,i) => {
    const x = (p[0]-minX)*sc + off[0];
    const y = (p[1]-minY)*sc + off[1];
    return `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + "Z";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={d} fill={color} fillOpacity="0.15" stroke={color} strokeWidth={stroke} strokeLinejoin="round"/>
    </svg>
  );
}

function StatusPill({ status, clickable, onClick }) {
  const map = {
    befintligt: { label:"Befintligt", bg:"#EFEAE0", fg:"#6B5A3A" },
    renoveras:  { label:"Renoveras",  bg:"#E8DDD0", fg:"#7A4F1F" },
    nybygge:    { label:"Nybygge",    bg:"#DCE5DC", fg:"#3F5A3F" },
  };
  const s = map[status] || map.befintligt;
  return (
    <button onClick={clickable ? onClick : undefined} disabled={!clickable} style={{
      display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", fontSize:11, fontWeight:500,
      color:s.fg, background:s.bg, borderRadius:999, letterSpacing:"-0.002em",
      border:"none", cursor: clickable ? "pointer" : "default",
    }}>
      {s.label}
      {clickable && <Ico d={icons.chevDown} size={10}/>}
    </button>
  );
}

function PriorityPill({ priority, clickable, onClick }) {
  const map = {
    high:   { l:"Hög",   bg:"#F2E2DA", fg:"#7A3D26", dot:"#B86040" },
    medium: { l:"Medel", bg:"#F0E7D7", fg:"#6B5A3A", dot:"#C9A87A" },
    low:    { l:"Låg",   bg:"#E5EAE2", fg:"#4A5547", dot:"#A8B5A2" },
  };
  const s = map[priority] || map.low;
  return (
    <button onClick={clickable ? onClick : undefined} disabled={!clickable} style={{
      display:"inline-flex", alignItems:"center", gap:5, padding:"2px 8px", fontSize:11, fontWeight:500,
      color:s.fg, background:s.bg, borderRadius:999, letterSpacing:"-0.002em",
      border:"none", cursor: clickable ? "pointer" : "default",
    }}>
      <span style={{ width:6, height:6, borderRadius:999, background:s.dot, display:"inline-block" }}/>
      {s.l} prio
      {clickable && <Ico d={icons.chevDown} size={10}/>}
    </button>
  );
}

function PriorityDot({ priority }) {
  const map = { high:"#B86040", medium:"#C9A87A", low:"#A8B5A2" };
  return <span title={priority} style={{ display:"inline-block", width:6, height:6, borderRadius:999, background:map[priority]||map.low }}/>;
}

function ProgressBar({ value = 0, color = "var(--accent)" }) {
  return (
    <div style={{ height:4, background:"var(--bg-sunken)", borderRadius:2, overflow:"hidden", width:"100%" }}>
      <div style={{ height:"100%", width:`${value}%`, background:color, transition:"width .3s" }}/>
    </div>
  );
}

// FilledDot — visar om en sektion saknar fält
function FilledDot({ filled, total }) {
  if (total === 0) return null;
  const pct = filled / total;
  const color = pct >= 1 ? "var(--accent)" : pct >= 0.5 ? "#C9A87A" : "#B5341E";
  return (
    <span title={`${filled}/${total} fält ifyllda`} style={{
      display:"inline-flex", alignItems:"center", gap:4,
      fontSize:10, color:"var(--fg-muted)", fontFeatureSettings:'"tnum"',
    }}>
      <span style={{ width:6, height:6, borderRadius:999, background:color }}/>
      {filled}/{total}
    </span>
  );
}

// MapPin action — placera/visa på ritning
function PlaceOnPlanButton({ placed, onClick }) {
  return (
    <button onClick={(e)=>{e.stopPropagation(); onClick && onClick();}} title={placed ? "Visa på ritning" : "Placera på ritning"} style={{
      width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center",
      color: placed ? "var(--accent)" : "#B86040",
      background:"transparent", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer",
    }}>
      <Ico d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM12 11.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" size={14}/>
    </button>
  );
}

// ─── ROOM CARD (desktop) ───────────────────────────────────────────
function RoomCard({ room, onClick, bulkMode, selected, onToggleSelect }) {
  const tasksLabel = room.tasksTotal > 0 ? `${room.tasksDone}/${room.tasksTotal} arbeten` : "Inga arbeten ännu";
  return (
    <div onClick={bulkMode ? () => onToggleSelect(room.id) : onClick} style={{
      position:"relative", background:"var(--surface)",
      border: selected ? "1px solid var(--fg)" : "1px solid var(--hairline)",
      boxShadow: selected ? "0 0 0 1px var(--fg) inset" : "none",
      borderRadius:8, padding:"16px 18px 14px 22px", cursor:"pointer", transition:"all .15s",
      display:"flex", flexDirection:"column", gap:12, minHeight:148,
    }}
      onMouseEnter={e=>{ if(!selected) e.currentTarget.style.borderColor="var(--fg-muted)"; e.currentTarget.style.transform="translateY(-1px)"; }}
      onMouseLeave={e=>{ if(!selected) e.currentTarget.style.borderColor="var(--hairline)"; e.currentTarget.style.transform="translateY(0)"; }}>
      {/* color stripe */}
      <div style={{ position:"absolute", left:0, top:12, bottom:12, width:4, background:room.color, borderRadius:"0 2px 2px 0" }}/>

      {/* bulk checkbox */}
      {bulkMode && (
        <div style={{
          position:"absolute", top:12, right:12, width:18, height:18, borderRadius:4,
          border: selected ? "1.5px solid var(--fg)" : "1.5px solid var(--hairline)",
          background: selected ? "var(--fg)" : "var(--surface)",
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"var(--bg)",
        }}>
          {selected && <Ico d={icons.check} size={11}/>}
        </div>
      )}

      {/* head row */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
          <div style={{ width:28, height:28, borderRadius:6, background:"var(--bg-sunken)", color:"var(--fg-muted)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Ico d={ROOM_TYPE_ICONS[room.type] || ROOM_TYPE_ICONS.generic} size={16}/>
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:16, fontWeight:500, color:"var(--fg)", letterSpacing:"-0.012em", lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{room.name}</div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3 }}>
              <span style={{ fontSize:12, color:"var(--fg-muted)", fontFeatureSettings:'"tnum"' }}>{room.area.toFixed(1)} m²</span>
              <span style={{ color:"var(--hairline)" }}>·</span>
              <PriorityDot priority={room.priority}/>
              <span style={{ fontSize:11, color:"var(--fg-muted)" }}>{room.priority === "high" ? "Hög" : room.priority === "medium" ? "Medel" : "Låg"}</span>
            </div>
          </div>
        </div>
        <RoomShape points={room.points} color={room.color} size={42}/>
      </div>

      {/* status + photos + place-on-plan */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <StatusPill status={room.status}/>
        {room.photos > 0 && (
          <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:"var(--fg-muted)" }}>
            <Ico d={icons.image} size={12}/>
            {room.photos}
          </span>
        )}
        <div style={{ flex:1 }}/>
        {!bulkMode && <PlaceOnPlanButton placed={room.placed}/>}
      </div>

      {/* progress */}
      <div style={{ marginTop:"auto", display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--fg-muted)", fontFeatureSettings:'"tnum"' }}>
          <span>{tasksLabel}</span>
          <span style={{ fontWeight:500, color:room.progress === 100 ? "var(--accent)" : "var(--fg)" }}>{room.progress}%</span>
        </div>
        <ProgressBar value={room.progress} color={room.progress === 100 ? "var(--accent)" : room.color}/>
      </div>
    </div>
  );
}

// ─── ROOM TABLE ROW (kompakt vy) ───────────────────────────────────
function RoomTableRow({ room, onClick, bulkMode, selected, onToggleSelect, isHeader }) {
  if (isHeader) {
    return (
      <div style={{
        display:"grid", gridTemplateColumns:"24px 32px 1fr 100px 110px 110px 100px 60px",
        gap:12, padding:"8px 14px", fontSize:11, fontWeight:500, color:"var(--fg-muted)",
        textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid var(--hairline)",
        background:"var(--bg-sunken)",
      }}>
        <div></div>
        <div></div>
        <div>Rum</div>
        <div>Yta</div>
        <div>Status</div>
        <div>Prioritet</div>
        <div>Framsteg</div>
        <div></div>
      </div>
    );
  }
  return (
    <div onClick={bulkMode ? () => onToggleSelect(room.id) : onClick} style={{
      display:"grid", gridTemplateColumns:"24px 32px 1fr 100px 110px 110px 100px 60px",
      gap:12, padding:"10px 14px", alignItems:"center",
      borderBottom:"1px solid var(--hairline)", cursor:"pointer",
      background: selected ? "var(--bg-sunken)" : "transparent",
      transition:"background .12s",
    }}
      onMouseEnter={e=>{ if(!selected) e.currentTarget.style.background="rgba(0,0,0,0.02)"; }}
      onMouseLeave={e=>{ if(!selected) e.currentTarget.style.background="transparent"; }}>
      {bulkMode ? (
        <div style={{ width:16, height:16, borderRadius:3, border: selected ? "1.5px solid var(--fg)" : "1.5px solid var(--hairline)", background: selected ? "var(--fg)" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--bg)" }}>
          {selected && <Ico d={icons.check} size={10}/>}
        </div>
      ) : <div style={{ width:3, height:24, background:room.color, borderRadius:2 }}/>}
      <RoomShape points={room.points} color={room.color} size={28}/>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500, color:"var(--fg)", letterSpacing:"-0.01em" }}>{room.name}</div>
        {room.notes && <div style={{ fontSize:11, color:"var(--fg-muted)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{room.notes}</div>}
      </div>
      <div style={{ fontSize:12, color:"var(--fg)", fontFeatureSettings:'"tnum"' }}>{room.area.toFixed(1)} m²</div>
      <div><StatusPill status={room.status}/></div>
      <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"var(--fg-muted)" }}>
        <PriorityDot priority={room.priority}/>
        {room.priority === "high" ? "Hög" : room.priority === "medium" ? "Medel" : "Låg"}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <ProgressBar value={room.progress} color={room.progress === 100 ? "var(--accent)" : room.color}/>
        <span style={{ fontSize:11, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"', minWidth:26, textAlign:"right" }}>{room.progress}%</span>
      </div>
      {!bulkMode && <PlaceOnPlanButton placed={room.placed}/>}
    </div>
  );
}

// ─── Sort dropdown popover ─────────────────────────────────────────
function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useS_r(false);
  const current = SORT_OPTIONS.find(o=>o.v===value) || SORT_OPTIONS[0];
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(!open)} style={{
        display:"flex", alignItems:"center", gap:6, padding:"6px 10px", border:"1px solid var(--hairline)",
        borderRadius:6, background:"var(--bg)", fontSize:12, color:"var(--fg-muted)", cursor:"pointer",
      }}>
        <Ico d="M3 6h18M6 12h12M9 18h6" size={12}/>
        <span>Sortera:</span>
        <span style={{ fontWeight:500, color:"var(--fg)" }}>{current.l}</span>
        <Ico d={icons.chevDown} size={11}/>
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:10 }}/>
          <div style={{
            position:"absolute", top:"calc(100% + 4px)", right:0, zIndex:11,
            background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:6,
            boxShadow:"0 4px 16px -4px rgba(0,0,0,0.12)", minWidth:180, padding:4,
          }}>
            {SORT_OPTIONS.map(o => (
              <button key={o.v} onClick={()=>{ onChange(o.v); setOpen(false); }} style={{
                display:"flex", alignItems:"center", gap:8, width:"100%", padding:"6px 10px",
                fontSize:12, color: o.v===value ? "var(--fg)" : "var(--fg-muted)",
                fontWeight: o.v===value ? 500 : 400,
                background: o.v===value ? "var(--bg-sunken)" : "transparent",
                border:"none", borderRadius:4, cursor:"pointer", textAlign:"left",
              }}>
                {o.v===value ? <Ico d={icons.check} size={11}/> : <span style={{width:11}}/>}
                {o.l}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Field-toggle popover ──────────────────────────────────────────
function FieldsToggle({ fields, onToggle }) {
  const [open, setOpen] = useS_r(false);
  const visibleCount = fields.filter(f=>f.on).length;
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(!open)} style={{
        padding:"5px 10px", fontSize:11, color:"var(--fg-muted)", background:"transparent",
        border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer",
        display:"inline-flex", alignItems:"center", gap:5,
      }}>
        <Ico d={icons.filter} size={12}/> Fält
        <span style={{ fontSize:10, color:"var(--fg-muted)", fontWeight:500 }}>{visibleCount}</span>
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:10 }}/>
          <div style={{
            position:"absolute", top:"calc(100% + 4px)", right:0, zIndex:11,
            background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:6,
            boxShadow:"0 4px 16px -4px rgba(0,0,0,0.12)", minWidth:220, padding:6,
            maxHeight:280, overflowY:"auto",
          }}>
            <div style={{ padding:"4px 8px 6px", fontSize:10, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid var(--hairline)" }}>Visa fält i kort</div>
            {fields.map(f => (
              <button key={f.k} onClick={()=>onToggle(f.k)} style={{
                display:"flex", alignItems:"center", gap:8, width:"100%", padding:"6px 8px",
                fontSize:12, color:"var(--fg)", background:"transparent",
                border:"none", borderRadius:4, cursor:"pointer", textAlign:"left",
              }}>
                <span style={{
                  width:14, height:14, borderRadius:3, flexShrink:0,
                  border: f.on ? "1.5px solid var(--fg)" : "1.5px solid var(--hairline)",
                  background: f.on ? "var(--fg)" : "transparent",
                  display:"flex", alignItems:"center", justifyContent:"center", color:"var(--bg)",
                }}>
                  {f.on && <Ico d={icons.check} size={9}/>}
                </span>
                {f.l}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ROOMS LIST (desktop) ──────────────────────────────────────────
window.RoomsListV2 = function RoomsListV2({ onOpenRoom }) {
  const [view, setView] = useS_r("cards");
  const [groupBy, setGroupBy] = useS_r("status");
  const [sort, setSort] = useS_r("created_desc");
  const [fields, setFields] = useS_r(FIELD_OPTIONS);
  const [bulkMode, setBulkMode] = useS_r(false);
  const [selected, setSelected] = useS_r(new Set());

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(SAMPLE_ROOMS.map(r=>r.id)));
  const clearSel = () => setSelected(new Set());

  // group rooms
  const groups = (() => {
    if (groupBy === "none") return [{ key:"all", title:"Alla rum", rooms:SAMPLE_ROOMS }];
    if (groupBy === "status") return [
      { key:"active", title:"Pågår", rooms:SAMPLE_ROOMS.filter(r=>r.progress>0 && r.progress<100) },
      { key:"todo", title:"Inte startat", rooms:SAMPLE_ROOMS.filter(r=>r.progress===0) },
      { key:"done", title:"Klart", rooms:SAMPLE_ROOMS.filter(r=>r.progress===100) },
    ].filter(g=>g.rooms.length>0);
    return [];
  })();

  return (
    <div style={{ background:"var(--bg)", minHeight:900 }}>
      {/* page head */}
      <div style={{ padding:"32px 40px 20px", borderBottom:"1px solid var(--hairline)", background:"var(--surface)" }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Brf Linden · 12B</div>
            <h1 className="font-display" style={{ fontSize:30, fontWeight:300, letterSpacing:"-0.022em", margin:0 }}>Rum</h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>{setBulkMode(!bulkMode); clearSel();}} style={{ padding:"7px 12px", fontSize:13, fontWeight:500, color: bulkMode ? "var(--fg)" : "var(--fg-muted)", background: bulkMode ? "var(--bg-sunken)" : "transparent", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <Ico d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" size={13}/> {bulkMode ? "Avsluta val" : "Välj"}
            </button>
            <button style={{ padding:"7px 12px", fontSize:13, fontWeight:500, color:"var(--fg-muted)", background:"transparent", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <Ico d={icons.layers} size={14}/> Visa på ritning
            </button>
            <button style={{ padding:"7px 14px", fontSize:13, fontWeight:500, color:"var(--bg)", background:"var(--fg)", border:"1px solid var(--fg)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <Ico d={icons.plus} size={14}/> Nytt rum
            </button>
          </div>
        </div>
        {/* primary toolbar */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ flex:1, position:"relative", maxWidth:380 }}>
            <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--fg-muted)" }}><Ico d={icons.search} size={14}/></span>
            <input placeholder="Sök rum, anteckningar, material…" style={{ width:"100%", height:34, padding:"0 12px 0 32px", fontSize:13, background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, outline:"none", color:"var(--fg)" }}/>
          </div>
          <SortDropdown value={sort} onChange={setSort}/>
        </div>
        {/* secondary toolbar */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--fg-muted)" }}>
            <span style={{ textTransform:"uppercase", letterSpacing:"0.06em" }}>Gruppera</span>
            {[["status","Status"],["floor","Våning"],["none","Ingen"]].map(([k,l])=>(
              <button key={k} onClick={()=>setGroupBy(k)} style={{ padding:"3px 8px", fontSize:12, fontWeight:groupBy===k?500:400, color:groupBy===k?"var(--fg)":"var(--fg-muted)", background:groupBy===k?"var(--bg)":"transparent", border:groupBy===k?"1px solid var(--hairline)":"1px solid transparent", borderRadius:4, cursor:"pointer" }}>{l}</button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <FieldsToggle fields={fields} onToggle={k=>setFields(fields.map(f=>f.k===k?{...f,on:!f.on}:f))}/>
            <div style={{ display:"flex", padding:2, background:"var(--bg-sunken)", borderRadius:6, border:"1px solid var(--hairline)" }}>
              {[["cards","Kort"],["table","Tabell"]].map(([k,l])=>(
                <button key={k} onClick={()=>setView(k)} style={{ padding:"3px 10px", fontSize:11, fontWeight:500, color:view===k?"var(--fg)":"var(--fg-muted)", background:view===k?"var(--surface)":"transparent", border:view===k?"1px solid var(--hairline)":"1px solid transparent", borderRadius:4, cursor:"pointer" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* bulk action banner */}
      {bulkMode && selected.size > 0 && (
        <div style={{
          padding:"10px 40px", background:"#F4EFE3", borderBottom:"1px solid #D9CFB8",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <div style={{ fontSize:13, color:"#5A4A1F", fontWeight:500 }}>{selected.size} rum valda</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={selectAll} style={{ padding:"5px 10px", fontSize:12, color:"#5A4A1F", background:"transparent", border:"1px solid #D9CFB8", borderRadius:5, cursor:"pointer" }}>Markera alla</button>
            <button onClick={clearSel} style={{ padding:"5px 10px", fontSize:12, color:"#5A4A1F", background:"transparent", border:"1px solid #D9CFB8", borderRadius:5, cursor:"pointer" }}>Rensa</button>
            <button style={{ padding:"5px 12px", fontSize:12, fontWeight:500, color:"#fff", background:"#B5341E", border:"1px solid #B5341E", borderRadius:5, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5 }}>
              <Ico d={icons.trash} size={11}/> Ta bort
            </button>
          </div>
        </div>
      )}

      {/* groups */}
      <div style={{ padding: view === "cards" ? "24px 40px 40px" : "16px 40px 40px" }}>
        {view === "table" ? (
          <div style={{ background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8, overflow:"hidden" }}>
            <RoomTableRow isHeader/>
            {SAMPLE_ROOMS.map(r => <RoomTableRow key={r.id} room={r} bulkMode={bulkMode} selected={selected.has(r.id)} onToggleSelect={toggleSelect} onClick={()=>onOpenRoom && onOpenRoom(r)}/>)}
          </div>
        ) : (
          groups.map(g => (
            <div key={g.key} style={{ marginBottom:32 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:14 }}>
                <h2 className="font-display" style={{ fontSize:18, fontWeight:400, color:"var(--fg)", letterSpacing:"-0.012em", margin:0 }}>{g.title}</h2>
                <span style={{ fontSize:12, color:"var(--fg-muted)", fontFeatureSettings:'"tnum"' }}>{g.rooms.length}</span>
                <div style={{ flex:1, height:1, background:"var(--hairline)" }}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14 }}>
                {g.rooms.map(r => <RoomCard key={r.id} room={r} bulkMode={bulkMode} selected={selected.has(r.id)} onToggleSelect={toggleSelect} onClick={()=>onOpenRoom && onOpenRoom(r)}/>)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─── ROOM DRAWER (desktop right-sheet) ─────────────────────────────
window.RoomDrawerV2 = function RoomDrawerV2() {
  const [tab, setTab] = useS_r("overview");
  const [editingName, setEditingName] = useS_r(false);
  const [colorOpen, setColorOpen] = useS_r(false);
  const room = SAMPLE_ROOMS[0]; // Kök

  // FilledIndicators per tab — räknas från room.filled
  const overviewFilled = room.filled.vision;
  const overviewTotal = room.filled.visionTotal;
  const materialFilled = room.filled.floor + room.filled.walls + room.filled.electrical;
  const materialTotal = room.filled.floorTotal + room.filled.wallsTotal + room.filled.electricalTotal;

  const tabs = [
    { k:"overview", l:"Översikt", filled:overviewFilled, total:overviewTotal },
    { k:"material", l:"Material", filled:materialFilled, total:materialTotal },
    { k:"matt", l:"Mått" },
    { k:"foton", l:"Foton", count:room.photos },
    { k:"checklists", l:"Checklistor", count:2 },
    { k:"comments", l:"Kommentarer", count:3 },
    { k:"related", l:"Relaterat", count:room.tasksTotal },
  ];

  const COLORS = ["#7DA3A1","#C9A87A","#A8B5A2","#B8A398","#9DA8B5","#A89D8B","#D9CFC1","#B8786C"];

  return (
    <div style={{ background:"var(--bg)", minHeight:900, display:"flex" }}>
      {/* canvas behind */}
      <div style={{ flex:1, background:"var(--bg-sunken)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--fg-muted)", fontSize:13, position:"relative" }}>
        <svg width="320" height="240" viewBox="0 0 320 240" style={{ opacity:0.5 }}>
          <rect x="20" y="20" width="180" height="120" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="200" y="20" width="100" height="80" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="20" y="140" width="80" height="80" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="100" y="140" width="200" height="80" fill="none" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <div style={{ position:"absolute", top:16, left:20, fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em" }}>Ritning · Plan 1</div>
      </div>

      {/* drawer */}
      <div style={{ width:560, background:"var(--surface)", borderLeft:"1px solid var(--hairline)", display:"flex", flexDirection:"column", boxShadow:"-8px 0 24px -8px rgba(0,0,0,0.05)" }}>
        {/* HERO */}
        <div style={{ padding:"22px 24px 16px", borderBottom:"1px solid var(--hairline)" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16, marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:14, minWidth:0, flex:1 }}>
              <div style={{ width:60, height:60, borderRadius:8, background:"var(--bg-sunken)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative" }}>
                <RoomShape points={room.points} color={room.color} size={48}/>
                {/* canvas-color picker */}
                <div style={{ position:"relative" }}>
                  <button onClick={()=>setColorOpen(!colorOpen)} title="Ändra färg på ritning" style={{ position:"absolute", bottom:-26, right:-26, width:18, height:18, borderRadius:999, border:"2px solid var(--surface)", background:room.color, cursor:"pointer", padding:0, boxShadow:"0 1px 3px rgba(0,0,0,0.1)" }}/>
                  {colorOpen && (
                    <>
                      <div onClick={()=>setColorOpen(false)} style={{ position:"fixed", inset:0, zIndex:10 }}/>
                      <div style={{ position:"absolute", top:0, left:0, marginTop:30, zIndex:11, background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8, padding:8, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, boxShadow:"0 4px 16px -4px rgba(0,0,0,0.12)" }}>
                        {COLORS.map(c => (
                          <button key={c} onClick={()=>setColorOpen(false)} style={{ width:24, height:24, borderRadius:6, border: c===room.color ? "2px solid var(--fg)" : "1px solid var(--hairline)", background:c, cursor:"pointer", padding:0 }}/>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:11, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Plan 1 · Position 4 av 8</div>
                {editingName ? (
                  <input
                    autoFocus defaultValue={room.name}
                    onBlur={()=>setEditingName(false)}
                    onKeyDown={(e)=>{ if(e.key==="Enter"||e.key==="Escape") setEditingName(false); }}
                    className="font-display"
                    style={{ fontSize:26, fontWeight:300, letterSpacing:"-0.022em", margin:"0 0 8px", background:"transparent", border:"none", borderBottom:"2px solid var(--fg)", color:"var(--fg)", outline:"none", padding:0, width:"100%" }}
                  />
                ) : (
                  <button onClick={()=>setEditingName(true)} className="font-display" style={{ fontSize:26, fontWeight:300, letterSpacing:"-0.022em", margin:"0 0 8px", background:"transparent", border:"none", color:"var(--fg)", padding:0, cursor:"text", display:"inline-flex", alignItems:"center", gap:6, textAlign:"left" }}>
                    {room.name}
                    <Ico d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M18 2l4 4-12 12H6v-4L18 2z" size={12} style={{ opacity:0.3 }}/>
                  </button>
                )}
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <StatusPill status={room.status} clickable/>
                  <PriorityPill priority={room.priority} clickable/>
                </div>
              </div>
            </div>
            <button title="Stäng" style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--fg-muted)", background:"transparent", border:"none", borderRadius:6, cursor:"pointer" }}><Ico d="M6 6l12 12M18 6L6 18" size={16}/></button>
          </div>
          {/* metadata strip */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:0, padding:"12px 0 0", borderTop:"1px solid var(--hairline)" }}>
            {[
              ["Yta", `${room.area.toFixed(1)} m²`],
              ["Omkrets", "16,4 m"],
              ["Takhöjd", "2,40 m"],
              ["Volym", `${(room.area*2.4).toFixed(1)} m³`],
            ].map(([k,v])=>(
              <div key={k}>
                <div style={{ fontSize:10, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{k}</div>
                <div style={{ fontSize:14, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"', letterSpacing:"-0.01em" }}>{v}</div>
              </div>
            ))}
          </div>
          {/* shortcut row */}
          <div style={{ display:"flex", gap:6, marginTop:12 }}>
            <button style={{ flex:1, padding:"7px 10px", fontSize:12, color:"var(--fg)", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <Ico d={icons.layers} size={13}/> Elevation
            </button>
            <button style={{ flex:1, padding:"7px 10px", fontSize:12, color:"var(--fg)", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <Ico d={icons.image} size={13}/> Foto
            </button>
            <button style={{ flex:1, padding:"7px 10px", fontSize:12, color:"var(--fg)", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 }}>
              <Ico d={icons.task} size={13}/> Arbete
            </button>
          </div>
        </div>

        {/* ALWAYS-VISIBLE NOTES */}
        <div style={{ padding:"12px 24px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <Ico d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" size={11} style={{ color:"var(--fg-muted)" }}/>
            <span style={{ fontSize:10, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Interna anteckningar</span>
          </div>
          <textarea defaultValue={room.notes} placeholder="Anteckningar synliga endast för dig..." rows={2} style={{
            width:"100%", padding:"8px 10px", fontSize:13, fontFamily:"var(--ff-ui)",
            background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6,
            color:"var(--fg)", outline:"none", resize:"none", lineHeight:1.5,
          }}/>
        </div>

        {/* TABS */}
        <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--hairline)", paddingLeft:16, marginTop:14, position:"sticky", top:0, background:"var(--surface)", overflowX:"auto" }}>
          {tabs.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} style={{ padding:"12px 12px", fontSize:13, fontWeight:tab===t.k?500:400, color:tab===t.k?"var(--fg)":"var(--fg-muted)", background:"transparent", border:"none", borderBottom: tab===t.k?"2px solid var(--fg)":"2px solid transparent", marginBottom:-1, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
              {t.l}
              {t.count != null && t.count > 0 && (
                <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", minWidth:18, height:18, padding:"0 5px", fontSize:10, fontWeight:500, color:"var(--fg-muted)", background:"var(--bg-sunken)", borderRadius:9 }}>{t.count}</span>
              )}
              {t.total != null && t.total > 0 && t.filled < t.total && (
                <span style={{ width:5, height:5, borderRadius:999, background:"#B5341E" }} title={`${t.filled}/${t.total} fält ifyllda`}/>
              )}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {tab === "overview" && <OverviewTab room={room}/>}
          {tab === "material" && <MaterialTab room={room}/>}
          {tab === "matt" && <MattTab room={room}/>}
          {tab === "foton" && <FotonTab room={room}/>}
          {tab === "checklists" && <ChecklistsTab/>}
          {tab === "comments" && <CommentsTab/>}
          {tab === "related" && <RelatedTab room={room}/>}
        </div>

        {/* ACTION BAR */}
        <div style={{ padding:"12px 20px", borderTop:"1px solid var(--hairline)", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button style={{ padding:"7px 12px", fontSize:12, color:"#B5341E", background:"transparent", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, borderRadius:6 }}>
            <Ico d={icons.trash} size={13}/> Ta bort
          </button>
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ padding:"7px 12px", fontSize:13, color:"var(--fg)", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5 }}>
              <Ico d={icons.layers} size={12}/> Visa elevation
            </button>
            <button style={{ padding:"7px 14px", fontSize:13, color:"var(--fg-muted)", background:"transparent", border:"1px solid var(--hairline)", borderRadius:6, cursor:"pointer" }}>Stäng</button>
            <button style={{ padding:"7px 16px", fontSize:13, fontWeight:500, color:"var(--bg)", background:"var(--fg)", border:"1px solid var(--fg)", borderRadius:6, cursor:"pointer" }}>Spara</button>
          </div>
        </div>
      </div>
    </div>
  );
};

function OverviewTab({ room }) {
  return (
    <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <SectionLabel style={{marginBottom:0}}>Kundens önskemål</SectionLabel>
          <FilledDot filled={room.filled.vision} total={room.filled.visionTotal}/>
        </div>
        <div style={{ padding:14, background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, fontSize:13, color:"var(--fg-muted)", fontStyle:"italic", lineHeight:1.55 }}>"Lugnt och tidlöst — ingen industridesign. Helst eget kök från Marbodal i mörkgrön."</div>
      </div>
      <div>
        <SectionLabel>Snabbinfo</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[["Våning","Plan 1"],["Yttertyp","Renoveras"],["Skapat","12 mars 2026"],["Uppdaterat","Idag, 14:22"]].map(([k,v])=>(
            <div key={k} style={{ padding:"8px 12px", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6 }}>
              <div style={{ fontSize:10, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>{k}</div>
              <div style={{ fontSize:13, color:"var(--fg)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MaterialTab({ room }) {
  const sections = [
    { k:"floor", l:"Golv & tak", filled:room.filled.floor, total:room.filled.floorTotal, items:[
      { area:"Golv", spec:"Ekparkett 14mm, oljad", supplier:"Kährs · Linnea", qty:"14,2 m²" },
      { area:"Tak", spec:"NCS S 0500-N tak­vit", supplier:"Beckers · Tak­vit", qty:"14,2 m²" },
    ]},
    { k:"walls", l:"Väggar & snickerier", filled:room.filled.walls, total:room.filled.wallsTotal, items:[
      { area:"Vägg", spec:"NCS S 0500-N matt", supplier:"Beckers · Scotte 7", qty:"42 m²" },
      { area:"Lister", spec:"MDF 70mm fotlist, vit", supplier:"Cello · 70mm", qty:"16,4 m" },
      { area:"Fönsterbänk", spec:"Massiv ek 28mm", supplier:"Egen leverans", qty:"2 st" },
    ]},
    { k:"electrical", l:"El & värme", filled:room.filled.electrical, total:room.filled.electricalTotal, items:[
      { area:"Eluttag", spec:"8 st, dubbel jordad", supplier:"Schneider · Renova", qty:"8 st" },
      { area:"Belysning", spec:"4 punkter, dimbara", supplier:"—", qty:"4 punkter" },
      { area:"Värme", spec:"Vattenburen golvvärme", supplier:"Floore · F1", qty:"14,2 m²" },
    ]},
  ];
  return (
    <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:18 }}>
      {sections.map(s => (
        <div key={s.k}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <SectionLabel style={{marginBottom:0}}>{s.l}</SectionLabel>
            <FilledDot filled={s.filled} total={s.total}/>
          </div>
          <div style={{ background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, overflow:"hidden" }}>
            {s.items.map((it,i)=>(
              <div key={i} style={{ padding:"12px 14px", borderTop: i>0?"1px solid var(--hairline)":"none", display:"grid", gridTemplateColumns:"100px 1fr 80px", gap:12, alignItems:"center" }}>
                <div style={{ fontSize:11, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:500 }}>{it.area}</div>
                <div>
                  <div style={{ fontSize:13, color:"var(--fg)", marginBottom:2 }}>{it.spec}</div>
                  <div style={{ fontSize:11, color:"var(--fg-muted)" }}>{it.supplier}</div>
                </div>
                <div style={{ fontSize:12, color:"var(--fg)", fontFeatureSettings:'"tnum"', textAlign:"right", fontWeight:500 }}>{it.qty}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MattTab() {
  return (
    <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:18 }}>
      <div>
        <SectionLabel>Beräkningar</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
          {[
            ["Golvyta","14,2 m²","Från ritning"],
            ["Väggyta","42,0 m²","Omkrets × takhöjd – öppningar"],
            ["Takyta","14,2 m²","= Golvyta"],
            ["Listmängd","16,4 m","Fotlist"],
            ["Färg vägg","6,3 L","≈ 7 m²/L · 1 strykning"],
            ["Spackel","4,2 kg","≈ 0,1 kg/m²"],
          ].map(([k,v,s])=>(
            <div key={k} style={{ padding:"10px 12px", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6 }}>
              <div style={{ fontSize:11, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{k}</div>
              <div style={{ fontSize:15, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"', letterSpacing:"-0.01em" }}>{v}</div>
              <div style={{ fontSize:10, color:"var(--fg-muted)", marginTop:2 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FotonTab() {
  return (
    <div style={{ padding:"20px 24px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <SectionLabel style={{marginBottom:0}}>4 foton</SectionLabel>
        <button style={{ padding:"5px 10px", fontSize:11, color:"var(--fg)", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:5, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5 }}>
          <Ico d={icons.plus} size={11}/> Ladda upp
        </button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
        {["#D9CFC1","#C9B89A","#B5A88E","#A89A7E"].map((c,i)=>(
          <div key={i} style={{ aspectRatio:"4/3", background:c, borderRadius:6, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", left:8, bottom:6, fontSize:10, color:"rgba(255,255,255,0.9)", fontWeight:500 }}>IMG_{2840+i}.jpg</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistsTab() {
  const lists = [
    { title:"Före installation", items:[
      { t:"Vatten avstängt", done:true },
      { t:"Möbler bortflyttade", done:true },
      { t:"Tätskikt godkänt av kontrollant", done:true },
      { t:"El-besiktning klar", done:false },
    ]},
    { title:"Slutbesiktning", items:[
      { t:"Funktionstest av blandare", done:false },
      { t:"Foga och rengöra klinker", done:false },
      { t:"Slutstäda och inspektera", done:false },
    ]},
  ];
  return (
    <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
      <button style={{ padding:"8px 12px", fontSize:12, color:"var(--fg-muted)", background:"var(--bg)", border:"1px dashed var(--hairline)", borderRadius:6, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, justifyContent:"center" }}>
        <Ico d={icons.plus} size={11}/> Ny checklista
      </button>
      {lists.map((cl, ci)=>{
        const done = cl.items.filter(i=>i.done).length;
        const pct = Math.round(done / cl.items.length * 100);
        return (
          <div key={ci} style={{ background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, overflow:"hidden" }}>
            <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--hairline)", display:"flex", alignItems:"center", gap:8 }}>
              <Ico d={icons.chevDown} size={11} style={{ color:"var(--fg-muted)" }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, color:"var(--fg)" }}>{cl.title}</div>
                <div style={{ marginTop:4 }}><ProgressBar value={pct}/></div>
              </div>
              <span style={{ fontSize:11, color:"var(--fg-muted)", fontFeatureSettings:'"tnum"' }}>{done}/{cl.items.length}</span>
              <button style={{ width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--fg-muted)", background:"transparent", border:"none", cursor:"pointer" }}><Ico d={icons.trash} size={11}/></button>
            </div>
            <div>
              {cl.items.map((it,i)=>(
                <div key={i} style={{ padding:"8px 14px", borderBottom: i<cl.items.length-1?"1px solid var(--hairline)":"none", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:14, height:14, borderRadius:3, border:"1.5px solid "+(it.done?"var(--accent)":"var(--hairline)"), background:it.done?"var(--accent)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {it.done && <Ico d={icons.check} size={9}/>}
                  </div>
                  <span style={{ fontSize:13, color:it.done?"var(--fg-muted)":"var(--fg)", textDecoration:it.done?"line-through":"none", flex:1 }}>{it.t}</span>
                </div>
              ))}
              <div style={{ padding:"8px 14px" }}>
                <input placeholder="Lägg till punkt..." style={{ width:"100%", height:28, padding:"0 8px", fontSize:13, background:"transparent", border:"1px dashed var(--hairline)", borderRadius:4, color:"var(--fg)", outline:"none" }}/>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommentsTab() {
  const comments = [
    { who:"Anna", role:"Beställare", when:"Idag, 14:22", text:"Kan vi byta till en mörkare grön på köksluckorna? Något åt salviahållet hellre än mossgrönt." },
    { who:"Mats", role:"Snickare", when:"Igår, 09:14", text:"Värmegolvet klart. Kollade tätskiktet en extra gång — torrt och fast." },
    { who:"Anna", role:"Beställare", when:"3 maj", text:"Jag tar med färgprover till nästa möte." },
  ];
  return (
    <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {comments.map((c,i)=>(
          <div key={i} style={{ display:"flex", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:999, background:"var(--bg-sunken)", color:"var(--fg-muted)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:500, flexShrink:0 }}>{c.who[0]}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:3 }}>
                <span style={{ fontSize:13, fontWeight:500, color:"var(--fg)" }}>{c.who}</span>
                <span style={{ fontSize:10, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{c.role}</span>
                <span style={{ fontSize:11, color:"var(--fg-muted)", marginLeft:"auto" }}>{c.when}</span>
              </div>
              <div style={{ padding:"10px 12px", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, fontSize:13, color:"var(--fg)", lineHeight:1.5 }}>{c.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ paddingTop:6, borderTop:"1px solid var(--hairline)", display:"flex", gap:8 }}>
        <textarea placeholder="Skriv en kommentar..." rows={2} style={{ flex:1, padding:"8px 10px", fontSize:13, fontFamily:"var(--ff-ui)", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, color:"var(--fg)", outline:"none", resize:"none" }}/>
        <button style={{ padding:"7px 14px", fontSize:13, fontWeight:500, color:"var(--bg)", background:"var(--fg)", border:"none", borderRadius:6, cursor:"pointer", alignSelf:"flex-start" }}>Skicka</button>
      </div>
    </div>
  );
}

function RelatedTab({ room }) {
  const tasks = [
    { title:"Demontera kökslucka", who:"Mats", done:true },
    { title:"Lägga golvvärme", who:"Erik & Co", done:true },
    { title:"Måla väggar grön", who:"Du", done:false, due:"14 maj" },
    { title:"Montera nya luckor", who:"Marbodal", done:false, due:"22 maj" },
  ];
  const orders = [
    { title:"Marbodal kök – Linnea grön", sum:"68 400 kr", status:"Beställt" },
    { title:"Bosch häll + ugn (paket)", sum:"14 900 kr", status:"Levererat" },
  ];
  return (
    <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <SectionLabel>Arbeten · {tasks.filter(t=>t.done).length}/{tasks.length}</SectionLabel>
        <div style={{ background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, overflow:"hidden" }}>
          {tasks.map((t,i)=>(
            <div key={i} style={{ padding:"10px 12px", borderTop:i>0?"1px solid var(--hairline)":"none", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:14, height:14, borderRadius:3, border:"1.5px solid "+(t.done?"var(--accent)":"var(--hairline)"), background:t.done?"var(--accent)":"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {t.done && <Ico d={icons.check} size={9}/>}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, color:t.done?"var(--fg-muted)":"var(--fg)", textDecoration:t.done?"line-through":"none" }}>{t.title}</div>
                <div style={{ fontSize:11, color:"var(--fg-muted)" }}>{t.who}{t.due ? ` · ${t.due}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel>Inköp</SectionLabel>
        <div style={{ background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, overflow:"hidden" }}>
          {orders.map((o,i)=>(
            <div key={i} style={{ padding:"12px", borderTop:i>0?"1px solid var(--hairline)":"none", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
              <div>
                <div style={{ fontSize:13, color:"var(--fg)", marginBottom:2 }}>{o.title}</div>
                <div style={{ fontSize:11, color:"var(--fg-muted)" }}>{o.status}</div>
              </div>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"' }}>{o.sum}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, style }) {
  return <div style={{ fontSize:10, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8, ...style }}>{children}</div>;
}

// ─── MOBIL — list ──────────────────────────────────────────────────
window.RoomsListMobile = function RoomsListMobile() {
  return (
    <div style={{ width:390, height:844, background:"var(--bg)", overflow:"hidden", display:"flex", flexDirection:"column", borderRadius:32, border:"1px solid var(--hairline)" }}>
      {/* status bar */}
      <div style={{ height:44, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:13, fontWeight:600, color:"var(--fg)" }}>
        <span>9:41</span>
        <span style={{ fontSize:10, color:"var(--fg-muted)" }}>● ● ●</span>
      </div>
      {/* nav */}
      <div style={{ padding:"6px 16px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <button style={{ width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--fg)", background:"transparent", border:"none", cursor:"pointer" }}><Ico d="m15 18-6-6 6-6" size={18}/></button>
        <div style={{ fontSize:13, fontWeight:500, color:"var(--fg)" }}>Rum</div>
        <button style={{ width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--fg)", background:"transparent", border:"none", cursor:"pointer" }}><Ico d={icons.plus} size={18}/></button>
      </div>
      {/* hero */}
      <div style={{ padding:"4px 20px 16px" }}>
        <div style={{ fontSize:11, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Brf Linden · 12B</div>
        <h1 className="font-display" style={{ fontSize:28, fontWeight:300, letterSpacing:"-0.022em", margin:"0 0 4px" }}>8 rum</h1>
        <div style={{ fontSize:12, color:"var(--fg-muted)" }}>3 pågår · 4 inte startat · 1 klart</div>
      </div>
      {/* search */}
      <div style={{ padding:"0 16px 12px" }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--fg-muted)" }}><Ico d={icons.search} size={14}/></span>
          <input placeholder="Sök rum…" style={{ width:"100%", height:38, padding:"0 14px 0 36px", fontSize:14, background:"var(--bg-sunken)", border:"1px solid var(--hairline)", borderRadius:8, outline:"none", color:"var(--fg)" }}/>
        </div>
      </div>
      {/* segment */}
      <div style={{ padding:"0 16px 14px" }}>
        <div style={{ display:"flex", padding:3, background:"var(--bg-sunken)", borderRadius:8, border:"1px solid var(--hairline)" }}>
          {["Pågår","Inte startat","Klart"].map((l,i)=>(
            <button key={l} style={{ flex:1, padding:"7px 0", fontSize:12, fontWeight:i===0?500:400, color:i===0?"var(--fg)":"var(--fg-muted)", background:i===0?"var(--surface)":"transparent", border:i===0?"1px solid var(--hairline)":"none", borderRadius:6, cursor:"pointer" }}>{l}</button>
          ))}
        </div>
      </div>
      {/* list */}
      <div style={{ flex:1, overflowY:"auto", padding:"0 16px 24px", display:"flex", flexDirection:"column", gap:10 }}>
        {SAMPLE_ROOMS.filter(r=>r.progress>0 && r.progress<100).map(r=>(
          <div key={r.id} style={{ position:"relative", background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:10, padding:"14px 16px 14px 20px", display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ position:"absolute", left:0, top:14, bottom:14, width:3, background:r.color, borderRadius:"0 2px 2px 0" }}/>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, flex:1 }}>
                <div style={{ width:32, height:32, borderRadius:7, background:"var(--bg-sunken)", color:"var(--fg-muted)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Ico d={ROOM_TYPE_ICONS[r.type]} size={16}/>
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:500, color:"var(--fg)", letterSpacing:"-0.01em" }}>{r.name}</div>
                  <div style={{ fontSize:12, color:"var(--fg-muted)", fontFeatureSettings:'"tnum"' }}>{r.area.toFixed(1)} m² · {r.tasksDone}/{r.tasksTotal} arbeten</div>
                </div>
              </div>
              <PlaceOnPlanButton placed={r.placed}/>
              <RoomShape points={r.points} color={r.color} size={32}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <ProgressBar value={r.progress} color={r.color}/>
              <span style={{ fontSize:11, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"', minWidth:32, textAlign:"right" }}>{r.progress}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MOBIL — bottom-sheet drawer ───────────────────────────────────
window.RoomDrawerMobile = function RoomDrawerMobile() {
  const room = SAMPLE_ROOMS[0];
  return (
    <div style={{ width:390, height:844, background:"var(--bg)", overflow:"hidden", position:"relative", borderRadius:32, border:"1px solid var(--hairline)" }}>
      {/* canvas dim behind */}
      <div style={{ position:"absolute", inset:0, background:"var(--bg-sunken)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <svg width="240" height="180" viewBox="0 0 240 180" style={{ opacity:0.4 }}>
          <rect x="20" y="20" width="120" height="80" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5"/>
          <rect x="140" y="20" width="80" height="80" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5"/>
          <rect x="20" y="100" width="200" height="60" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5"/>
        </svg>
      </div>
      <div style={{ position:"absolute", inset:0, background:"rgba(20,20,20,0.18)" }}/>
      {/* sheet */}
      <div style={{ position:"absolute", left:0, right:0, bottom:0, height:680, background:"var(--surface)", borderRadius:"20px 20px 0 0", display:"flex", flexDirection:"column", boxShadow:"0 -8px 24px -4px rgba(0,0,0,0.12)" }}>
        {/* grabber */}
        <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 0" }}>
          <div style={{ width:36, height:4, borderRadius:2, background:"var(--hairline)" }}/>
        </div>
        {/* hero compact */}
        <div style={{ padding:"10px 20px 12px", borderBottom:"1px solid var(--hairline)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:48, height:48, borderRadius:8, background:"var(--bg-sunken)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <RoomShape points={room.points} color={room.color} size={36}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:10, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>Plan 1</div>
              <button style={{ background:"transparent", border:"none", padding:0, fontFamily:"var(--ff-display)", fontSize:22, fontWeight:300, letterSpacing:"-0.022em", color:"var(--fg)", display:"inline-flex", alignItems:"center", gap:5, cursor:"text" }}>
                {room.name}
                <Ico d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M18 2l4 4-12 12H6v-4L18 2z" size={11} style={{ opacity:0.3 }}/>
              </button>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3, flexWrap:"wrap" }}>
                <StatusPill status={room.status} clickable/>
                <PriorityPill priority={room.priority} clickable/>
              </div>
            </div>
          </div>
          {/* quick stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0, marginTop:10, paddingTop:10, borderTop:"1px solid var(--hairline)" }}>
            {[["Yta","14,2"],["m²"," "],["Volym","34,1"],["m³"," "]].map(([k,v],i)=>(
              i%2===0 ? (
                <div key={i} style={{ borderRight: i<2?"1px solid var(--hairline)":"none", paddingRight:8 }}>
                  <div style={{ fontSize:9, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{k}</div>
                  <div style={{ fontSize:13, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"' }}>{v}<span style={{ fontSize:10, color:"var(--fg-muted)", marginLeft:3 }}>{i===0?"m²":"m³"}</span></div>
                </div>
              ) : null
            ))}
            <div style={{ paddingLeft:8, borderLeft:"1px solid var(--hairline)" }}>
              <div style={{ fontSize:9, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Takhöjd</div>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"' }}>2,40<span style={{ fontSize:10, color:"var(--fg-muted)", marginLeft:3 }}>m</span></div>
            </div>
            <div style={{ paddingLeft:8 }}>
              <div style={{ fontSize:9, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Arbeten</div>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--fg)", fontFeatureSettings:'"tnum"' }}>{room.tasksDone}<span style={{ fontSize:10, color:"var(--fg-muted)" }}>/{room.tasksTotal}</span></div>
            </div>
          </div>
        </div>
        {/* always-visible notes */}
        <div style={{ padding:"10px 20px 6px" }}>
          <textarea defaultValue={room.notes} placeholder="Anteckningar..." rows={2} style={{ width:"100%", padding:"8px 10px", fontSize:13, fontFamily:"var(--ff-ui)", background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, color:"var(--fg)", outline:"none", resize:"none", lineHeight:1.5 }}/>
        </div>
        {/* tabs */}
        <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--hairline)", overflowX:"auto", padding:"0 12px" }}>
          {[["Översikt",null],["Material",null],["Mått",null],["Foton",4],["Checklistor",2],["Kommentarer",3],["Relaterat",13]].map(([l,c],i)=>(
            <button key={l} style={{ padding:"11px 10px", fontSize:12, fontWeight:i===0?500:400, color:i===0?"var(--fg)":"var(--fg-muted)", background:"transparent", border:"none", borderBottom:i===0?"2px solid var(--fg)":"2px solid transparent", marginBottom:-1, whiteSpace:"nowrap", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5 }}>
              {l}
              {c && <span style={{ fontSize:10, color:"var(--fg-muted)", fontFeatureSettings:'"tnum"' }}>{c}</span>}
            </button>
          ))}
        </div>
        {/* content (overview) */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 20px", display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <SectionLabel>Kundens önskemål</SectionLabel>
            <div style={{ padding:12, background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6, fontSize:13, color:"var(--fg-muted)", fontStyle:"italic", lineHeight:1.5 }}>"Lugnt och tidlöst — ingen industridesign. Helst eget kök från Marbodal i mörkgrön."</div>
          </div>
          <div>
            <SectionLabel>Framsteg</SectionLabel>
            <div style={{ padding:12, background:"var(--bg)", border:"1px solid var(--hairline)", borderRadius:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:12 }}>
                <span style={{ color:"var(--fg-muted)" }}>{room.tasksDone} av {room.tasksTotal} arbeten klara</span>
                <span style={{ fontWeight:500, color:"var(--fg)" }}>{room.progress}%</span>
              </div>
              <ProgressBar value={room.progress} color={room.color}/>
            </div>
          </div>
        </div>
        {/* sticky CTA — Delete + View Elevation + Save */}
        <div style={{ padding:"10px 16px 18px", borderTop:"1px solid var(--hairline)", background:"var(--bg)", display:"flex", gap:6, alignItems:"center" }}>
          <button title="Ta bort" style={{ width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", color:"#B5341E", background:"transparent", border:"1px solid var(--hairline)", borderRadius:8, cursor:"pointer" }}>
            <Ico d={icons.trash} size={14}/>
          </button>
          <button style={{ flex:1, padding:"11px 12px", fontSize:13, fontWeight:500, color:"var(--fg)", background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8, cursor:"pointer" }}>Elevation</button>
          <button style={{ flex:1, padding:"11px 14px", fontSize:13, fontWeight:500, color:"var(--bg)", background:"var(--fg)", border:"1px solid var(--fg)", borderRadius:8, cursor:"pointer" }}>Spara</button>
        </div>
      </div>
    </div>
  );
};

// ─── STRATEGY CARD ─────────────────────────────────────────────────
window.RumStrategy = function RumStrategy() {
  return (
    <div style={{ width:1280, padding:"40px 56px", background:"var(--surface)", border:"1px solid var(--hairline)", borderRadius:8 }}>
      <div style={{ fontSize:11, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Rum v2 · Strategi (post-parity)</div>
      <h1 className="font-display" style={{ fontSize:38, fontWeight:300, letterSpacing:"-0.024em", margin:"0 0 18px", maxWidth:760 }}>Rum med karaktär — utan att tappa funktionalitet.</h1>
      <p style={{ fontSize:15, color:"var(--fg-muted)", lineHeight:1.6, maxWidth:780, margin:"0 0 28px" }}>Designen är uppdaterad efter feature-parity-audit. Alla 14 sektioner från befintlig drawer har en plats: 7 tabs + alltid-synliga interna anteckningar. Sort, bulk-select, MapPin-action och tabellvy är tillbaka i listan.</p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:24 }}>
        {[
          { k:"Lista", t:"Power-features tillbaka", d:"Sort-dropdown (6 alt), Visa fält (16 alt), Välj-läge med bulk-radera, kort↔tabell-toggle. \"Placera på ritning\" som primär höger-action på varje rad — färgkodad efter status." },
          { k:"Drawer", t:"7 tabs + alltid-synliga notes", d:"Inline-edit namn, klickbara status- och prioritetspills, canvas-färgväljare på rumssvg, FilledDots på tabbarna när data saknas. Materialtabben innehåller golv+tak, väggar+snickerier, el+värme — varsin sektion." },
          { k:"Action bar", t:"Delete + Elevation tillbaka", d:"Ta bort (vänster, lågkontrast destructive), Visa elevation (sekundär), Stäng + Spara. Mobil: ikon-knapp för Ta bort, Elevation och Spara på en rad." },
        ].map(c=>(
          <div key={c.k} style={{ padding:"22px 0 0", borderTop:"1px solid var(--fg)" }}>
            <div style={{ fontSize:11, fontWeight:500, color:"var(--fg-muted)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{c.k}</div>
            <h3 className="font-display" style={{ fontSize:20, fontWeight:400, letterSpacing:"-0.014em", margin:"0 0 8px" }}>{c.t}</h3>
            <p style={{ fontSize:13, color:"var(--fg-muted)", lineHeight:1.55, margin:0 }}>{c.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

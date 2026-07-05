
class Component extends DCLogic {
  constructor(props){
    super(props);
    this.PAL=[['#EAF6F0','#0F7048'],['#EEF2FF','#2747C9'],['#F1E9FE','#7A3FB0'],['#FBF3E2','#8A5A14'],['#FCEFEF','#B42318'],['#E9F3FB','#1E6FA8'],['#F0F2F4','#5A5D63']];
    this.SEL={
      'Asylum Case Status':['—','Pending','Filed','Granted','Denied','Referred'],
      'I589 Biom Status':['—','Scheduled','Completed','Pending','Waived'],
      'Relief Filed?':['—','Yes','No'],
      'USCIS FOIA Stage':['—','Requested','Received','In Review','Complete'],
      'Client Engagement Status':['Engaged','Prospect','On hold','Closed'],
      'Case Status':['Intake','In proceedings','USCIS pending','Detained','Granted','Closed'],
    };
    this.TAGK=['Country','Relief Sought','Invoiced','Case Type','Priority Level'];
    this.DATEK=['DOB','Entry Date','Date Relief Filed','FOIA Receipt','FOIA CD Date','NTA Date'];
    this.LONGK=['Client Contact Notes','Case Notes','EAD Comments','Client Notes'];
    this.LINKK=['PP','box_shared_link','USCIS FOIA Link'];

    // No seed data — clients/cases/notes are folded from the workspace's
    // end-to-end-encrypted Matrix room timeline (see buildClients/refold).

    this.DEF={
      editClient:[
        {id:'p',type:'photo',fields:['Client_Photo'],side:['Bahr']},
        {id:'g1',type:'grid',cols:2,fields:['A#','Case Manager']},
        {id:'g2',type:'grid',cols:3,fields:['Country','DOB','Age']},
        {id:'g3',type:'grid',cols:1,fields:['First Name','Middle Name','Family Name','Entry Date','Address','Phone Number','Client Email']},
        {id:'lp',type:'link',fieldKey:'PP',label:'Link to Practice Panther'},
      ],
      eadClient:[
        {id:'p',type:'photo',fields:['Client_Photo'],side:['Age','Bahr']},
        {id:'g1',type:'grid',cols:2,fields:['A#','Case Manager']},
        {id:'g2',type:'grid',cols:2,fields:['Country','DOB']},
        {id:'g3',type:'grid',cols:3,fields:['First Name','Middle Name','Family Name']},
        {id:'g4',type:'grid',cols:1,fields:['Entry Date','Address','Phone Number','Client Email']},
        {id:'lp',type:'link',fieldKey:'PP',label:'Link to Practice Panther'},
      ],
      courtClient:[
        {id:'p',type:'photo',fields:['Client_Photo'],side:['A#','Relief Sought','Date Relief Filed','I589 Biom Status']},
        {id:'n1',type:'note',fieldKey:'Client Contact Notes',label:'Client Contact Notes'},
        {id:'n2',type:'note',fieldKey:'Case Notes',label:'Case Notes'},
        {id:'g1',type:'grid',cols:2,fields:['Entry Date','Asylum Case Status']},
        {id:'lk',type:'lookup',fieldKey:'Case Manager',label:'Case Manager (from Client Info)'},
        {id:'hd',type:'heading',text:'EAD Status'},
        {id:'g2',type:'grid',cols:2,fields:['Relief Filed?','USCIS FOIA Stage']},
        {id:'n3',type:'note',fieldKey:'EAD Comments',label:'EAD Comments'},
        {id:'ac',type:'activity',label:'Case Events'},
      ],
      foiaEntry:[
        {id:'p',type:'photo',fields:['Client_Photo'],side:[]},
        {id:'g1',type:'grid',cols:1,fields:['USCIS FOIA Stage','Client Name','FOIA #','FOIA Receipt','USCIS FOIA Link','FOIA CD Date']},
        {id:'lb',type:'link',fieldKey:'box_shared_link',label:'box link'},
        {id:'ck',type:'check',fieldKey:'USCIS FOIA',label:'USCIS FOIA'},
      ],
    };
    this.LMETA={
      editClient:{name:'Edit Client Info',icon:'pencil-simple-line',meta:'Client Info · single column'},
      eadClient:{name:'EAD Client Info',icon:'identification-badge',meta:'Client Info · compact'},
      courtClient:{name:'Court Client',icon:'gavel',meta:'Case Master View'},
      foiaEntry:{name:'USCIS FOIA Data Entry',icon:'file-magnifying-glass',meta:'FOIA fields'},
    };
    this.LORDER=['editClient','eadClient','courtClient','foiaEntry'];

    this.FOLDERS=[
      {id:'client',name:'Client Info',layouts:['editClient','eadClient']},
      {id:'court',name:'Court',layouts:['courtClient']},
      {id:'foia',name:'FOIA',layouts:['foiaEntry']},
    ];
    // ── Live Matrix transport: real homeserver login, encrypted rooms, fold ──
    this.NS='app.aminoimmigration'; this.HOMESERVER='https://app.aminoimmigration.com';
    this.clients=[]; this.workspaces=[]; this.curWs=null;
    // Demo path (mirrors bare-metal's "explore demo data"): an in-memory event
    // store of immigration seed spaces, folded through the same pipeline as a
    // live homeserver. Nothing leaves the browser; edits persist to localStorage.
    this.demo=false; this._demoRooms=[]; this._demoEvents={}; this.DEMO_KEY='amino.demo.store.v1';
    // Live imported-set materialization: the data bare-metal imported lives in
    // encrypted blobs, reconstructed on read (window.AminoRows). We project the
    // "Client Info" set's rows as AMINO clients. Cache per import anchor so a
    // re-fold doesn't re-fetch; cap projected rows so a huge sheet can't freeze
    // the DOM.
    this._importRows={}; this._importInFlight=new Set(); this._liveState=null;
    this.CLIENT_SET_RE=/client\s*info/i; this.MAX_CLIENTS=4000;
    // ── Lean steady-state: fold once, then stay still until a NEW event lands ──
    // Per-room folded-state cache. After the first fold of a room we apply only
    // the events appended since (foldRoom), so an idle app does no fold work and
    // an edit folds O(1) instead of re-folding the whole timeline. _renderVer
    // bumps whenever the projected render-state changes, so the Database grid can
    // memoize its (expensive) table build and skip it on idle re-renders.
    this._foldCache={}; this._renderVer=0; this._importRowsVer=0; this._builtCache=null; this._colCache=null;
    this._renderedRoom=null; this._renderedVer=-1; this._renderedWsSig='';
    // Database grid windowing — render only a bounded slice of rows into the DOM
    // (grows on scroll / "Load more"), so a 12k-row imported sheet can't explode
    // the DOM and crash the tab. DB_PAGE is the initial + per-step row count.
    this.DB_PAGE=100; this._dbHasMore=false; this._scrollHooked=false;
    this._onAnyScroll=this._onAnyScroll.bind(this);
    // Sync & storage page — periodic snapshot of the bridge's sync/storage state.
    this._syncTimer=null; this._preSyncView=null;
    // dbTable:'' / dbView:{} — the Database view is now set-driven (dbModel),
    // not the old fixed three-table map. booting — the cold-boot resume flag
    // from PR #32's duplicate-login fix. Both kept.
    this.state={ view:'crm', cur:0, layout:'editClient', customize:false, search:'', dbTable:'', dbSearch:'', dbView:{}, dbViewSearch:'', dbLimit:this.DB_PAGE, dbShowAllCols:false, syncSnap:null, airtableOpen:false, airtableTicket:0, favs:['editClient'], folderOpen:{client:true,court:true,foia:true}, railCollapsed:false, listCollapsed:false, viewsCollapsed:false, tab:'clientinfo', panelView:'clients', railWidth:212, dbRecord:null, vals:{}, ef:null, draft:'', noteDraft:'', layouts:JSON.parse(JSON.stringify(this.DEF)), extraNotes:{},
      connected:false, connecting:false, booting:false, wsSyncing:false, demo:false, session:null, loginHs:this.HOMESERVER, loginUser:'', loginPass:'', loginErr:'', newSpaceName:'', spacePickerOpen:false };
    try{ window.AminoApp=this; }catch(e){}
    // Boot: bind the namespace, subscribe to live changes, and adopt a restored
    // session. The foundation auto-unlocks a prior login on cold start, but that
    // resume is ASYNC — it can settle AFTER this component has mounted and shown
    // the login form. If we left the form up, the user would sign in again,
    // minting a SECOND device and resetting this device's crypto store (the
    // "login issue when already logged in" bug). So: while the resume is in
    // flight, show a "resuming" screen instead of the login form, and adopt the
    // session the moment it lands (here on cold boot, or via onLiveChange when
    // the bridge notifies that the resume finished).
    this.whenLive().then(()=>{ try{
      this.ME().setNamespace(this.NS);
      if(!this._unsub) this._unsub=this.ML().subscribe(()=>this.onLiveChange());
      this.setState({booting:!!(this.ML().isBooting&&this.ML().isBooting())});
      this.adoptLiveSession();
    }catch(e){ this.setState({booting:false}); } });
  }

  // ── foundation bridges (window.MatrixLive = real homeserver; window.MatrixEngine = fold) ──
  whenLive(){ return new Promise(res=>{ const t=()=>{ if(window.MatrixLive&&window.MatrixEngine) res(); else setTimeout(t,60); }; t(); }); }
  ML(){ return window.MatrixLive; }
  ME(){ return window.MatrixEngine; }

  // Mirror the foundation's live auth state into the UI. Idempotent — safe to
  // call as often as we like. Returns true when a live (non-demo) Matrix
  // session is active. The FIRST time we observe that session we land on the
  // spaces launchpad: this is what lets a cold-boot resume (which finishes
  // asynchronously, often after this component has already rendered the login
  // form) REPLACE the login form rather than leave it on screen, where a click
  // would start a duplicate login — a new device + a crypto-store reset.
  adoptLiveSession(){
    if(this.demo) return false;
    const ML=this.ML();
    if(!ML||!(ML.isAuthed&&ML.isAuthed())) return false;
    if(!this.state.connected){
      const sess=(ML.getSession&&ML.getSession())||{};
      this.demo=false;
      this.setState({connected:true,demo:false,booting:false,connecting:false,session:{homeserver:this.HOMESERVER,userId:sess.mxid||sess.userId||''},view:'spaces'});
      this.pollWorkspaces();
    }
    return true;
  }
  // The foundation bridge fired a change: a cold-boot resume settled, a room
  // updated, or the session ended. Keep the UI in step with it.
  onLiveChange(){
    if(this.demo){ this.scheduleRefold(); return; }
    const ML=this.ML();
    // Resume settled — drop the "resuming" screen so the adopted session (or
    // the login form, if there was nothing to resume) can take over.
    if(this.state.booting&&!(ML&&ML.isBooting&&ML.isBooting())) this.setState({booting:false});
    const wasConnected=this.state.connected;
    // Adopt a session that came up after we mounted (the core fix); when we
    // were already connected, keep the workspace list fresh on every change.
    if(this.adoptLiveSession()&&wasConnected) this.loadWorkspaces();
  }

  // Sign in against the hardcoded firm homeserver. No app-managed credential store:
  // the password unlocks the user's own Matrix account + E2EE keys on this device.
  async connect(){
    try{ await this.whenLive(); }catch(e){}
    // Safety net for the resume race: if the foundation already restored a
    // session (or one came up while this form was on screen), adopt it instead
    // of logging in again. A second m.login.password mints a NEW device and
    // resets this device's crypto store — the "won't sign me in when I'm
    // already signed in" bug. The login form is only reachable when signed out,
    // so reaching here while authed always means the resume beat the UI.
    if(this.adoptLiveSession()) return;
    const u=(this.state.loginUser||'').trim();
    if(!u||!this.state.loginPass){ this.setState({loginErr:'Enter your Matrix ID and password.'}); return; }
    this.setState({loginErr:'',connecting:true,booting:false});
    try{
      await this.ML().login({ homeserver:this.HOMESERVER, username:u, password:this.state.loginPass });
      const sess=this.ML().getSession()||{};
      this.demo=false;
      // Land on the spaces launchpad — let the user pick which workspace to open
      // instead of dropping silently into the first one.
      this.setState({connected:true,demo:false,connecting:false,booting:false,session:{homeserver:this.HOMESERVER,userId:sess.mxid||sess.userId||u},loginPass:'',view:'spaces'});
      this.pollWorkspaces();
    }catch(e){ this.setState({connecting:false,loginErr:(e&&e.message)||'Sign-in failed.'}); }
  }
  // Explore demo data without a homeserver — seeds a handful of immigration
  // workspaces locally and folds them through the same pipeline as a live login.
  async exploreDemo(){
    try{ await this.whenLive(); }catch(e){}
    try{ this.ME().setNamespace(this.NS); }catch(e){}
    this._resetFoldCaches();
    const saved=this.loadDemo();
    if(saved&&Array.isArray(saved.rooms)&&saved.rooms.length){ this._demoRooms=saved.rooms; this._demoEvents=saved.eventsByRoom||{}; }
    else { const built=this.buildDemoSpaces(); this._demoRooms=built.rooms; this._demoEvents=built.eventsByRoom; this.saveDemo(); }
    this.demo=true; this.curWs=null;
    this.setState({connected:true,demo:true,connecting:false,booting:false,loginErr:'',loginPass:'',session:{homeserver:'demo://aminoimmigration',userId:'@demo:aminoimmigration.com'},view:'spaces'});
    this.loadWorkspaces();
  }
  disconnect(){ try{ if(!this.demo&&this.ML()&&this.ML().logout) this.ML().logout(); }catch(e){} if(this._wsPollTimer){ clearTimeout(this._wsPollTimer); this._wsPollTimer=null; } if(this._syncTimer){ clearTimeout(this._syncTimer); this._syncTimer=null; } this._detachAirtableCoord(); this._openedWs=null; this.clients=[]; this.workspaces=[]; this.curWs=null; this.demo=false; this._resetFoldCaches(); this.setState({connected:false,demo:false,booting:false,wsSyncing:false,loginPass:'',cur:0,view:'crm',syncSnap:null,airtableOpen:false}); }
  // Drop every cached fold + projection so a new session never reads a prior
  // session's (or a different namespace's) state. Cheap; the next fold rebuilds.
  _resetFoldCaches(){ this._foldCache={}; this._builtCache=null; this._colCache=null; this._liveState=null; this._renderState=null; this._renderedRoom=null; this._renderedVer=-1; this._renderedWsSig=''; this._renderVer++; this._importRows={}; this._importRowsVer++; }
  backToSpaces(){ this.setState({view:'spaces',dbRecord:null}); }

  // ── demo store persistence (browser-local; no network) ──
  loadDemo(){ try{ const raw=localStorage.getItem(this.DEMO_KEY); if(!raw) return null; const p=JSON.parse(raw); return (p&&p.rooms&&p.eventsByRoom)?p:null; }catch(e){ return null; } }
  saveDemo(){ if(!this.demo&&!this._demoRooms.length) return; try{ localStorage.setItem(this.DEMO_KEY, JSON.stringify({rooms:this._demoRooms,eventsByRoom:this._demoEvents})); }catch(e){} }
  // The events backing a room — demo store when offline, the live bridge cache otherwise.
  eventsFor(roomId){ if(this.demo) return this._demoEvents[roomId]||[]; try{ return (this.ML().getEventsForRoom&&this.ML().getEventsForRoom(roomId))||[]; }catch(e){ return []; } }
  // The fold engine parses event types by namespace prefix, so it must use the
  // SAME namespace the events were written under or it folds *nothing*. Live
  // rooms are written by the foundation bridge under window.MatrixLive.NAMESPACE
  // (io.matrix-events); demo seed data is built under this.NS. Align the engine
  // to the active source before every fold — otherwise live rooms project 0
  // records even though the data is right there.
  liveNS(){ return (this.ML()&&this.ML().NAMESPACE)||'io.matrix-events'; }
  applyEngineNS(){ try{ this.ME().setNamespace(this.demo?this.NS:this.liveNS()); }catch(e){} }
  // One stored operator. Demo writes to the in-memory store (and persists);
  // live writes go through the encrypted homeserver bridge. Returns the anchor
  // for INS so callers can attach DEF/CON to the new entity.
  async emitOp(roomId, op, content){
    if(this.demo){
      const sender=(this.state.session&&this.state.session.userId)||'@demo:aminoimmigration.com';
      const ts=Date.now(); let c=content, anchor=(content&&content.anchor)||null;
      if(op===this.ME().OP.INS&&!anchor){ anchor=this.ME().makeAnchor(content.entity_type||'entity',content.payload||{},sender,ts); c=Object.assign({},content,{anchor}); }
      const ev={ event_id:'$amino_'+ts.toString(36)+'_'+Math.random().toString(36).slice(2,6), type:this.NS+'.'+op.key, content:c, sender, origin_server_ts:ts };
      (this._demoEvents[roomId]=this._demoEvents[roomId]||[]).push(ev); this.saveDemo();
      return anchor;
    }
    return await this.ML().emit(roomId, op, content);
  }

  // Immigration seed spaces for the demo path. Each workspace is an in-memory
  // room of DEF/INS/CON operators shaped exactly like window.MatrixLive.emit()
  // produces, so buildClients(fold(events)) projects real clients, cases and
  // notes — the same query path a live homeserver feeds.
  buildDemoSpaces(){
    const ME=this.ME(), ty=(op)=>this.NS+'.'+op.key;
    let t=1716600000000, seq=0; const next=()=>(t+=60000);
    const eid=()=>'$seed_'+(seq++).toString(36).padStart(4,'0');
    const rooms=[], byRoom={};
    const space=(roomId,name)=>{ rooms.push({roomId,name}); byRoom[roomId]=[]; return roomId; };
    const push=(roomId,op,content,sender)=>{ byRoom[roomId].push({event_id:eid(),type:ty(op),content,sender:sender||'@admin:aminoimmigration.com',origin_server_ts:next()}); };
    const schema=(roomId)=>push(roomId,ME.OP.DEF,{anchor:null,path:'_schema.tables',value:['client','case','note']});
    const client=(roomId,fields,sender)=>{ const anchor=ME.makeAnchor('client',{i:++seq},sender||'@admin:aminoimmigration.com',t); push(roomId,ME.OP.INS,{anchor,entity_type:'client',payload:{}},sender); Object.keys(fields).forEach(k=>{ const v=fields[k]; if(v!=null&&v!=='') push(roomId,ME.OP.DEF,{anchor,path:k,value:v},sender); }); return anchor; };
    const note=(roomId,clientAnchor,n,sender)=>{ const anchor=ME.makeAnchor('note',{i:++seq},sender||'@admin:aminoimmigration.com',t); push(roomId,ME.OP.INS,{anchor,entity_type:'note',payload:Object.assign({client:clientAnchor},n)},sender); };
    const link=(roomId,a,b,rel)=>push(roomId,ME.OP.CON,{source_anchor:a,target_anchor:b,relation_type:rel});

    // ── Space 1 — the active caseload ──
    const s1=space('!amino_active','RK Lacy Law — Active Caseload'); schema(s1);
    const a1=client(s1,{'First Name':'Maria Fernanda','Family Name':'Lopez','A#':'A 098-447-201','Country':'Honduras','DOB':'03/14/1990','Entry Date':'06/02/2021','Case Status':'In proceedings','Relief Sought':'Asylum','Client Engagement Status':'Engaged','Case Manager':'C. Vega','Phone Number':'(713) 555-0192','Client Email':'m.lopez@example.com','Matter':'Lopez — Asylum (EOIR)','Case Type':'Removal Defense','Priority Level':'High','NTA Date':'08/15/2023','Asylum Case Status':'Filed','I589 Biom Status':'Completed','Relief Filed?':'Yes','Date Relief Filed':'05/02/2025','box_shared_link':'https://app.box.com/s/lopez-mf','PP':'https://app.practicepanther.com/matters/lopez'});
    const a2=client(s1,{'First Name':'Patricio','Family Name':'San Juan','A#':'A 077-221-905','Country':'Guatemala','DOB':'11/02/1985','Entry Date':'01/19/2019','Case Status':'USCIS pending','Relief Sought':'Adjustment of Status','Client Engagement Status':'Engaged','Case Manager':'C. Vega','Phone Number':'(281) 555-7740','Matter':'San Juan — I-485','Case Type':'Family','Priority Level':'Medium'});
    const a3=client(s1,{'First Name':'Chiamaka','Family Name':'Okafor','A#':'A 213-665-118','Country':'Nigeria','DOB':'07/22/1993','Entry Date':'09/30/2022','Case Status':'Detained','Relief Sought':'Bond','Client Engagement Status':'Engaged','Case Manager':'A. Reyes','Priority Level':'High','Matter':'Okafor — Bond / Removal','Case Type':'Detained'});
    const a4=client(s1,{'First Name':'Bao','Family Name':'Nguyen','A#':'A 154-008-772','Country':'Vietnam','DOB':'02/09/1979','Entry Date':'03/12/2016','Case Status':'Granted','Relief Sought':'Asylum','Client Engagement Status':'Closed','Asylum Case Status':'Granted','Case Manager':'C. Vega','Matter':'Nguyen — Asylum (granted)'});
    const a5=client(s1,{'First Name':'Diego','Family Name':'Ramirez','Country':'Mexico','DOB':'05/27/1998','Case Status':'Intake','Relief Sought':'TPS','Client Engagement Status':'Prospect','Case Manager':'A. Reyes','Matter':'Ramirez — TPS (intake)'});
    note(s1,a1,{text:'I-589 filed with the court',type:'Filing',date:'May 2, 2025',by:'CVega',desc:'Asylum application + supporting declaration filed.'});
    note(s1,a1,{text:'Master calendar hearing',type:'Hearing',date:'Aug 14, 2025',by:'CVega',due:'Aug 14, 2025',desc:'EOIR Houston · Judge Patel · 8:30am.'});
    note(s1,a3,{text:'Prepare bond packet',type:'Task',date:'Jun 3, 2026',by:'AReyes',due:'Jun 20, 2026',desc:'Sponsor letter + community-ties evidence.'});
    note(s1,a2,{text:'Biometrics completed',type:'Note',date:'Apr 9, 2026',by:'CVega'});
    link(s1,a1,a2,'sibling');

    // ── Space 2 — asylum cohort ──
    const s2=space('!amino_asylum','Asylum Cohort 2026'); schema(s2);
    const b1=client(s2,{'First Name':'Amina','Family Name':'Haddad','A#':'A 320-117-554','Country':'Syria','DOB':'12/01/1992','Entry Date':'10/04/2023','Case Status':'In proceedings','Relief Sought':'Asylum','Client Engagement Status':'Engaged','Asylum Case Status':'Pending','I589 Biom Status':'Scheduled','Case Manager':'C. Vega','Matter':'Haddad — Asylum','Priority Level':'High'});
    const b2=client(s2,{'First Name':'Yusuf','Family Name':'Abdi','A#':'A 410-552-009','Country':'Somalia','DOB':'08/19/1988','Entry Date':'07/11/2022','Case Status':'In proceedings','Relief Sought':'Asylum','Client Engagement Status':'Engaged','Asylum Case Status':'Filed','I589 Biom Status':'Completed','Case Manager':'A. Reyes','Matter':'Abdi — Asylum'});
    const b3=client(s2,{'First Name':'Lucia','Family Name':'Moreno','A#':'A 288-330-461','Country':'Venezuela','DOB':'04/15/1996','Entry Date':'02/28/2023','Case Status':'USCIS pending','Relief Sought':'Affirmative Asylum','Client Engagement Status':'Engaged','Asylum Case Status':'Pending','Case Manager':'C. Vega','Matter':'Moreno — Affirmative asylum'});
    const b4=client(s2,{'First Name':'Tenzin','Family Name':'Dorjee','A#':'A 192-744-820','Country':'China (Tibet)','DOB':'09/03/1990','Entry Date':'05/21/2021','Case Status':'Granted','Relief Sought':'Asylum','Client Engagement Status':'Closed','Asylum Case Status':'Granted','Case Manager':'A. Reyes','Matter':'Dorjee — Asylum (granted)'});
    note(s2,b1,{text:'Individual hearing scheduled',type:'Hearing',date:'Sep 9, 2026',by:'CVega',due:'Sep 9, 2026'});
    note(s2,b2,{text:'Country-conditions packet filed',type:'Filing',date:'Mar 30, 2026',by:'AReyes'});
    note(s2,b3,{text:'USCIS asylum interview prep',type:'Appointment',date:'Jul 1, 2026',by:'CVega',due:'Jul 1, 2026'});

    // ── Space 3 — FOIA / EAD tracker ──
    const s3=space('!amino_foia','FOIA / EAD Tracker'); schema(s3);
    const c1=client(s3,{'First Name':'Maria Fernanda','Family Name':'Lopez','A#':'A 098-447-201','Country':'Honduras','USCIS FOIA Stage':'In Review','FOIA #':'NRC2025-123456','FOIA Receipt':'04/18/2025','USCIS FOIA Link':'https://first.uscis.gov/req/123456','FOIA CD Date':'06/01/2025','Relief Filed?':'Yes','box_shared_link':'https://app.box.com/s/lopez-foia','Client Engagement Status':'Engaged'});
    const c2=client(s3,{'First Name':'Yusuf','Family Name':'Abdi','A#':'A 410-552-009','Country':'Somalia','USCIS FOIA Stage':'Received','FOIA #':'NRC2026-771002','FOIA Receipt':'02/10/2026','Relief Filed?':'No','Client Engagement Status':'Engaged'});
    const c3=client(s3,{'First Name':'Lucia','Family Name':'Moreno','A#':'A 288-330-461','Country':'Venezuela','USCIS FOIA Stage':'Requested','FOIA #':'NRC2026-880551','Relief Filed?':'No','Client Engagement Status':'Engaged'});
    const c4=client(s3,{'First Name':'Bao','Family Name':'Nguyen','A#':'A 154-008-772','Country':'Vietnam','USCIS FOIA Stage':'Complete','FOIA #':'NRC2024-553410','FOIA Receipt':'11/02/2024','FOIA CD Date':'01/15/2025','Relief Filed?':'Yes','box_shared_link':'https://app.box.com/s/nguyen-foia','Client Engagement Status':'Closed'});
    note(s3,c1,{text:'FOIA CD received — indexing A-file',type:'Note',date:'Jun 2, 2025',by:'CVega'});
    note(s3,c2,{text:'Follow up on FOIA receipt',type:'Task',date:'Jun 10, 2026',by:'AReyes',due:'Jun 25, 2026'});

    return {rooms, eventsByRoom:byRoom};
  }

  // Workspaces = the encrypted rooms this user is a member of. Membership is the
  // access model: a teammate sees only the workspaces they've been invited to.
  loadWorkspaces(){
    try{
      const rooms=this.demo ? this._demoRooms.slice() : ((this.ML().listRooms&&this.ML().listRooms())||[]);
      this.workspaces=rooms.map(r=>({roomId:r.roomId||r.id,name:r.name||r.roomId||'Workspace'}));
      if((!this.demo)&&this.state.wsSyncing&&this.workspaces.length>0) this.setState({wsSyncing:false});
      if((!this.demo)&&rooms.length===0){ try{ const ss=this.ML().getSyncStatus&&this.ML().getSyncStatus(); console.debug('[amino] no eo.workspace rooms discovered yet — sync phase:', ss&&ss.phase, '· session:', this.ML().getSession&&this.ML().getSession()); }catch(e){} }
      if((!this.curWs||!this.workspaces.some(w=>w.roomId===this.curWs))&&this.workspaces[0]) this.curWs=this.workspaces[0].roomId;
      // First time we settle on a room, open (load+decrypt) it before folding.
      if(!this.demo && this.curWs && this.curWs!==this._openedWs){ this.openCurrent(); return; }
      this.refold();
    }catch(e){ this.forceUpdate(); }
  }
  // After a live sign-in the Matrix initial sync can deliver rooms AFTER the
  // launchpad first renders. The bridge fires notify('rooms') as they arrive
  // (→ onLiveChange → loadWorkspaces), but to be robust against a slow or missed
  // sync we ALSO actively re-list for a short window — so a real workspace can't
  // sit invisible behind a premature "create your first workspace." Shows a
  // syncing state until rooms appear or the window closes; Refresh re-arms it.
  pollWorkspaces(){
    if(this._wsPollTimer){ clearTimeout(this._wsPollTimer); this._wsPollTimer=null; }
    if(this.demo){ this.loadWorkspaces(); return; }
    const deadline=Date.now()+25000;
    const tick=()=>{
      this._wsPollTimer=null;
      if(this.demo||!this.state.connected) return;            // signed out / switched to demo
      this.loadWorkspaces();
      if(this.workspaces.length>0){ if(this.state.wsSyncing) this.setState({wsSyncing:false}); return; }
      if(Date.now()>=deadline){ this.setState({wsSyncing:false}); return; }
      this._wsPollTimer=setTimeout(tick,1500);
    };
    this.setState({wsSyncing:true});
    tick();
  }
  selectWorkspace(roomId){ this.curWs=roomId; this.setState({cur:0,ef:null,view:'crm',dbRecord:null}); if(this.demo) this.refold(); else this.openCurrent(); }
  // Load + decrypt the active room's event chain into the bridge BEFORE folding.
  // getEventsForRoom() returns an EMPTY buffer until openRoom() runs (it reads the
  // room's OPFS chain and syncs the server tail into memory) — so without this
  // every live workspace folds to 0 records, which is exactly what "0 records · 0
  // fields" was. openRoom dedupes (no-op if already open) and fires notify('events')
  // as history/tail arrive → onLiveChange → loadWorkspaces → refold fills it in.
  async openCurrent(){
    const room=this.curWs;
    if(this.demo||!room){ this.refold(); return; }
    this._openedWs=room;
    try{ if(this.ML().openRoom) await this.ML().openRoom(room); }
    catch(e){ this._openedWs=null; console.warn('[amino] openRoom failed:', e); }
    if(this.curWs===room) this.refold();
  }
  async createWorkspace(nameArg){
    const name=(typeof nameArg==='string'&&nameArg.trim())?nameArg.trim():((typeof prompt==='function')&&prompt('New workspace name')); if(!name) return;
    if(this.demo){
      const id='!amino_'+Math.random().toString(36).slice(2,8);
      this._demoRooms.push({roomId:id,name}); this._demoEvents[id]=[];
      await this.seedSchema(id); this.saveDemo();
      this.loadWorkspaces(); this.selectWorkspace(id); this.setState({newSpaceName:''});
      return;
    }
    try{ await this.whenLive(); const id=await this.ML().createRoom(name); await this.seedSchema(id); this.loadWorkspaces(); if(id) this.selectWorkspace(id); this.setState({newSpaceName:''}); }
    catch(e){ this.toast('Could not create workspace: '+((e&&e.message)||e)); }
  }
  async inviteTeammate(){
    if(!this.curWs){ this.toast('Open a workspace first.'); return; }
    if(this.demo){ this.toast('Inviting teammates needs a live homeserver. Sign in to app.aminoimmigration.com to invite collaborators.'); return; }
    const mxid=(typeof prompt==='function')&&prompt('Invite a teammate by Matrix ID — e.g. @sam:aminoimmigration.com'); if(!mxid) return;
    try{ await this.ML().inviteUser(this.curWs,mxid.trim()); this.toast('Invited '+mxid.trim()); }
    catch(e){ this.toast('Invite failed: '+((e&&e.message)||e)); }
  }
  // schema-as-log: declare the entity field set so any cooperating client renders it.
  async seedSchema(roomId){ try{ await this.emitOp(roomId, this.ME().OP.DEF, { anchor:null, path:'_schema.tables', value:['client','case','note'] }); }catch(e){} }
  toast(m){ try{ if(typeof alert==='function') alert(m); else console.log(m); }catch(e){ console.log(m); } }

  // state = fold(timeline). Rebuild the projected client list from the current
  // workspace's events; never hold a second source of truth beside the fold.
  //
  // "Initialized, then still": the fold is cached per room (foldRoom), so once a
  // room is folded the app does NO fold work until a new event arrives. When the
  // current room hasn't changed (and the workspace list hasn't), refold returns
  // immediately without rebuilding the projection or re-rendering — the steady
  // state is genuinely idle. Only a real change (a new event, a new workspace, a
  // freshly materialized import blob) rebuilds and re-renders.
  refold(){
    if(!this.curWs||!window.MatrixEngine||!window.MatrixLive){ this.forceUpdate(); return; }
    try{
      this.applyEngineNS();
      const state=this.foldRoom(this.curWs);
      const ver=(this._foldCache[this.curWs]||{}).ver||0;
      const wsSig=this.workspaces.map(w=>w.roomId).join('|');
      // Nothing changed since the last render → stay still (no rebuild, no setState).
      // Only short-circuit on the heavy record/grid views; the spaces launchpad
      // re-derives per-workspace counts each render, so let it through.
      const heavy=this.state.view==='crm'||this.state.view==='db';
      if(heavy&&this._renderState&&this._renderedRoom===this.curWs&&this._renderedVer===ver&&this._renderedWsSig===wsSig) return;
      this._renderedRoom=this.curWs; this._renderedVer=ver; this._renderedWsSig=wsSig;
      this._liveState=state;
      // The state the Database grid + CRM both read: live = fold + materialized
      // import rows (+ link edges) via window.AminoDB.augmentState; demo = the
      // fold itself (no imports). Built once here so every projection — clients,
      // the grid, the record drawer — sees one consistent source of truth.
      this._renderState=(window.AminoDB&&!this.demo)
        ? window.AminoDB.augmentState(state,this._importRows,window.AminoDB.activeImportAnchors(state))
        : state;
      this._renderVer++;
      this._syncRowStore(state);
      this.clients=this.demo ? this.buildClients(state) : this.projectLive(state);
      if(!this.demo) this.materializeLive(state);
      // Light up Airtable two-way sync for this room once we hold its fold.
      this._syncAirtableCoord();
      let cur=this.state.cur; if(cur>=this.clients.length) cur=0;
      this.setState({cur,vals:{},extraNotes:{}});
    }catch(e){ this.forceUpdate(); }
  }
  // Coalesce a burst of change notifications into a single refold on the next
  // frame, so a flurry of sync events (or fast typing in the demo) folds + renders
  // once rather than N times. Falls back to a microtask when rAF is unavailable.
  scheduleRefold(){
    if(this._refoldQueued) return;
    this._refoldQueued=true;
    const run=()=>{ this._refoldQueued=false; this.refold(); };
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(run);
    else setTimeout(run,16);
  }

  // ── Airtable two-way sync ─────────────────────────────────────────────────
  // The engine (airtable-sync.js), turn-taking coordinator (airtable-coordinator.js)
  // and import dialog (airtable-import.jsx → window.AirtableSchemaModal) are the
  // foundation's exact modules; the backend hooks they call (MatrixLive.importFile
  // / the WCK-sealed shared PAT / the _recordId·_deleted·import_seq shadow in
  // db-data.js) already exist in AMINO. This just wires them into the app shell.

  // Which Airtable base this workspace is synced to, discovered from the imported
  // entities themselves (source:'airtable' → airtable_base). A workspace is
  // typically one base, so pick the base with the most imported tables. null when
  // nothing Airtable was ever imported → sync stays dormant (bare-metal parity).
  airtableBaseId(){
    const st=this._liveState; if(!st||!st.entities) return null;
    const tally={};
    for(const e of Object.values(st.entities)){
      if(e&&e._type==='import'&&e.source==='airtable'&&e.airtable_base){
        tally[e.airtable_base]=(tally[e.airtable_base]||0)+1;
      }
    }
    let best=null,n=-1; for(const k in tally){ if(tally[k]>n){ n=tally[k]; best=k; } }
    return best;
  }

  // Attach/detach window.AirtableCoord for the open room. Idempotent: keyed on
  // (roomId|baseId) so a re-fold doesn't re-attach, and only a real change (room
  // switch, or a first Airtable import landing) re-runs it. Runs regardless of the
  // active view so a raised hand keeps pulling in the background.
  _syncAirtableCoord(){
    const Coord=window.AirtableCoord; if(!Coord) return;
    const S=this.state;
    const live=!!(S.session&&!this.demo&&this.curWs&&String(this.curWs).startsWith('!'));
    const baseId=live?this.airtableBaseId():null;
    const sig=(live&&baseId)?(this.curWs+'|'+baseId):'';
    if(sig===this._atCoordSig) return;
    this._atCoordSig=sig;
    if(!sig){ try{ if(Coord.status&&Coord.status().attached) Coord.detach(); }catch(e){} return; }
    let displayName=null;
    try{ displayName=(this.ML().getMyDisplayName&&this.ML().getMyDisplayName())||null; }catch(e){}
    try{
      Coord.attach({
        roomId:this.curWs, baseId, userId:S.session.userId, displayName,
        getState:()=>this._liveState||this.foldRoom(this.curWs),
        emit:(op,content)=>this.emitOp(this.curWs,op,content),
        log:(m)=>{ try{ console.debug('[airtable]',m); }catch(e){} },
      });
    }catch(e){ this._atCoordSig=''; console.warn('[amino] airtable coord attach failed:',e); }
  }
  _detachAirtableCoord(){
    this._atCoordSig='';
    try{ const C=window.AirtableCoord; if(C&&C.status&&C.status().attached) C.detach(); }catch(e){}
  }
  // Compact relative time ("5m ago") for sync timestamps in the grid header.
  _relTime(ts){ if(!ts) return ''; const d=Date.now()-ts; if(d<5000) return 'just now'; if(d<60000) return Math.floor(d/1000)+'s ago'; if(d<3600000) return Math.floor(d/60000)+'m ago'; if(d<86400000) return Math.floor(d/3600000)+'h ago'; return Math.floor(d/86400000)+'d ago'; }
  // Read-only snapshot of the Airtable sync state for the open room, from the
  // same globals the Sync-page panel uses. Defensive: absent globals → dormant.
  _airtableStatus(){
    let cs={}; try{ const C=window.AirtableCoord; cs=(C&&C.status)?C.status():{}; }catch(e){}
    let info={}; try{ const ML=this.ML&&this.ML(); info=(ML&&ML.getAirtableTokenInfo)?ML.getAirtableTokenInfo(this.curWs):{}; }catch(e){}
    return {
      attached:!!cs.attached,
      connected:!!(info&&info.shared),          // a token is shared for the room
      ready:!!(info&&info.haveToken),            // …and unsealed on this device
      pulling:!!(cs.pull&&cs.pull.running),
      lastPull:(cs.pull&&cs.pull.lastSync)||null,
    };
  }
  // Pull one table from Airtable on demand, right from the grid. Routes through
  // the coordinator's per-table sweep (any member with the shared token, no turn
  // needed) — the same call the Sync-page panel makes. With no token shared yet,
  // it guides the user to the Sync page to connect one, answering "how do I sync
  // from Airtable" where they actually look at the table.
  _syncTableFromAirtable(name){
    if(!name||this._atSyncing) return;
    const st=this._airtableStatus();
    if(!st.connected){ this.toast('Connect an Airtable token on the Sync page to pull updates from Airtable.'); if(this.openSync) this.openSync(); return; }
    const C=window.AirtableCoord;
    if(!C||!C.syncTableOnce){ this.toast('Airtable sync isn’t ready yet — open the Sync page to check the connection.'); if(this.openSync) this.openSync(); return; }
    this._atSyncing=name; this.setState({});
    Promise.resolve(C.syncTableOnce(name))
      .then(()=>{ this.toast('Synced “'+name+'” from Airtable.'); })
      .catch(e=>{ this.toast('Airtable sync failed: '+((e&&e.message)||e)); })
      .then(()=>{ this._atSyncing=null; this.setState({}); });
  }

  // The Airtable import dialog (window.AirtableSchemaModal) — connect with a PAT,
  // pick a base, pull its schema + records into this workspace. A fresh ticket
  // remounts the dialog each open. Needs a live room to store the row blobs.
  openAirtable(){
    if(this.demo||!this.curWs||!String(this.curWs).startsWith('!')){
      this.toast('Open a live workspace first to import from Airtable.'); return;
    }
    this.setState({airtableOpen:true, airtableTicket:(this.state.airtableTicket||0)+1, spacePickerOpen:false});
  }
  closeAirtable(){
    this.setState({airtableOpen:false});
    // A schema/import just landed → re-fold so the new tables (and the base the
    // coordinator watches) appear immediately.
    this.scheduleRefold();
  }
  // The namespace the engine folds under for a room's events (demo seed vs the
  // live bridge namespace). Part of the fold-cache key so a namespace switch
  // never serves a stale fold.
  _engineNS(){ return this.demo?this.NS:this.liveNS(); }
  // Cached / incremental fold for one room. Returns the folded state, reusing the
  // cache when the event buffer is unchanged, and folding ONLY the appended tail
  // when it has grown (same prefix). Any reorder / back-fill (the prefix changed,
  // e.g. a late-decrypted older event) falls back to a correct full fold. `ver`
  // increments on every real fold so callers can detect "did anything change?".
  foldRoom(roomId){
    const ME=this.ME();
    if(!roomId||!ME||!ME.fold) return {entities:{},connections:[],schema:{},partitions:{},frames:[]};
    const evid=(e)=>(e&&(e.event_id||e.id))||'';
    const events=this.eventsFor(roomId)||[];
    const n=events.length, ns=this._engineNS();
    const lastId=n?evid(events[n-1]):'';
    const cache=this._foldCache[roomId];
    // Unchanged buffer → return the cached fold untouched (no work at all).
    if(cache&&cache.ns===ns&&cache.len===n&&cache.lastId===lastId) return cache.state;
    // Append-only growth (prefix intact) → fold only the new tail onto the cache.
    if(cache&&cache.ns===ns&&n>cache.len&&evid(events[cache.len-1])===cache.boundaryId){
      const tail=events.slice(cache.len);
      const state=ME.foldFrom?ME.foldFrom(cache.state,tail):tail.reduce(ME.dispatch,cache.state);
      cache.state=state; cache.len=n; cache.lastId=lastId; cache.boundaryId=lastId; cache.ver=(cache.ver||0)+1;
      return state;
    }
    // First fold, or the buffer changed shape (reorder / back-fill / replaced) →
    // fold the whole thing from scratch and (re)seed the cache.
    const state=ME.fold(events);
    this._foldCache[roomId]={ state, len:n, lastId, boundaryId:lastId, ns, ver:((cache&&cache.ns===ns?cache.ver:0)||0)+1 };
    return state;
  }
  // Set names whose rows are amino "clients" — the firm's "Client Info" set
  // (declared in the room schema or named by an import).
  clientSetNames(state){
    const names=new Set();
    const declared=(state&&state.schema&&state.schema.tables)||[];
    declared.forEach(n=>{ if(this.CLIENT_SET_RE.test(n)) names.add(n); });
    Object.values((state&&state.entities)||{}).forEach(e=>{ if(e&&e._type==='import'&&e.derived_set&&this.CLIENT_SET_RE.test(e.derived_set)) names.add(e.derived_set); });
    if(!names.size) names.add('Client Info');
    return [...names];
  }
  // Build the live client list from the augmented render state: only entities in
  // a client set (the firm's "Client Info", or native `client`) become clients —
  // case/note/other imported sets stay their own tables in the Database view.
  projectLive(state){
    const rs=this._renderState||state||{entities:{},connections:[]};
    const clientSets=new Set(this.clientSetNames(rs));
    const entities={};
    for(const a in (rs.entities||{})){ const e=rs.entities[a]; if(!e) continue; if(e._type==='client') entities[a]=e; else if(clientSets.has(e._type)) entities[a]=Object.assign({},e,{_type:'client'}); }
    let clients=this.buildClients({entities, connections:(rs.connections)||[]});
    if(this.MAX_CLIENTS && clients.length>this.MAX_CLIENTS) clients=clients.slice(0,this.MAX_CLIENTS);
    return clients;
  }
  // Fetch + cache the rows for EVERY imported set in this workspace (newest
  // generation only) — not just clients — so the Database grid fills in as each
  // blob streams in. Each completion rebuilds the render state and re-projects.
  materializeLive(state){
    const AR=window.AminoRows, DB=window.AminoDB; if(!AR||!AR.materializeImportRows||!DB) return;
    const imps=DB.importEntitiesOf(state);
    const active=AR.activeImports?AR.activeImports(imps):imps;
    const missing=active.filter(e=>e&&e._anchor&&!this._importRows[e._anchor]&&!this._importInFlight.has(e._anchor));
    if(!missing.length) return;
    missing.forEach(imp=>{
      this._importInFlight.add(imp._anchor);
      Promise.resolve(AR.materializeImportRows(imp)).then(rows=>{ if(Array.isArray(rows)){ this._importRows[imp._anchor]=rows; this._importRowsVer++; } })
        .catch(()=>{})
        .then(()=>{
          this._importInFlight.delete(imp._anchor);
          const st=this._liveState||state;
          this._renderState=DB.augmentState(st,this._importRows,DB.activeImportAnchors(st));
          this._renderVer++;
          this._syncRowStore(st);
          this.clients=this.projectLive(st);
          let cur=this.state.cur; if(cur>=this.clients.length) cur=0;
          this.setState({cur});
        });
    });
  }
  // Mirror the newest generation of every imported set into the columnar row
  // store (AminoRowStore) so the Database grid answers with query() — the
  // O(window) path. Rebuilds each set from the already-materialized _importRows,
  // grouped by derived_set across a set's active import chunks.
  _syncRowStore(state){
    const RS=window.AminoRowStore, DB=window.AminoDB;
    if(!RS||!DB||this.demo||!this._importRows) return;
    if(!this._rowStore) this._rowStore=RS.create();
    const active=DB.activeImportAnchors(state), ents=(state&&state.entities)||{};
    const bySet={};
    for(const anchor in this._importRows){ if(!active.has(anchor)) continue; const imp=ents[anchor]; const set=imp&&imp.derived_set; if(!set) continue; (bySet[set]||(bySet[set]=[])).push.apply(bySet[set],this._importRows[anchor]); }
    for(const set in bySet) this._rowStore.loadSet(set,bySet[set]);
  }
  // ── the Database view spec (the real toolbar) ── per-set { sort, group,
  // filter, hidden } that compiles into AminoRowStore.query() params. Persisted
  // per set name so switching tabs keeps each table's filter/sort/group/hide.
  _dbSpec(set){ const s=(this.state.dbSpecs||{})[set]; return {type:(s&&s.type)||'table',sort:(s&&s.sort)||[],group:(s&&s.group)||null,filter:(s&&s.filter)||null,hidden:(s&&s.hidden)||[],dateField:(s&&s.dateField)||null}; }
  // A column is date-like if ≥70% of its sampled values parse as ISO-ish dates —
  // how the calendar view finds its date field (inferType never labels 'date').
  _looksDate(vals){ let ok=0,tot=0; for(const v of (vals||[])){ if(v==null||v==='') continue; tot++; const s=String(v); if(/\d{4}-\d{2}-\d{2}/.test(s)&&!isNaN(Date.parse(s))) ok++; } return tot>0&&ok/tot>=0.7; }
  _patchSpec(set,patch){ this.setState(st=>{ const cur=(st.dbSpecs||{})[set]||{}; return {dbSpecs:Object.assign({},st.dbSpecs,{[set]:Object.assign({},cur,patch)}), dbLimit:this.DB_PAGE}; }); }
  // Click a column header to cycle its sort: off → asc → desc → off (single-key;
  // the query engine supports multi-key, exposed later).
  _cycleSort(set,field){ const found=(this._dbSpec(set).sort||[]).find(s=>s.field===field), dir=found?found.dir:''; const next=dir===''?'asc':dir==='asc'?'desc':''; this._patchSpec(set,{sort:next?[{field,dir:next}]:[]}); }
  _hideField(set,field){ const cur=this._dbSpec(set).hidden||[]; if(cur.indexOf(field)>=0) return; this._patchSpec(set,{hidden:cur.concat([field])}); }
  // Filter button: toggle a "primary is not empty" clause (a real predicate over
  // query()); the full per-type builder UI is the fast-follow.
  _toggleFilter(set,primary){ if(this._dbSpec(set).filter){ this._patchSpec(set,{filter:null}); return; } if(!primary) return; this._patchSpec(set,{filter:{op:'and',clauses:[{field:primary,op:'isNotEmpty'}]}}); }
  // Group button: cycle through the eligible (select/boolean) columns → off.
  _cycleGroup(set,groupables){ const list=groupables||[]; if(!list.length){ this._patchSpec(set,{group:null}); return; } const cur=this._dbSpec(set).group&&this._dbSpec(set).group.field; const idx=(cur?list.indexOf(cur):-1)+1; const nextField=idx<list.length?list[idx]:null; this._patchSpec(set,{group:nextField?{field:nextField}:null}); }
  // Switch the grid's view type; Kanban needs a group field, so auto-pick the
  // first eligible column when none is set.
  _setViewType(set,type,opts){ opts=opts||{}; const patch={type}, sp=this._dbSpec(set); if(type==='kanban'){ if((!sp.group||!sp.group.field)&&opts.groupables&&opts.groupables.length) patch.group={field:opts.groupables[0]}; } if(type==='calendar'){ if(!sp.dateField&&opts.dateables&&opts.dateables.length) patch.dateField=opts.dateables[0]; } this._patchSpec(set,patch); }
  // ── saved views (Phase 4) ── a view is the spec, persisted as a schema-log
  // DEF (anchor=null, path=_schema.views.<slug>) that folds into
  // state.schema.views and syncs to every staff device — zero new infrastructure.
  _slug(name){ return (String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'view'); }
  _viewSpecFromSaved(v){ return {type:v.type||'table',sort:v.sort||[],group:v.group||null,filter:v.filter||null,hidden:v.hidden||[],dateField:v.dateField||null}; }
  _specKey(s){ return JSON.stringify([s.type||'table',s.sort||[],s.group||null,s.filter||null,s.hidden||[],s.dateField||null]); }
  iconForViewType(t){ return t==='kanban'?'kanban':t==='calendar'?'calendar-dots':t==='gallery'?'squares-four':'table'; }
  // Emit the current spec as a named, shared view.
  _saveView(set,name){ if(!name||!this.curWs) return; const sp=this._dbSpec(set); const value={name,set,type:sp.type,sort:sp.sort,group:sp.group,filter:sp.filter,hidden:sp.hidden,dateField:sp.dateField}; Promise.resolve(this.emitOp(this.curWs,this.ME().OP.DEF,{anchor:null,path:'_schema.views.'+this._slug(name),value})).then(()=>{ if(this.demo) this.scheduleRefold(); }).catch(()=>{}); }
  _deleteView(set,slug){ if(!this.curWs) return; Promise.resolve(this.emitOp(this.curWs,this.ME().OP.DEF,{anchor:null,path:'_schema.views.'+slug,value:null})).then(()=>{ if(this.demo) this.scheduleRefold(); }).catch(()=>{}); }
  _loadView(set,v){ this._patchSpec(set,this._viewSpecFromSaved(v)); }
  _clearView(set){ this._patchSpec(set,{type:'table',sort:[],group:null,filter:null,hidden:[],dateField:null}); }
  // A card's secondary line: the first populated field that isn't the title or
  // the group field (kanban/gallery card subtitle).
  _cardSub(e,primaryName,groupField){ for(const k in e){ if(k[0]==='_'||k===primaryName||k===groupField) continue; const v=e[k]; if(v==null||v===''||(Array.isArray(v)&&!v.length)) continue; return k+': '+(Array.isArray(v)?v.join(', '):(typeof v==='object'?JSON.stringify(v):String(v))); } return ''; }
  buildClients(state){
    const ents=state.entities||{}, notesByClient={};
    for(const a in ents){ const e=ents[a]; if(e._type==='note'){ const ci=e.client||e.ci; (notesByClient[ci]=notesByClient[ci]||[]).push({act:e.text||e.act||'',type:e.noteType||e.type||'Note',date:e.date||'',by:e.by||(String(e._sender||'').replace(/^@/,'').split(':')[0]),desc:e.desc||'',due:e.due||'',_ts:e._created||0}); } }
    const clients=[];
    for(const a in ents){ const e=ents[a]; if(e._type!=='client') continue;
      const f={}; for(const k in e){ if(k[0]!=='_') f[k]=e[k]; }
      const rel=(state.connections||[]).filter(cn=>cn.source===a).map(cn=>{ const t=ents[cn.target]||{}; const of=t['Family Name']?(t['Family Name']+', '+(t['First Name']||'')):(t.name||t.text||cn.target); return {rel:String(cn.type||'RELATED').toUpperCase(),of}; });
      const notes=(notesByClient[a]||[]).sort((x,y)=>y._ts-x._ts);
      clients.push({anchor:a,f,notes,rel,_ts:e._created||0});
    }
    clients.sort((x,y)=> String(x.f['Family Name']||'').localeCompare(String(y.f['Family Name']||'')) || x._ts-y._ts);
    clients.forEach((c,i)=>{ c.id=i; c.initials=this.ini(c.f['Family Name'],c.f['First Name']); c.av=this.colorFor(c.f['Country']||c.anchor)[1]; });
    return clients;
  }
  blankClient(){ const f=new Proxy({},{get:()=> '' }); return {anchor:null,f,notes:[],rel:[],id:-1,initials:'—',av:'#8F95A0'}; }
  async addClient(){
    if(!this.curWs){ await this.createWorkspace(); if(!this.curWs) return; }
    const first=(typeof prompt==='function')&&prompt('New client — First name'); if(first===null) return;
    const family=(typeof prompt==='function')&&prompt('New client — Family name'); if(family===null) return;
    try{
      const ME=this.ME(), room=this.curWs;
      const anchor=await this.emitOp(room, ME.OP.INS, { entity_type:'client', payload:{} });
      if(first)  await this.emitOp(room, ME.OP.DEF, { anchor, path:'First Name',  value:first });
      if(family) await this.emitOp(room, ME.OP.DEF, { anchor, path:'Family Name', value:family });
      this.scheduleRefold();
    }catch(e){ this.toast('Could not add client: '+((e&&e.message)||e)); }
  }
  // A case note is an INS('note') carrying the client anchor — one stored operator.
  async addNote(){
    const t=(this.state.noteDraft||'').trim(); if(!t) return;
    const ci=this.state.cur, c=this.clients[ci];
    if(!c||!c.anchor||!this.curWs){ this.setState({noteDraft:''}); return; }
    try{ await this.emitOp(this.curWs, this.ME().OP.INS, { entity_type:'note', payload:{ client:c.anchor, text:t, type:'Note', date:'just now' } }); }catch(e){}
    this.setState(s=>({extraNotes:Object.assign({},s.extraNotes,{[ci]:[t].concat(s.extraNotes[ci]||[])}),noteDraft:''})); this.scheduleRefold(); }

  layoutVM(id){
    const S=this.state, on=S.layout===id, m=this.LMETA[id], fav=S.favs.includes(id);
    return {id,name:m.name,icon:m.icon,icolor:on?'#C2872B':'#9aa3ad',bg:on?'#FBF7EF':'transparent',color:on?'#8A5A14':'#46505B',weight:on?'700':'500',active:on,
      onPick:()=>this.setState({view:'crm',layout:id,ef:null}),
      fav,starClass:fav?'ph-fill':'ph',starColor:fav?'#E8A93B':'#CBD0D6',
      onStar:(e)=>{if(e&&e.stopPropagation)e.stopPropagation(); this.setState(s=>({favs:s.favs.includes(id)?s.favs.filter(x=>x!==id):s.favs.concat(id)}));}};
  }
  ini(fam,first){ const a=(fam||'').trim()[0]||'', b=(first||'').trim()[0]||''; return (a+b).toUpperCase()||'?'; }
  colorFor(v){ v=String(v||''); let h=0; for(let i=0;i<v.length;i++) h=(h+v.charCodeAt(i))%this.PAL.length; return this.PAL[h]; }
  kindOf(k){ if(k==='Client_Photo')return 'photo'; if(k==='Bahr')return 'badge'; if(k==='Age')return 'age'; if(k==='Case Manager')return 'lookup'; if(k==='Client Name')return 'name'; if(k==='USCIS FOIA')return 'check'; if(this.LINKK.includes(k))return 'link'; if(this.LONGK.includes(k))return 'long'; if(this.SEL[k])return 'select'; if(this.TAGK.includes(k))return 'tag'; if(this.DATEK.includes(k))return 'date'; return 'text'; }
  label(k){ return {'A#':'A#','Client_Photo':'Client Photo','PP':'Practice Panther','box_shared_link':'box link','USCIS FOIA':'USCIS FOIA','Client Name':'Client Name'}[k]||k; }
  age(mdy){ const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mdy||''); if(!m)return '—'; const d=new Date(+m[3],+m[1]-1,+m[2]); const n=new Date(2026,5,13); let a=n.getFullYear()-d.getFullYear(); if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--; return String(a); }
  rawVal(ci,k){ const S=this.state, ov=S.vals[ci+'::'+k]; if(ov!==undefined)return ov; const c=this.clients[ci]; if(!c)return ''; if(k==='Age')return this.age(c.f['DOB']); if(k==='Client Name')return (c.f['Family Name']||'')+', '+(c.f['First Name']||''); return c.f[k]; }
  async setVal(ci,k,v){ const c=this.clients[ci]; this.setState(s=>({vals:Object.assign({},s.vals,{[ci+'::'+k]:v})})); if(!c||!c.anchor||!this.curWs)return; try{ await this.emitOp(this.curWs, this.ME().OP.DEF, { anchor:c.anchor, path:k, value:v }); if(this.demo) this.scheduleRefold(); }catch(e){} }
  curLayout(){ return this.state.layouts[this.state.layout]; }
  mutate(fn){ this.setState(s=>{ const L=JSON.parse(JSON.stringify(s.layouts)); fn(L[s.layout]); return {layouts:L}; }); }

  fieldVM(ci,blockId,k){
    const S=this.state, kind=this.kindOf(k), efKey=blockId+'::'+k, editing=S.ef===efKey;
    const val=this.rawVal(ci,k), shown=(val===''||val==null)?'—':val;
    const base={key:k,label:this.label(k),cz:S.customize,options:[],onRemove:()=>this.mutate(b=>{const bl=b.find(x=>x.id===blockId); if(bl)bl.fields=bl.fields.filter(f=>f!==k);})};
    if(kind==='select'){
      return Object.assign(base,{editing:false,viewMode:true,vSelect:true,vCheck:false,vTag:false,vPlain:false,value:val||'—',options:this.SEL[k].map(o=>({value:o,label:o})),onSelect:(e)=>this.setVal(ci,k,e.target.value)});
    }
    if(kind==='check'){
      const on=val===true||val==='Yes';
      return Object.assign(base,{editing:false,viewMode:true,vSelect:false,vCheck:true,vTag:false,vPlain:false,checked:on,ckText:on?'Yes':'No',ckBorder:on?'#C2872B':'#C9CDD3',ckBg:on?'#C2872B':'#fff',onToggle:()=>this.setVal(ci,k,!on)});
    }
    const startEdit=()=>this.setState({ef:efKey,draft:(val==null||val==='—')?'':String(val)});
    const commit=()=>{ this.setVal(ci,k,this.state.draft); this.setState({ef:null}); };
    const common={editing,viewMode:!editing,inputType:kind==='date'?'text':'text',draft:S.draft,
      onInput:(e)=>this.setState({draft:e.target.value}),onCommit:commit,onKey:(e)=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape')this.setState({ef:null});},onEdit:startEdit};
    if(kind==='tag'){ const [bg,fg]=this.colorFor(val); return Object.assign(base,common,{vSelect:false,vCheck:false,vTag:!!(val&&val!=='—'),vPlain:!(val&&val!=='—'),value:shown,valColor:'#C2C7CE',tagBg:bg,tagFg:fg}); }
    if(kind==='age'||kind==='name'){ return Object.assign(base,{editing:false,viewMode:true,vSelect:false,vCheck:false,vTag:false,vPlain:true,value:shown,valColor:'#46505B',onEdit:()=>{}}); }
    return Object.assign(base,common,{vSelect:false,vCheck:false,vTag:false,vPlain:true,value:shown,valColor:val&&val!=='—'?'#18202D':'#C2C7CE'});
  }

  noteTone(t){return {'Hearing':'#7A3FB0','Filing':'#2747C9','Appointment':'#0F7048','Note':'#5A5D63','Task':'#8A5A14'}[t]||'#5A5D63';}
  noteBg(t){return {'Hearing':'#F1E9FE','Filing':'#EEF2FF','Appointment':'#EAF6F0','Note':'#F0F2F4','Task':'#FBF3E2'}[t]||'#F0F2F4';}
  noteIcon(t){return {'Hearing':'gavel','Filing':'paper-plane-tilt','Appointment':'calendar-check','Note':'note','Task':'check-square'}[t]||'note';}

  blockVM(ci,blk){
    const S=this.state, type=blk.type, cz=S.customize;
    const base={id:blk.id,cz,isPhoto:false,isGrid:false,isNote:false,isLookup:false,isHeading:false,isLink:false,isActivity:false,showLabel:false,fields:[],sideFields:[],addOptions:[],events:[],outline:cz?'1px dashed #D2D6DC':'1px solid transparent',veil:'',hiddenTag:false,
      onUp:()=>this.mutate(b=>{const i=b.findIndex(x=>x.id===blk.id); if(i>0){const t=b[i-1];b[i-1]=b[i];b[i]=t;}}),
      onDown:()=>this.mutate(b=>{const i=b.findIndex(x=>x.id===blk.id); if(i<b.length-1){const t=b[i+1];b[i+1]=b[i];b[i]=t;}}),
      onHide:()=>this.mutate(b=>{const x=b.find(y=>y.id===blk.id); if(x)x.hidden=!x.hidden;}),
      onRemove:()=>this.mutate(b=>{const i=b.findIndex(x=>x.id===blk.id); if(i>=0)b.splice(i,1);}),
      onAddBelow:()=>this.addBlock(blk.id),
      hideIcon:blk.hidden?'eye':'eye-slash'};
    if(blk.hidden){ base.hiddenTag=true; base.veil=cz?'opacity:.45;':'display:none;'; if(!cz) return Object.assign(base,{skip:true}); }
    if(type==='photo'){
      const side=(blk.side||[]).map(k=>{ if(k==='Bahr')return {label:'Bahr',isBadge:true,isVal:false}; const v=this.rawVal(ci,k); return {label:this.label(k),isBadge:false,isVal:true,value:(v==null||v==='')?'—':v}; });
      return Object.assign(base,{isPhoto:true,photoCaption:this.rawVal(ci,'Client_Photo')||'photo.webp',sideFields:side});
    }
    if(type==='grid'){
      const cols=blk.cols===3?'1fr 1fr 1fr':(blk.cols===2?'1fr 1fr':'1fr');
      const present=blk.fields;
      const all=['A#','Case Manager','Country','DOB','Age','First Name','Middle Name','Family Name','Entry Date','Place of Entry','Address','Phone Number','Client Email','Relief Sought','Client Engagement Status','Asylum Case Status','I589 Biom Status','Relief Filed?','USCIS FOIA Stage','FOIA #','FOIA Receipt','FOIA CD Date','USCIS FOIA Link','Date Relief Filed','Client Name'];
      const addOptions=all.filter(k=>!present.includes(k)).slice(0,7).map(k=>({label:this.label(k),onAdd:()=>this.mutate(b=>{const x=b.find(y=>y.id===blk.id); if(x&&!x.fields.includes(k))x.fields.push(k);})}));
      return Object.assign(base,{isGrid:true,showLabel:!!blk.label,label:blk.label||'',gridCols:cols,fields:present.map(k=>this.fieldVM(ci,blk.id,k)),addOptions,hasAdd:cz});
    }
    if(type==='note'){
      const k=blk.fieldKey, efKey=blk.id+'::'+k, editing=S.ef===efKey, v=this.rawVal(ci,k);
      return Object.assign(base,{isNote:true,showLabel:true,label:blk.label,noteEditing:editing,noteView:!editing,noteValue:(v&&v!=='—')?v:'—',noteColor:(v&&v!=='—')?'#1a1a17':'#C2C7CE',noteDraft:(v==='—'||v==null)?'':String(v),
        onEdit:()=>this.setState({ef:efKey,draft:(v==='—'||v==null)?'':String(v)}),onInput:(e)=>this.setState({draft:e.target.value}),onCommit:()=>{this.setVal(ci,k,this.state.draft);this.setState({ef:null});}});
    }
    if(type==='lookup'){
      const v=this.rawVal(ci,blk.fieldKey)||'—';
      return Object.assign(base,{isLookup:true,showLabel:true,label:blk.label,lkName:v,lkRole:'Case manager',lkInitials:(v.replace(/[^A-Za-z]/g,'')[0]||'?').toUpperCase()});
    }
    if(type==='heading'){ return Object.assign(base,{isHeading:true,text:blk.text}); }
    if(type==='link'){
      const v=this.rawVal(ci,blk.fieldKey)||'—', isBox=blk.fieldKey==='box_shared_link';
      return Object.assign(base,{isLink:true,showLabel:true,label:blk.label,url:v,linkIcon:isBox?'folder-simple':'arrow-square-out',linkIconBg:isBox?'#4285f4':'#C2872B',linkSub:isBox?'Box folder · embedded for client':'Opens matter in Practice Panther'});
    }
    if(type==='check'){
      const v=this.rawVal(ci,blk.fieldKey), on=v===true||v==='Yes';
      return Object.assign(base,{isGrid:true,showLabel:false,gridCols:'1fr',fields:[this.fieldVM(ci,blk.id,blk.fieldKey)]});
    }
    if(type==='activity'){
      const c=this.clients[ci]||{notes:[]}, extra=(S.extraNotes[ci]||[]).map(t=>({act:t,type:'Note',date:'just now',by:'CVega',desc:''}));
      const events=extra.concat(c.notes).map(n=>({act:n.act,type:n.type,date:n.date,by:n.by,desc:n.desc,hasDesc:!!n.desc,due:n.due,hasDue:!!n.due,tone:this.noteTone(n.type),bg:this.noteBg(n.type),icon:this.noteIcon(n.type)}));
      return Object.assign(base,{isActivity:true,showLabel:true,label:blk.label,events});
    }
    return base;
  }

  addBlock(afterId){ this.mutate(b=>{ const nb={id:'b'+Math.random().toString(36).slice(2,6),type:'grid',cols:1,label:'New section',fields:['First Name']}; if(afterId==null){b.unshift(nb);} else {const i=b.findIndex(x=>x.id===afterId); b.splice(i+1,0,nb);} }); }

  // ── Database view — driven by bare-metal's real derivation (window.AminoDB) ──
  // Every native/imported set in the workspace becomes a tab; columns and rows
  // come from buildTable over the augmented render state, so the grid shows the
  // SAME tables/columns/rows/links bare-metal does. No hand-rolled projection.
  iconForSet(name){ const n=String(name||'').toLowerCase();
    if(/client|person|contact|individual/.test(n)) return 'identification-card';
    if(/case|matter|proceed/.test(n)) return 'briefcase';
    if(/note|activity|event|log/.test(n)) return 'note';
    if(/foia|request/.test(n)) return 'file-magnifying-glass';
    if(/doc|file|attach|exhibit/.test(n)) return 'paperclip';
    if(/invoice|payment|billing/.test(n)) return 'receipt';
    return 'table'; }
  iconForType(t){ return {number:'hash',date:'calendar-blank',boolean:'check-square',select:'tag',multiselect:'tags',json:'brackets-curly',longtext:'text-align-left',url:'link-simple',email:'at',duration:'timer'}[t]||'text-aa'; }
  isClientSet(name){ return this.CLIENT_SET_RE.test(String(name||''))||name==='client'; }
  // Best display label for any entity, across every set shape.
  rowLabel(e){ if(!e) return '';
    const direct=e.Name||e.title||e.Matter||e['Client Name']||e.body||e.claim||e.what;
    if(direct) return String(direct);
    const fam=e['Family Name'], first=e['First Name'];
    if(fam||first) return (fam||'')+(fam&&first?', ':'')+(first||'');
    return String(e._anchor||'').slice(-8)||'—'; }
  // Airtable gives every table ONE primary field that leads the grid and is the
  // record's display name. Find it so the leading "Name" column shows it ONCE —
  // a table whose first field is literally "Name"/"Matter" used to render two
  // identical columns (the synthetic primary + the real field). Prefer a declared
  // schema primary, else the first common label field that's actually present.
  primaryFieldName(activeName,cols,state){
    const names=new Set(cols.map(c=>c.name));
    const sp=state&&state.schema&&state.schema.primary&&state.schema.primary[activeName];
    if(sp&&names.has(sp)) return sp;
    for(const cand of ['Name','Title','Matter','Client Name','Full Name','Display Name','name','title']) if(names.has(cand)) return cand;
    return null; }
  // The leading cell's text: the primary field's own value when there is one,
  // otherwise the cross-shape rowLabel (e.g. "Family, First" for a client).
  primaryLabel(e,primaryName){
    if(primaryName){ const v=e[primaryName];
      if(v!=null&&v!==''&&!(Array.isArray(v)&&!v.length)) return Array.isArray(v)?v.join(', '):String(v); }
    return this.rowLabel(e); }
  // Stable column order with empty columns sunk to the end. An imported Airtable
  // base can carry hundreds of fields, most blank for any given view; leading the
  // grid with the columns that actually hold data (sampling the set, so it stays
  // cheap) is what keeps a 300-field table from opening on a wall of "—".
  orderColsEmptyLast(cols,rows){
    if(!rows||rows.length<2||cols.length<2) return cols;
    const sample=rows.length>250?rows.slice(0,250):rows;
    const populated=new Set();
    for(const c of cols){ for(const r of sample){ const v=r[c.name]; if(v!=null&&v!==''&&!(Array.isArray(v)&&!v.length)){ populated.add(c.name); break; } } }
    if(populated.size===0||populated.size===cols.length) return cols;
    const head=[],tail=[]; for(const c of cols) (populated.has(c.name)?head:tail).push(c);
    return head.concat(tail); }
  // The grid's column layout: the leading primary column + the data columns
  // (primary de-duped, empty-last, capped unless "show all fields" is on), plus
  // the matching grid-template track string. Independent of row windowing/search,
  // so dbModel memoizes it (this._colCache) across keystrokes.
  buildColumns(activeName,built,state,showAll){
    const cols=built.cols, rows=built.rows;
    const primaryName=this.primaryFieldName(activeName,cols,state);
    const dataCols=this.orderColsEmptyLast(cols.filter(c=>c.name!==primaryName),rows);
    const MAXCOLS=30, cap=showAll?dataCols.length:MAXCOLS;
    const shown=dataCols.slice(0,cap), hiddenCols=dataCols.length-shown.length;
    const columns=[{k:'__name',n:primaryName||'Name',icon:'text-aa',type:'name'}]
      .concat(shown.map(c=>({k:c.name,n:c.name,icon:this.iconForType(c.type),type:c.type})));
    const dbColTemplate=columns.map((c,i)=> i===0?'minmax(210px,1.4fr)':((c.type==='longtext'||c.type==='json')?'minmax(200px,1.4fr)':'minmax(140px,1fr)')).join(' ');
    return {columns,dbColTemplate,primaryName,hiddenCols,fieldCount:cols.length,dataColCount:dataCols.length}; }

  // ── Database grid windowing plumbing ──
  // One capture-phase scroll listener on the document catches the grid scroll
  // container (marked data-am-grid) wherever React re-mounts it, with no per-row
  // listeners. When the user nears the bottom and more rows exist, grow the
  // window by a page — infinite scroll that keeps the DOM bounded.
  _ensureScrollHook(){ if(this._scrollHooked||typeof document==='undefined') return; this._scrollHooked=true; try{ document.addEventListener('scroll',this._onAnyScroll,true); }catch(e){} }
  _onAnyScroll(e){
    const el=e&&e.target;
    if(!el||!el.getAttribute||el.getAttribute('data-am-grid')===null) return;
    if(!this._dbHasMore) return;
    if(el.scrollHeight-el.scrollTop-el.clientHeight>320) return; // not near the bottom yet
    if(this._dbGrowQueued) return; this._dbGrowQueued=true;
    const grow=()=>{ this._dbGrowQueued=false; if(this._dbHasMore) this.setState(st=>({dbLimit:(st.dbLimit||this.DB_PAGE)+300})); };
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(grow); else setTimeout(grow,16);
  }
  _scrollGridTop(){ if(typeof document==='undefined') return; try{ const el=document.querySelector('[data-am-grid]'); if(el) el.scrollTop=0; }catch(e){} }

  // The whole Database view-model: tabs, columns, rows, the views rail, and the
  // record drawer — all from the real fold/augmented state. Returns exactly the
  // db* / onDb* bindings the template consumes.
  dbModel(){
    const S=this.state, DB=window.AminoDB;
    const state=this._renderState || (this.curWs?this.foldRoom(this.curWs):{entities:{},connections:[],schema:{},partitions:{}});
    const empty={dbName:'Database',dbCount:'0',dbFieldCount:0,dbTabs:[],dbColumns:[],dbColTemplate:'1fr',dbRows:[],
      dbSearch:S.dbSearch,onDbSearch:(e)=>this.setState({dbSearch:e.target.value}),
      dbViewSearch:S.dbViewSearch,onDbViewSearch:(e)=>this.setState({dbViewSearch:e.target.value}),
      dbViews:[],dbViewName:'All records',dbViewIcon:'table',dbTools:[],
      dbRecordOpen:false,dbRecordTitle:'',dbRecordSub:'',dbRecordInitials:'',dbRecordAv:'#8F95A0',dbRecordIcon:'note',dbRecordFields:[],dbRecordIsClient:false,
      onDbRecordCrm:()=>{},onCloseDbRecord:()=>this.setState({dbRecord:null})};
    // The grid only renders inside the Database screen ({{ isDb }}), so skip the
    // O(rows) buildTable/cell mapping entirely on every other view — otherwise a
    // 12k-row imported sheet would be re-projected on each CRM keystroke.
    if(!DB || S.view!=='db') return empty;
    this._ensureScrollHook();
    const sets=DB.listSets(this._liveState||state, state);
    let activeName=S.dbTable; if(!sets.some(s=>s.name===activeName)) activeName=(sets[0]&&sets[0].name)||'';
    if(!activeName) return empty;
    const tabs=sets.map(s=>{ const on=s.name===activeName; return {name:s.name,icon:this.iconForSet(s.name),count:String(s.expected||s.localRows||0),
      bg:on?'#fff':'transparent',underline:on?'#C2872B':'transparent',color:on?'#18202D':'#6B7682',weight:on?'700':'500',icolor:on?'#C2872B':'#9aa3ad',
      onPick:()=>{ this._scrollGridTop(); this.setState({dbTable:s.name,dbSearch:'',dbRecord:null,dbLimit:this.DB_PAGE,dbShowAllCols:false}); }}; });
    // Building the full table (every row materialized from the augmented state)
    // is the costly part, so memoize it: it only changes when the render-state or
    // the raw fold changes, NOT when the user types in search or scrolls. Keyed
    // on those versions so search/scroll re-renders reuse it instead of rebuilding
    // a 12k-row table on every keystroke.
    const active=sets.find(s=>s.name===activeName)||{};
    const spec=this._dbSpec(activeName);
    const hidden=spec.hidden||[];
    const dq=S.dbSearch.trim().toLowerCase();
    const limit=Math.max(this.DB_PAGE,S.dbLimit||this.DB_PAGE);
    // Every grid is answered by the query spine (docs/BUILD-PLAN.md). Imported
    // sets use the persistent columnar store; native, event-sourced sets (small)
    // load into a transient per-build store so filter / sort / group / hide are
    // one uniform query() path — nothing here scans Object.values(state.entities).
    // Filter/sort/group/hidden come from the per-set view spec (the real toolbar).
    const RS=window.AminoRowStore;
    const fv=(this._foldCache[this.curWs]||{}).ver||0, builtKey=activeName+'|'+this._renderVer+'|'+fv;
    let qStore=null;
    if(this._rowStore&&this._rowStore.has&&this._rowStore.has(activeName)&&active.isImport) qStore=this._rowStore;
    else if(RS){
      if(this._gridStore&&this._gridStore.key===builtKey) qStore=this._gridStore.store;
      else { const base=DB.buildTable(activeName,state); const ts=RS.create(); ts.loadSet(activeName,base.rows); this._gridStore={key:builtKey,store:ts}; qStore=ts; }
    }
    const schemaFields=state.schema&&state.schema.fields&&state.schema.fields[activeName];
    let built,windowRows,total,groups;
    if(qStore){
      const res=DB.tableFromStore(qStore,activeName,schemaFields,{filter:spec.filter,sort:spec.sort,group:spec.group,search:dq||undefined,offset:0,limit});
      built={cols:res.cols,rows:res.rows}; windowRows=res.rows; total=res.total; groups=res.groups; this._dbHasMore=res.hasMore;
    }else{ // no store engine available → last-resort raw path (kept for safety)
      built=DB.buildTable(activeName,state); windowRows=built.rows.slice(0,limit); total=built.rows.length; this._dbHasMore=total>windowRows.length;
    }
    // Hidden fields drop out before layout; the rest are ordered/capped as before,
    // then annotated with click-to-sort (cycles asc/desc/off) + a hide affordance.
    const visibleCols=hidden.length?built.cols.filter(c=>hidden.indexOf(c.name)<0):built.cols;
    const layout=this.buildColumns(activeName,{cols:visibleCols,rows:windowRows},state,!!S.dbShowAllCols);
    const primaryName=layout.primaryName;
    const dirOf=(f)=>{ const k=(spec.sort||[]).find(s=>s.field===f); return k?k.dir:''; };
    const columns=layout.columns.map(col=>{
      const f=(col.k==='__name')?primaryName:col.k, dir=f?dirOf(f):'';
      return Object.assign({},col,{ sortIcon: dir==='asc'?'arrow-up':dir==='desc'?'arrow-down':'',
        onSort: f?(()=>this._cycleSort(activeName,f)):(()=>{}),
        onHide: (f&&col.k!=='__name')?(()=>this._hideField(activeName,f)):null });
    });
    const dbRows=windowRows.map(e=>{ const label=this.primaryLabel(e,primaryName); return {cursor:'pointer',onOpen:()=>this.setState({dbRecord:{set:activeName,anchor:e._anchor}}),cells:columns.map((col,i)=>this.dbCell(e,col,label,i))}; });
    const moreCount=Math.min(300,total-windowRows.length);
    const dbColTemplate=layout.dbColTemplate;
    // Honest signal that the grid is capping a wide table, with the escape hatch
    // to render every field (relies on the grid's own horizontal scroll).
    const hiddenCols=layout.hiddenCols, canCollapse=!!S.dbShowAllCols&&layout.dataColCount>30;
    // Toolbar → query() params. Sort + hide are set from the column headers; these
    // buttons reflect state and reset. Filter toggles a primary-not-empty clause;
    // Group cycles the eligible select/boolean columns → group counts.
    const groupables=built.cols.filter(c=>c.type==='select'||c.type==='boolean').map(c=>c.name);
    const dateables=built.cols.filter(c=>c.type==='date'||this._looksDate(windowRows.map(r=>r[c.name]))).map(c=>c.name);
    const groupField=(spec.group&&spec.group.field)||'';
    // Precompute the button styling (dc-runtime binds property paths, not
    // expressions — no ternaries in the template).
    const tool=(icon,label,active,onClick)=>({icon,label,active,onClick,bg:active?'#FBF3E2':'transparent',color:active?'#8A5A14':'#5A5D63',weight:active?'700':'500'});
    const dbTools=[
      tool('eye-slash',hidden.length?('Fields · '+hidden.length+' hidden'):'Hide fields',hidden.length>0,()=>this._patchSpec(activeName,{hidden:[]})),
      tool('funnel-simple',spec.filter?'Filter · 1':'Filter',!!spec.filter,()=>this._toggleFilter(activeName,primaryName)),
      tool('arrows-down-up',(spec.sort&&spec.sort.length)?('Sort · '+spec.sort.length):'Sort',!!(spec.sort&&spec.sort.length),()=>this._patchSpec(activeName,{sort:[]})),
      tool('rows',groupField?('Group · '+groupField):'Group',!!groupField,()=>this._cycleGroup(activeName,groupables)),
    ];
    const dbGroups=(groupField&&groups)?groups.map(g=>({key:g.key||'—',count:String(g.count)})):[];
    // View types (Phase 3): thin renderers over query(). Kanban = a windowed
    // query() per group value. The switcher offers Kanban only when the set has a
    // groupable (select/boolean) column.
    const viewType=spec.type||'table';
    const vtDef=[{key:'table',icon:'table',label:'Grid'}];
    if(groupables.length||viewType==='kanban') vtDef.push({key:'kanban',icon:'kanban',label:'Kanban'});
    if(dateables.length||viewType==='calendar') vtDef.push({key:'calendar',icon:'calendar-dots',label:'Calendar'});
    vtDef.push({key:'gallery',icon:'squares-four',label:'Gallery'});
    const dbViewTypes=vtDef.map(v=>({key:v.key,icon:v.icon,label:v.label,active:viewType===v.key,
      bg:viewType===v.key?'#EDE7DA':'transparent',color:viewType===v.key?'#8A5A14':'#8F95A0',
      onPick:()=>this._setViewType(activeName,v.key,{groupables,dateables})}));
    let dbKanban={field:'',columns:[]};
    if(viewType==='kanban'&&qStore){
      const kf=(spec.group&&spec.group.field)||groupables[0]||'';
      if(kf){
        const gcounts=DB.tableFromStore(qStore,activeName,schemaFields,{filter:spec.filter,search:dq||undefined,group:{field:kf},limit:0}).groups||[];
        const KCARDS=this.DB_PAGE; // window each column like the grid windows rows
        dbKanban={field:kf,columns:gcounts.map(g=>{
          const clause=g.key==='(empty)'?{field:kf,op:'isEmpty'}:{field:kf,op:'is',value:g.key};
          const filt=spec.filter?{op:'and',clauses:[spec.filter,clause]}:clause;
          const cres=DB.tableFromStore(qStore,activeName,schemaFields,{filter:filt,search:dq||undefined,sort:spec.sort,offset:0,limit:KCARDS});
          const cards=cres.rows.map(e=>({anchor:e._anchor,title:this.primaryLabel(e,primaryName)||'—',sub:this._cardSub(e,primaryName,kf),onOpen:()=>this.setState({dbRecord:{set:activeName,anchor:e._anchor}})}));
          return {key:g.key||'—',count:String(g.count),cards,hasMore:g.count>cards.length,moreText:g.count>cards.length?('+'+(g.count-cards.length)+' more in this group'):''};
        })};
      }
    }
    // Calendar: rows laid out by day over a chosen date field (retires the
    // hardcoded hearings/deadlines lists — a real view over NTA/Hearing/due-date).
    let dbCalendar={field:'',days:[]};
    if(viewType==='calendar'&&qStore){
      const df=spec.dateField||dateables[0]||'';
      if(df){
        const cres=DB.tableFromStore(qStore,activeName,schemaFields,{filter:spec.filter,search:dq||undefined,sort:[{field:df,dir:'asc'}],offset:0,limit:this.DB_PAGE});
        const byDay=new Map();
        for(const e of cres.rows){ const t=Date.parse(e[df]); if(isNaN(t)) continue; const key=new Date(t).toISOString().slice(0,10); if(!byDay.has(key)) byDay.set(key,[]); byDay.get(key).push(e); }
        const days=Array.from(byDay.keys()).sort().map(key=>({date:key,label:key,cards:byDay.get(key).map(e=>({anchor:e._anchor,title:this.primaryLabel(e,primaryName)||'—',sub:this._cardSub(e,primaryName,df),onOpen:()=>this.setState({dbRecord:{set:activeName,anchor:e._anchor}})}))}));
        dbCalendar={field:df,days};
      }
    }
    const dbIsKanban=viewType==='kanban'&&dbKanban.columns.length>0;
    const dbIsGallery=viewType==='gallery';
    const dbIsCalendar=viewType==='calendar'&&dbCalendar.days.length>0;
    const dbIsTable=!dbIsKanban&&!dbIsGallery&&!dbIsCalendar;
    // Gallery: the grid's already-windowed query() rows, as cards — nearly free.
    const dbGallery={cards: dbIsGallery ? windowRows.map(e=>({anchor:e._anchor,title:this.primaryLabel(e,primaryName)||'—',sub:this._cardSub(e,primaryName,''),onOpen:()=>this.setState({dbRecord:{set:activeName,anchor:e._anchor}})})) : []};
    // Saved views (Phase 4): read state.schema.views (folded from the schema-log)
    // for this set; the active one is whichever matches the current spec.
    const savedViews=(state.schema&&state.schema.views)||{};
    const curKey=this._specKey(spec);
    const savedList=Object.keys(savedViews).map(slug=>({slug,v:savedViews[slug]})).filter(x=>x.v&&x.v.set===activeName);
    const anyActive=savedList.some(x=>this._specKey(this._viewSpecFromSaved(x.v))===curKey);
    const views=[{name:'All records',icon:'table',iw:'-bold',icolor:'#C2872B',bg:!anyActive?'#FBF3E2':'transparent',color:!anyActive?'#8A5A14':'#5A5D63',weight:!anyActive?'700':'500',active:!anyActive,count:String(total),onPick:()=>this._clearView(activeName)}]
      .concat(savedList.map(x=>{ const act=this._specKey(this._viewSpecFromSaved(x.v))===curKey; return {name:x.v.name||x.slug,icon:this.iconForViewType(x.v.type),iw:'',icolor:act?'#C2872B':'#9aa3ad',bg:act?'#FBF3E2':'transparent',color:act?'#8A5A14':'#5A5D63',weight:act?'700':'500',active:act,count:'',onPick:()=>this._loadView(activeName,x.v),onDelete:()=>this._deleteView(activeName,x.slug)}; }))
      .filter(v=>{ const vq=S.dbViewSearch.trim().toLowerCase(); return !vq||v.name.toLowerCase().includes(vq); });
    const activeView=savedList.find(x=>this._specKey(this._viewSpecFromSaved(x.v))===curKey);
    const onDbSaveView=()=>{ const nm=(typeof prompt==='function')?prompt('Name this view'):null; if(nm&&nm.trim()) this._saveView(activeName,nm.trim()); };
    // Airtable status for the active table — surfaced inline so "how do I sync
    // from Airtable" is answered where the user looks, not buried on the Sync
    // page. The pill states provenance; the button pulls this table on demand
    // (or, if no token is connected, points to the Sync page to connect one).
    const atS=active.airtable?this._airtableStatus():null;
    const atSyncing=this._atSyncing===activeName;
    let dbAtLabel='', dbAtBg='transparent', dbAtColor='#8F95A0', dbAtCta='', dbAtIcon='table';
    if(active.airtable){
      if(!atS.connected){ dbAtLabel='From Airtable · not connected'; dbAtBg='#FBF3E2'; dbAtColor='#8A5A14'; dbAtCta='Connect Airtable'; dbAtIcon='plug'; }
      else { const lp=atS.lastPull?this._relTime(atS.lastPull):''; dbAtLabel='Synced from Airtable'+(lp?(' · pulled '+lp):''); dbAtBg='#EAF6F0'; dbAtColor='#0F7048'; dbAtCta='Sync from Airtable'; dbAtIcon='cloud-arrow-down'; }
    }
    return Object.assign({
      // ── Airtable link + on-demand pull (flat bindings; see _airtableStatus) ──
      dbIsAirtable:!!active.airtable, dbAtBase:(active.airtableBase||''),
      dbAtLabel, dbAtBg, dbAtColor, dbAtIcon,
      dbAtCta:atSyncing?'Syncing…':dbAtCta, dbAtSyncing:atSyncing,
      dbAtConnected:!!(atS&&atS.connected),
      onDbSyncAirtable:()=>this._syncTableFromAirtable(activeName),
      dbName:activeName, dbCount:String(active.expected||active.localRows||total), dbFieldCount:layout.fieldCount,
      dbTabs:tabs, dbColumns:columns.map(c=>({name:c.n,icon:c.icon,sortIcon:c.sortIcon,hasSort:!!c.sortIcon,onSort:c.onSort,onHide:c.onHide})), dbColTemplate, dbRows,
      // Grouping: the group-by field's counts as chips above the grid (kanban's
      // substrate); empty when no grouping is active.
      dbGrouped:!!groupField&&dbIsTable, dbGroupField:groupField, dbGroups, onDbClearGroup:()=>this._patchSpec(activeName,{group:null}),
      // View types (Phase 3): the switcher + the kanban board (windowed query()
      // per group). dbIsTable/dbIsKanban toggle the body; dbKanban carries columns.
      dbViewType:viewType, dbViewTypes, dbIsTable, dbIsKanban, dbKanban, dbIsGallery, dbGallery, dbIsCalendar, dbCalendar,
      // Wide-table column controls: surface how many fields are hidden behind the
      // cap and let the user expand to all fields (or collapse back).
      dbHasHiddenCols:hiddenCols>0, dbHiddenCols:hiddenCols, dbHiddenColsText:'+'+hiddenCols+' more field'+(hiddenCols===1?'':'s'),
      dbCanCollapseCols:canCollapse, onDbShowAllCols:()=>this.setState({dbShowAllCols:true}), onDbHideExtraCols:()=>this.setState({dbShowAllCols:false}),
      // Windowing: show how many of how many, and a control to load the next page.
      dbHasMore:this._dbHasMore, dbShown:windowRows.length, dbTotal:total,
      dbMoreText:'Showing '+windowRows.length+' of '+total+' — load '+moreCount+' more',
      dbCountText:total>windowRows.length?(windowRows.length+' of '+total):String(total),
      onDbMore:()=>this.setState(st=>({dbLimit:(st.dbLimit||this.DB_PAGE)+300})),
      dbSearch:S.dbSearch, onDbSearch:(e)=>this.setState({dbSearch:e.target.value,dbLimit:this.DB_PAGE}),
      dbViewSearch:S.dbViewSearch, onDbViewSearch:(e)=>this.setState({dbViewSearch:e.target.value}),
      dbViews:views, dbViewName:activeView?(activeView.v.name||activeView.slug):'All records', dbViewIcon:activeView?this.iconForViewType(activeView.v.type):'table', onDbSaveView,
      dbTools,
    }, this.dbRecordModel(state, activeName));
  }
  // One grid cell for entity `e`, column `col`. i===0 is the synthetic primary
  // (avatar + display label); the rest format by inferred type (tag chips for
  // selects, ✓/✗ for booleans, a box-folder affordance for Box links).
  dbCell(e,col,label,i){
    if(i===0||col.k==='__name'){ const ii=this.ini(e['Family Name'],e['First Name']); const initials=ii!=='?'?ii:((String(label).trim()[0]||'•').toUpperCase()); return {isPrimary:true,isTag:false,isBox:false,isPlain:false,av:this.colorFor(e['Country']||label||e._anchor)[1],initials,text:label||'—'}; }
    let v=e[col.k];
    if(v==null||v===''||(Array.isArray(v)&&!v.length)) return {isPrimary:false,isTag:false,isBox:false,isPlain:true,text:'—',color:'#C2C7CE'};
    if(col.k==='box_shared_link'||/(^https?:\/\/)?(app\.)?box\.com/.test(String(v))) return {isPrimary:false,isTag:false,isBox:true,isPlain:false,text:String(v)};
    if(col.type==='boolean') { const on=(v===true||v==='Yes'||v==='true'); return {isPrimary:false,isTag:false,isBox:false,isPlain:true,text:on?'✓':'✗',color:on?'#0F7048':'#B42318'}; }
    if(col.type==='select'||this.SEL[col.k]||this.TAGK.includes(col.k)){ const sv=Array.isArray(v)?v.join(', '):String(v); const [bg,fg]=this.colorFor(sv); return {isPrimary:false,isTag:true,isBox:false,isPlain:false,text:sv,bg,fg}; }
    if(Array.isArray(v)) v=v.join(', '); else if(typeof v==='object') v=JSON.stringify(v);
    return {isPrimary:false,isTag:false,isBox:false,isPlain:true,text:String(v),color:'#46505B'};
  }
  // The record drawer for the currently-open row: every stored field plus the
  // related records reached through CON edges / schema.links (linkedTypesFor).
  dbRecordModel(state, activeName){
    const rec=this.state.dbRecord;
    const empty={dbRecordOpen:false,dbRecordTitle:'',dbRecordSub:'',dbRecordInitials:'',dbRecordAv:'#8F95A0',dbRecordIcon:'note',dbRecordFields:[],dbRecordIsClient:false,onDbRecordCrm:()=>{},onCloseDbRecord:()=>this.setState({dbRecord:null})};
    if(!rec||!rec.anchor) return empty;
    const e=((state&&state.entities)||{})[rec.anchor]; if(!e) return empty;
    const setName=rec.set||e._type||activeName, label=this.rowLabel(e), DB=window.AminoDB;
    const fields=[];
    for(const k in e){ if(k[0]==='_')continue; let v=e[k]; if(v==null||v===''||(Array.isArray(v)&&!v.length))continue;
      const isBox=k==='box_shared_link'||/(^https?:\/\/)?(app\.)?box\.com/.test(String(v));
      const isTag=!isBox&&(!!this.SEL[k]||this.TAGK.includes(k));
      let tb='#F0F2F4',tf='#5A5D63'; const sv=Array.isArray(v)?v.join(', '):(typeof v==='object'?JSON.stringify(v):String(v));
      if(isTag){ const p=this.colorFor(sv); tb=p[0]; tf=p[1]; }
      fields.push({label:k,value:sv,isBox:!!isBox,isTag:!!isTag,isPlain:!isBox&&!isTag,tagBg:tb,tagFg:tf}); }
    if(DB){ DB.linkedTypesFor(setName,state).forEach(ot=>{ const links=DB.linksFromAnchor(rec.anchor,ot,state); if(links.length) fields.push({label:'Related — '+ot,value:links.map(l=>l.label).join(', '),isBox:false,isTag:false,isPlain:true,tagBg:'#F0F2F4',tagFg:'#5A5D63'}); }); }
    const ii=this.ini(e['Family Name'],e['First Name']);
    return {dbRecordOpen:true,dbRecordTitle:label||'Record',dbRecordSub:setName+(e['A#']?(' · '+e['A#']):''),
      dbRecordInitials:ii!=='?'?ii:((String(label).trim()[0]||'•').toUpperCase()),dbRecordAv:this.colorFor(e['Country']||label||rec.anchor)[1],
      dbRecordIcon:this.iconForSet(setName),dbRecordFields:fields,dbRecordIsClient:this.isClientSet(setName),
      onDbRecordCrm:()=>{ const idx=(this.clients||[]).findIndex(c=>c.anchor===rec.anchor); this.setState({view:'crm',panelView:'clients',tab:'clientinfo',dbRecord:null,cur:idx>=0?idx:this.state.cur}); },
      onCloseDbRecord:()=>this.setState({dbRecord:null})};
  }

  // ── Sync & storage page ───────────────────────────────────────────────────
  // "A place to see the sync." Surfaces the bridge's already-tracked state — the
  // initial-sync progress (durable block chain → OPFS), edits still queued to
  // send, and where the local encrypted copy actually lives on disk (OPFS room
  // logs / checkpoints / media + the service-worker cache). All read from
  // window.MatrixLive; nothing here writes. Every probe is guarded, so a missing
  // bridge method (or demo mode) just shows "—" rather than throwing.
  openSync(){ if(this.state.view!=='sync') this._preSyncView=this.state.view; this.setState({view:'sync',spacePickerOpen:false,dbRecord:null}); this.refreshSync(); this._armSyncTimer(); }
  backFromSync(){ if(this._syncTimer){ clearTimeout(this._syncTimer); this._syncTimer=null; } this.setState({view:this._preSyncView||(this.curWs?'crm':'spaces')}); }
  _armSyncTimer(){ if(this._syncTimer||typeof setTimeout==='undefined') return; const tick=()=>{ this._syncTimer=null; if(this.state.view!=='sync') return; this.refreshSync(); this._syncTimer=setTimeout(tick,3000); }; this._syncTimer=setTimeout(tick,3000); }
  async refreshSync(){
    const ML=this.ML&&this.ML(); const snap={at:Date.now(),demo:!!this.demo};
    const get=async(fn)=>{ try{ return fn?await fn():null; }catch(e){ return null; } };
    snap.sync      = await get(ML&&ML.getSyncStatus);
    snap.net       = await get(ML&&ML.getNetwork);
    snap.syncState = await get(ML&&ML.getSyncState);
    snap.pending   = await get(ML&&ML.getPendingCount);
    snap.mem       = await get(ML&&ML.getMemoryStats);
    snap.log       = await get(ML&&ML.getProgressLog);
    snap.storage   = await get(ML&&ML.getStorageStatus);
    this.setState({syncSnap:snap});
  }
  async makeDurable(){ const ML=this.ML&&this.ML(); try{ if(ML&&ML.requestPersistentStorage) await ML.requestPersistentStorage(); }catch(e){} this.refreshSync(); }
  async resyncNow(){ const ML=this.ML&&this.ML(); try{ if(ML&&ML.resync) await ML.resync(); }catch(e){} this.refreshSync(); }
  fmtBytes(n){ n=+n||0; if(n<1024) return n+' B'; const u=['KB','MB','GB','TB']; let i=-1; do{ n/=1024; i++; }while(n>=1024&&i<u.length-1); return (n>=10?Math.round(n):n.toFixed(1))+' '+u[i]; }
  syncModel(){
    const snap=this.state.syncSnap, s=(snap&&snap.sync)||{}, st=(snap&&snap.storage)||{};
    const phase=s.phase||(this.demo?'demo':'idle');
    const PH={idle:['Idle','#5A5D63','#F0F2F4'],syncing:['Syncing…','#8A5A14','#FBF3E2'],done:['Up to date','#0F7048','#EAF6F0'],error:['Sync error','#B42318','#FCEFEF'],demo:['Demo data','#7A3FB0','#F1E9FE']};
    const ph=PH[phase]||PH.idle;
    const errors=(s.errors||[]).map(er=>({name:er.name||er.roomId||'room',message:er.message||'failed'}));
    const opfs=st.opfs||{}, b=(k)=>opfs[k]||{};
    const buckets=[
      {label:'Room event logs',icon:'rows',bytes:this.fmtBytes(b('room').bytes),files:String(b('room').files||0)},
      {label:'Checkpoints',icon:'camera',bytes:this.fmtBytes(b('checkpoint').bytes),files:String(b('checkpoint').files||0)},
      {label:'Media / import blobs',icon:'images',bytes:this.fmtBytes(b('media').bytes),files:String(b('media').files||0)},
      {label:'App-shell cache',icon:'browser',bytes:this.fmtBytes((st.caches||{}).bytes),files:String((st.caches||{}).entries==null?'—':(st.caches||{}).entries)},
    ];
    const quota=st.quota||0, usage=st.usage||0, pct=quota?Math.min(100,Math.round((usage/quota)*100)):0;
    const pending=snap?(snap.pending|0):0;
    const net=snap&&snap.net, online=net?(net.online!==false):true;
    const mem=(snap&&snap.mem)||null;
    return {
      isSync:true, syncDemo:!!this.demo, syncUpdated: snap?new Date(snap.at).toLocaleTimeString():'—',
      syncPhaseLabel:ph[0], syncPhaseColor:ph[1], syncPhaseBg:ph[2], syncIsSyncing:phase==='syncing',
      syncRooms:(s.roomsTotal?(s.roomsDone+' / '+s.roomsTotal):'—'),
      syncBlocks:(s.blocksTotal?(s.blocksDone+' / '+s.blocksTotal):'—'),
      syncCurrentRoom:s.currentRoomName||s.currentRoomId||'—', syncRecovered:String(s.recovered||0),
      syncErrors:errors, syncHasErrors:errors.length>0,
      syncOnline:online, syncNetLabel:online?'Online':'Offline', syncNetColor:online?'#0F7048':'#B42318', syncNetBg:online?'#EAF6F0':'#FCEFEF',
      syncState:snap&&snap.syncState?String(snap.syncState):'—',
      syncPending:String(pending), syncHasPending:pending>0,
      syncPendingNote:pending>0?(pending+' edit'+(pending===1?'':'s')+' queued to send'):'All edits sent · nothing waiting',
      storageBuckets:buckets, storageMeasured:this.fmtBytes(st.measuredBytes||0),
      storageQuota:quota?this.fmtBytes(quota):'—', storageUsage:quota?this.fmtBytes(usage):'—',
      storagePct:pct, storagePctText:quota?(pct+'%'):'—',
      storagePersisted:st.persisted===true, storageNotPinned:st.persisted!==true,
      storageDurableLabel:st.persisted===true?'Pinned — survives a tab close':'Not pinned — the browser may evict the local cache',
      storageDurableColor:st.persisted===true?'#0F7048':'#8A5A14', storageDurableBg:st.persisted===true?'#EAF6F0':'#FBF3E2',
      storageIdb:(st.idbNames||[]).join(', ')||'—',
      syncMem:mem?(this.fmtBytes(mem.used||mem.bytes||0)+(mem.budget?(' / '+this.fmtBytes(mem.budget)):'')):'—',
      syncLog:((snap&&snap.log)||[]).slice(-14).reverse().map(l=>({msg:(l&&l.msg)||String(l)})),
      onSyncRefresh:()=>this.refreshSync(), onResync:()=>this.resyncNow(), onMakeDurable:()=>this.makeDurable(), onBackFromSync:()=>this.backFromSync(),
    };
  }

  renderVals(){
    const S=this.state;
    const isCrm=S.view==='crm', isDb=S.view==='db', isSpaces=S.view==='spaces', isSync=S.view==='sync';
    // Spaces launchpad — what you land on after sign-in: a card per workspace
    // (each an encrypted room / demo space), folded just enough to show a count.
    const myLocal=(S.session&&S.session.userId)?String(S.session.userId).replace(/^@/,'').split(':')[0]:'';
    let spaceCards=[];
    if(isSpaces){
      this.applyEngineNS();
      spaceCards=this.workspaces.map(w=>{
        let cnt='';
        try{
          const st=this.foldRoom(w.roomId);
          let n=this.buildClients(st).length;
          // Imported "Client Info" rows live in blobs; count them from the
          // import entity's recorded total rather than folding 12k blob rows.
          if(!this.demo&&window.AminoRows){ this.clientSetNames(st).forEach(name=>{ window.AminoRows.importsForSet(st,name).forEach(imp=>{ n+=(imp.rows_imported||0); }); }); }
          cnt=String(n);
        }catch(e){ cnt=''; }
        const [bg,fg]=this.colorFor(w.name);
        return {roomId:w.roomId,name:w.name,initials:(w.name.trim()[0]||'W').toUpperCase(),av:fg,avBg:bg,count:cnt,onEnter:()=>this.selectWorkspace(w.roomId)};
      });
    }
    const q=S.search.trim().toLowerCase();
    const clientList=this.clients.filter(c=>!q||(c.f['Family Name']+' '+c.f['First Name']).toLowerCase().includes(q)||c.f['A#'].toLowerCase().includes(q)).map(c=>{
      const on=c.id===S.cur, [cb,cf]=this.colorFor(c.f['Country']);
      return {name:c.f['Family Name']+', '+c.f['First Name'],initials:c.initials,av:c.av,country:c.f['Country'],coBg:cb,coFg:cf,aNum:c.f['A#'],relief:c.f['Relief Sought'],bg:on?'#FBF7EF':'#fff',bar:on?'#C2872B':'transparent',onPick:()=>this.setState({cur:c.id,ef:null,customize:false})};
    });
    const cc=this.clients[S.cur]||this.blankClient(), [stB,stF]=this.colorFor(cc.f['Case Status']), [reB,reF]=this.colorFor(cc.f['Relief Sought']);
    const clientName=cc.f['Family Name']+', '+cc.f['First Name'];
    const recEvents=(S.extraNotes[S.cur]||[]).map(t=>({act:t,type:'Note',date:'just now',by:'CVega',desc:'',due:''})).concat(cc.notes);
    const styleEv=(n)=>({act:n.act,type:n.type,date:n.date,by:n.by,desc:n.desc,hasDesc:!!n.desc,due:n.due,hasDue:!!n.due,tone:this.noteTone(n.type),bg:this.noteBg(n.type),icon:this.noteIcon(n.type)});
    const hearings=recEvents.filter(n=>n.type==='Hearing'||n.type==='Appointment').map(styleEv);
    const deadlines=recEvents.filter(n=>n.due).map(styleEv);
    const TABS=[{id:'clientinfo',name:'Client Info',icon:'identification-card'},{id:'glance',name:'At-a-glance',icon:'gauge'},{id:'matters',name:'Matters',icon:'briefcase'},{id:'notes',name:'Case Notes',icon:'note'},{id:'ead',name:'EAD',icon:'identification-badge'},{id:'box',name:'Box',icon:'package'},{id:'related',name:'Related Individuals',icon:'users-three'},{id:'deadlines',name:'Deadlines',icon:'hourglass-medium'}];
    const curVM={name:cc.f['Family Name']+', '+cc.f['First Name'],initials:cc.initials,av:cc.av,aNum:cc.f['A#'],
      chips:[{text:cc.f['Country'],bg:this.colorFor(cc.f['Country'])[0],fg:this.colorFor(cc.f['Country'])[1]},{text:cc.f['Relief Sought'],bg:reB,fg:reF},{text:cc.f['Case Status'],bg:stB,fg:stF}]};

    const blocks=[];
    this.curLayout().forEach(blk=>{ const vm=this.blockVM(S.cur,blk); if(!vm.skip) blocks.push(vm); });

    const lm=this.LMETA[S.layout];
    // The Database view-model (tabs/columns/rows/views/record drawer) — computed
    // from the real fold + materialized import rows via window.AminoDB.
    const db=this.dbModel();

    return {
      isCrm,isDb,isSpaces,
      // ── Spaces launchpad ──
      spaceCards, spacesEmpty:spaceCards.length===0,
      demoActive:this.demo,
      // While the initial Matrix sync is still landing rooms, say so (and keep
      // Refresh available) instead of claiming there are none yet.
      spacesSyncing:(!this.demo&&S.wsSyncing&&spaceCards.length===0),
      onRefreshSpaces:()=>this.pollWorkspaces(),
      spacesGreeting:myLocal?('Welcome, '+myLocal):'Welcome',
      spacesTagline:this.demo
        ? 'Exploring demo data — pick a workspace to open. Nothing leaves this browser.'
        : ((S.wsSyncing&&spaceCards.length===0)
            ? 'Syncing your workspaces from app.aminoimmigration.com…'
            : (this.workspaces.length ? 'Pick a workspace to open, or start a new one.' : 'No workspaces yet — create one, or Refresh if you expect existing spaces to appear.')),
      newSpaceName:S.newSpaceName,
      onNewSpaceInput:(e)=>this.setState({newSpaceName:e.target.value}),
      onNewSpaceKey:(e)=>{if(e.key==='Enter'){e.preventDefault();this.createWorkspace(S.newSpaceName);}},
      onCreateSpace:()=>this.createWorkspace(S.newSpaceName),
      onExploreDemo:()=>this.exploreDemo(),
      onBackToSpaces:()=>{ this.setState({spacePickerOpen:false}); this.backToSpaces(); },
      // ── Rail space picker (dropdown, not an always-visible list) ──
      spacePickerOpen:S.spacePickerOpen,
      onToggleSpacePicker:()=>this.setState({spacePickerOpen:!S.spacePickerOpen}),
      curSpaceName:((this.workspaces.find(w=>w.roomId===this.curWs)||{}).name)||(this.workspaces.length?'Choose workspace':'No workspaces'),
      spaceList:this.workspaces.map(w=>{ const on=this.curWs===w.roomId&&isCrm; return {name:w.name,count:(w.roomId===this.curWs?String(this.clients.length):''),bg:on?'#FBF3E2':'transparent',color:on?'#8A5A14':'#46505B',weight:on?'700':'500',icolor:on?'#C2872B':'#8F95A0',onPick:()=>{ this.setState({spacePickerOpen:false}); this.selectWorkspace(w.roomId); }}; }),
      onNewSpacePrompt:()=>{ this.setState({spacePickerOpen:false}); this.createWorkspace(); },
      dbNavBg:isDb?'#FBF3E2':'transparent', dbNavColor:isDb?'#8A5A14':'#46505B', dbNavWeight:isDb?'700':'500', dbNavIw:isDb?'-bold':'', dbNavIcolor:isDb?'#C2872B':'#8F95A0',
      // Clients/Database segmented toggle — same workspace, two clearly-labeled
      // views, so it's obvious which one you're in (active side is raised/white).
      segCrmBg:isCrm?'#fff':'transparent', segCrmColor:isCrm?'#18202D':'#6B7682', segCrmWeight:isCrm?'700':'600', segCrmShadow:isCrm?'0 1px 2px rgba(16,24,40,.12)':'none', segCrmIw:isCrm?'-bold':'', segCrmIcolor:isCrm?'#C2872B':'#9aa3ad',
      segDbBg:isDb?'#fff':'transparent', segDbColor:isDb?'#18202D':'#6B7682', segDbWeight:isDb?'700':'600', segDbShadow:isDb?'0 1px 2px rgba(16,24,40,.12)':'none', segDbIw:isDb?'-bold':'', segDbIcolor:isDb?'#C2872B':'#9aa3ad',
      onShowCrm:()=>this.setState({view:'crm'}),
      railOpen:!S.railCollapsed, railClosed:S.railCollapsed, railW:S.railCollapsed?'62px':(S.railWidth+'px'), railCaret:S.railCollapsed?'caret-double-right':'caret-double-left', onToggleRail:()=>this.setState({railCollapsed:!S.railCollapsed}),
      onResizeStart:(e)=>{ e.preventDefault(); const sx=e.clientX, sw=S.railWidth; const move=(ev)=>{ let w=sw+(ev.clientX-sx); w=Math.max(190,Math.min(480,w)); this.setState({railWidth:w}); }; const up=()=>{ document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); document.body.style.userSelect=''; document.body.style.cursor=''; }; document.addEventListener('mousemove',move); document.addEventListener('mouseup',up); document.body.style.userSelect='none'; document.body.style.cursor='col-resize'; },
      showClientList:isCrm&&!S.listCollapsed, showListReopen:isCrm&&S.listCollapsed, onToggleList:()=>this.setState({listCollapsed:!S.listCollapsed}), onOpenList:()=>this.setState({listCollapsed:false}),
      viewsOpen:!S.viewsCollapsed, viewsClosed:S.viewsCollapsed, onToggleViews:()=>this.setState({viewsCollapsed:!S.viewsCollapsed}), onOpenViews:()=>this.setState({viewsCollapsed:false}),
      boxUrl:cc.f['box_shared_link']||'—',
      tabClientInfo:S.tab==='clientinfo', tabGlance:S.tab==='glance', tabMatters:S.tab==='matters', tabNotes:S.tab==='notes', tabEad:S.tab==='ead', tabBox:S.tab==='box', tabRelated:S.tab==='related', tabDeadlines:S.tab==='deadlines',
      recordTabs:TABS.map(t=>{const on=S.tab===t.id;let cnt='';let hc=false;if(t.id==='related'){cnt=String(cc.rel.length);hc=cc.rel.length>0;}if(t.id==='notes'){cnt=String(recEvents.length);hc=true;}if(t.id==='deadlines'){cnt=String(deadlines.length);hc=deadlines.length>0;}return {name:t.name,icon:t.icon,icolor:on?'#C2872B':'#9aa3ad',color:on?'#18202D':'#6B7682',weight:on?'700':'500',underline:on?'#C2872B':'transparent',hasCount:hc,count:cnt,onPick:()=>this.setState({tab:t.id})};}),
      quickActions:[
        {label:'New client',icon:'user-plus',bg:'#EAF6F0',color:'#0F7048',onClick:()=>this.addClient()},
        {label:'Home',icon:'house',bg:'#FBF3E2',color:'#C2872B',onClick:()=>this.setState({view:'crm',tab:'glance'})},
        {label:'Clients',icon:'users-three',bg:'#EAF1FF',color:'#2747C9',onClick:()=>this.setState({view:'crm',tab:'clientinfo'})},
        {label:'Calendar',icon:'calendar-dots',bg:'#E8F0FE',color:'#1A73E8',onClick:()=>this.setState({tab:'deadlines'})},
        {label:'New Case Note',icon:'note-pencil',bg:'#FBEFE0',color:'#E08416',onClick:()=>this.setState({view:'crm',tab:'notes'})},
        {label:'Invite teammate',icon:'user-circle-plus',bg:'#F1E9FE',color:'#7A3FB0',onClick:()=>this.inviteTeammate()},
      ],
      clientName,
      relatedList:cc.rel.map(r=>({who:clientName,rel:r.rel,of:r.of})), relatedEmpty:cc.rel.length===0,
      noteEvents:recEvents.map(styleEv),
      hearingsList:hearings, hearingsEmpty:hearings.length===0,
      deadlinesList:deadlines, deadlinesEmpty:deadlines.length===0,
      matter:{name:cc.f['Matter'],type:cc.f['Case Type'],status:cc.f['Case Status'],statusBg:stB,statusFg:stF,fields:[{label:'NTA Date',value:cc.f['NTA Date']||'—'},{label:'Priority Level',value:cc.f['Priority Level']||'—'},{label:'Asylum Case Status',value:cc.f['Asylum Case Status']||'—'},{label:'I589 Biom Status',value:cc.f['I589 Biom Status']||'—'},{label:'Date Relief Filed',value:cc.f['Date Relief Filed']||'—'},{label:'Relief Filed?',value:cc.f['Relief Filed?']||'—'}]},
      eadFields:[{label:'Relief Filed?',value:cc.f['Relief Filed?']||'—'},{label:'USCIS FOIA Stage',value:cc.f['USCIS FOIA Stage']||'—'},{label:'FOIA #',value:cc.f['FOIA #']||'—'},{label:'FOIA Receipt',value:cc.f['FOIA Receipt']||'—'},{label:'FOIA CD Date',value:cc.f['FOIA CD Date']||'—'}], eadComments:cc.f['EAD Comments']||'—',
      glanceFields:[{label:'Country',value:cc.f['Country']||'—'},{label:'Relief Sought',value:cc.f['Relief Sought']||'—'},{label:'Case Status',value:cc.f['Case Status']||'—'},{label:'Case Manager',value:cc.f['Case Manager']||'—'},{label:'Entry Date',value:cc.f['Entry Date']||'—'},{label:'Engagement',value:cc.f['Client Engagement Status']||'—'}],
      boxFolders:['Filings','Correspondence','Evidence','Contracts','Biometrics','Scans'],
      panelHome:!(S.panelView==='clients'&&isCrm), panelClients:(S.panelView==='clients'&&isCrm), onPanelHome:()=>this.setState({panelView:'home'}),
      workspaceNav:[{name:'All spaces',icon:'squares-four',iw:isSpaces?'-bold':'',icolor:isSpaces?'#C2872B':'#8F95A0',bg:isSpaces?'#FBF3E2':'transparent',color:isSpaces?'#8A5A14':'#46505B',weight:isSpaces?'700':'600',count:String(this.workspaces.length),hasCaret:false,onPick:()=>this.backToSpaces()}].concat(this.workspaces.map(w=>{const on=this.curWs===w.roomId&&isCrm;return {name:w.name,icon:'identification-card',iw:on?'-bold':'',icolor:on?'#C2872B':'#8F95A0',bg:on?'#FBF3E2':'transparent',color:on?'#8A5A14':'#46505B',weight:on?'700':'500',count:w.roomId===this.curWs?String(this.clients.length):'',hasCaret:false,onPick:()=>this.selectWorkspace(w.roomId)};})).concat([
        {name:'New workspace',icon:'plus',iw:'',icolor:'#0F7048',bg:'transparent',color:'#0F7048',weight:'600',count:'',hasCaret:false,onPick:()=>this.createWorkspace()},
        {name:'Database',icon:'database',iw:isDb?'-bold':'',icolor:isDb?'#C2872B':'#8F95A0',bg:isDb?'#FBF3E2':'transparent',color:isDb?'#8A5A14':'#46505B',weight:isDb?'700':'500',count:String(this.clients.length),hasCaret:false,onPick:()=>this.setState({view:'db'})},
        {name:'Import Airtable',icon:'table',iw:'',icolor:(!this.demo&&this.curWs)?'#8F95A0':'#C6CAD0',bg:'transparent',color:(!this.demo&&this.curWs)?'#46505B':'#AEB4BC',weight:'500',count:'',hasCaret:false,onPick:()=>this.openAirtable()},
        {name:'Sync & storage',icon:'cloud-arrow-down',iw:isSync?'-bold':'',icolor:isSync?'#C2872B':'#8F95A0',bg:isSync?'#FBF3E2':'transparent',color:isSync?'#8A5A14':'#46505B',weight:isSync?'700':'500',count:'',hasCaret:false,onPick:()=>this.openSync()},
      ]),
      hasFavs:S.favs.length>0,
      favLayouts:this.LORDER.filter(id=>S.favs.includes(id)).map(id=>this.layoutVM(id)),
      folders:this.FOLDERS.map(fo=>({name:fo.name,open:!!S.folderOpen[fo.id],caret:S.folderOpen[fo.id]?'caret-down':'caret-right',count:fo.layouts.length,layouts:fo.layouts.map(id=>this.layoutVM(id)),onToggle:()=>this.setState(s=>({folderOpen:Object.assign({},s.folderOpen,{[fo.id]:!s.folderOpen[fo.id]})}))})),
      clientCount:this.clients.length, search:S.search, onSearch:(e)=>this.setState({search:e.target.value}),
      clients:clientList, noClients:clientList.length===0,
      cur:curVM, layoutName:lm.name, layoutMeta:lm.meta,
      customize:S.customize, onToggleCustomize:()=>this.setState({customize:!S.customize,ef:null}),
      czBg:S.customize?'#C2872B':'#fff', czBorder:S.customize?'#B0781F':'#DFE2E6', czColor:S.customize?'#fff':'#46505B', czIcon:S.customize?'check':'sliders-horizontal', czIw:S.customize?'-bold':'', czLabel:S.customize?'Done':'Customize',
      onOpenDb:()=>this.setState({view:'db'}),
      blocks, onAddTop:()=>this.addBlock(null),
      noteDraft:S.noteDraft, onNoteInput:(e)=>this.setState({noteDraft:e.target.value}),
      onAddNote:()=>this.addNote(),
      onNoteKey:(e)=>{if(e.key==='Enter'){e.preventDefault(); this.addNote();}},
      connected:S.connected, notConnected:!S.connected,
      // Login form shows only when signed out AND not mid-resume; the resuming
      // overlay covers the cold-boot window so a duplicate login can't be fired.
      showLogin:(!S.connected&&!S.booting), booting:(S.booting&&!S.connected),
      loginHs:S.loginHs, loginUser:S.loginUser, loginPass:S.loginPass, loginErr:S.loginErr, hasLoginErr:!!S.loginErr,
      onLoginHs:(e)=>this.setState({loginHs:e.target.value}), onLoginUser:(e)=>this.setState({loginUser:e.target.value}), onLoginPass:(e)=>this.setState({loginPass:e.target.value}),
      onConnect:()=>this.connect(), onLoginKey:(e)=>{if(e.key==='Enter'){e.preventDefault();this.connect();}},
      sessUser:(S.session&&S.session.userId)||'', sessHs:((S.session&&S.session.homeserver)||'').replace(/^https?:\/\//,''), onDisconnect:()=>this.disconnect(),
      meName:(S.session&&S.session.userId)?String(S.session.userId).replace(/^@/,'').split(':')[0]:'Not signed in',
      meSub:(S.session&&S.session.userId)?('signed in · '+(String(S.session.userId).split(':')[1]||this.HOMESERVER.replace(/^https?:\/\//,''))):'app.aminoimmigration.com',
      // Spaces launchpad → a way into the Sync & storage page too.
      onOpenSync:()=>this.openSync(),
      // ── Airtable two-way sync surfaces (raw-React globals mounted via <x-import>) ──
      // The import dialog (window.AirtableSchemaModal) opens over everything; the
      // Sync-page panel (window.AirtableSyncPanel) shares/reads the WCK-sealed PAT,
      // raises a hand to pull, and lists per-table sync. Props are passed straight
      // through dc-runtime's <x-import> (camelCase preserved via sc-camel-*).
      airtableOpen:!!S.airtableOpen,
      airtableTicket:S.airtableTicket||0,
      atImport:{id:S.airtableTicket||0},
      atRoomId:this.curWs||'',
      atState:this._liveState||{},
      atEmit:(op,content)=>this.emitOp(this.curWs,op,content),
      onOpenAirtable:()=>this.openAirtable(),
      onCloseAirtable:()=>this.closeAirtable(),
      atRoom:this.curWs?{id:this.curWs,title:((this.workspaces.find(w=>w.roomId===this.curWs)||{}).name)||'workspace'}:null,
      atSession:S.session?{mxid:S.session.userId,demo:!!this.demo,stale:!!(this.ML&&this.ML()&&this.ML().isStale&&this.ML().isStale())}:null,
      // Database view-model — tabs, columns, rows, views rail, record drawer.
      ...db,
      // Sync & storage view-model (only computed when that page is open).
      ...(isSync?this.syncModel():{isSync:false}),
    };
  }
}

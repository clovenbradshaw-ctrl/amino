
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
    this.VIEWS={
      clientInfo:[{id:'all',name:'All clients',icon:'table'},{id:'engaged',name:'Engaged',icon:'funnel-simple'},{id:'prospects',name:'Prospects',icon:'funnel-simple'},{id:'detained',name:'Detained',icon:'funnel-simple'}],
      caseMaster:[{id:'all',name:'All cases',icon:'table'},{id:'proc',name:'In proceedings',icon:'funnel-simple'},{id:'uscis',name:'USCIS pending',icon:'funnel-simple'},{id:'detained',name:'Detained',icon:'funnel-simple'},{id:'granted',name:'Granted',icon:'funnel-simple'}],
      caseNotes:[{id:'all',name:'All activity',icon:'table'},{id:'hearings',name:'Hearings',icon:'funnel-simple'},{id:'tasks',name:'Tasks',icon:'funnel-simple'},{id:'filings',name:'Filings',icon:'funnel-simple'}],
    };
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
    this.state={ view:'crm', cur:0, layout:'editClient', customize:false, search:'', dbTable:'clientInfo', dbSearch:'', dbView:{clientInfo:'all',caseMaster:'all',caseNotes:'all'}, dbViewSearch:'', favs:['editClient'], folderOpen:{client:true,court:true,foia:true}, railCollapsed:false, listCollapsed:false, viewsCollapsed:false, tab:'clientinfo', panelView:'clients', railWidth:212, dbRecord:null, vals:{}, ef:null, draft:'', noteDraft:'', layouts:JSON.parse(JSON.stringify(this.DEF)), extraNotes:{},
      connected:false, connecting:false, demo:false, session:null, loginHs:this.HOMESERVER, loginUser:'', loginPass:'', loginErr:'', newSpaceName:'', spacePickerOpen:false };
    try{ window.AminoApp=this; }catch(e){}
    // Boot: bind the namespace, subscribe to live timeline changes, and resume a
    // restored session (the foundation auto-unlocks a prior login on cold start).
    this.whenLive().then(()=>{ try{
      this.ME().setNamespace(this.NS);
      if(!this._unsub) this._unsub=this.ML().subscribe(()=>{ if(this.demo) this.refold(); else this.loadWorkspaces(); });
      if(this.ML().isAuthed&&this.ML().isAuthed()){ const sess=this.ML().getSession()||{}; this.setState({connected:true,session:{homeserver:this.HOMESERVER,userId:sess.mxid||sess.userId||''},view:'spaces'}); this.loadWorkspaces(); }
    }catch(e){} });
  }

  // ── foundation bridges (window.MatrixLive = real homeserver; window.MatrixEngine = fold) ──
  whenLive(){ return new Promise(res=>{ const t=()=>{ if(window.MatrixLive&&window.MatrixEngine) res(); else setTimeout(t,60); }; t(); }); }
  ML(){ return window.MatrixLive; }
  ME(){ return window.MatrixEngine; }

  // Sign in against the hardcoded firm homeserver. No app-managed credential store:
  // the password unlocks the user's own Matrix account + E2EE keys on this device.
  async connect(){
    const u=(this.state.loginUser||'').trim();
    if(!u||!this.state.loginPass){ this.setState({loginErr:'Enter your Matrix ID and password.'}); return; }
    this.setState({loginErr:'',connecting:true});
    try{
      await this.whenLive();
      await this.ML().login({ homeserver:this.HOMESERVER, username:u, password:this.state.loginPass });
      const sess=this.ML().getSession()||{};
      this.demo=false;
      // Land on the spaces launchpad — let the user pick which workspace to open
      // instead of dropping silently into the first one.
      this.setState({connected:true,demo:false,connecting:false,session:{homeserver:this.HOMESERVER,userId:sess.mxid||sess.userId||u},loginPass:'',view:'spaces'});
      this.loadWorkspaces();
    }catch(e){ this.setState({connecting:false,loginErr:(e&&e.message)||'Sign-in failed.'}); }
  }
  // Explore demo data without a homeserver — seeds a handful of immigration
  // workspaces locally and folds them through the same pipeline as a live login.
  async exploreDemo(){
    try{ await this.whenLive(); }catch(e){}
    try{ this.ME().setNamespace(this.NS); }catch(e){}
    const saved=this.loadDemo();
    if(saved&&Array.isArray(saved.rooms)&&saved.rooms.length){ this._demoRooms=saved.rooms; this._demoEvents=saved.eventsByRoom||{}; }
    else { const built=this.buildDemoSpaces(); this._demoRooms=built.rooms; this._demoEvents=built.eventsByRoom; this.saveDemo(); }
    this.demo=true; this.curWs=null;
    this.setState({connected:true,demo:true,connecting:false,loginErr:'',loginPass:'',session:{homeserver:'demo://aminoimmigration',userId:'@demo:aminoimmigration.com'},view:'spaces'});
    this.loadWorkspaces();
  }
  disconnect(){ try{ if(!this.demo&&this.ML()&&this.ML().logout) this.ML().logout(); }catch(e){} this.clients=[]; this.workspaces=[]; this.curWs=null; this.demo=false; this.setState({connected:false,demo:false,loginPass:'',cur:0,view:'crm'}); }
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
      if((!this.curWs||!this.workspaces.some(w=>w.roomId===this.curWs))&&this.workspaces[0]) this.curWs=this.workspaces[0].roomId;
      this.refold();
    }catch(e){ this.forceUpdate(); }
  }
  selectWorkspace(roomId){ this.curWs=roomId; this.setState({cur:0,ef:null,view:'crm',dbRecord:null}); this.refold(); }
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
  refold(){
    if(!this.curWs||!window.MatrixEngine||!window.MatrixLive){ this.forceUpdate(); return; }
    try{
      this.applyEngineNS();
      const events=this.eventsFor(this.curWs);
      const state=this.ME().fold(events);
      this._liveState=state;
      // Demo: clients are native client/note entities. Live: project the
      // imported "Client Info" set (rows materialized from blobs) PLUS any
      // native client entities; kick off fetching any rows not cached yet.
      this.clients=this.demo ? this.buildClients(state) : this.projectLive(state);
      if(!this.demo) this.materializeLive(state);
      let cur=this.state.cur; if(cur>=this.clients.length) cur=0;
      this.setState({cur,vals:{},extraNotes:{}});
    }catch(e){ this.forceUpdate(); }
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
  // Build the live client list: materialized import rows (re-typed as 'client')
  // merged under any native client entities, folded through buildClients.
  projectLive(state){
    const entities={};
    for(const a in this._importRows){ if(!state.entities||!state.entities[a]) continue; for(const row of this._importRows[a]){ entities[row._anchor]=Object.assign({},row,{_type:'client'}); } }
    Object.assign(entities, state.entities||{});
    let clients=this.buildClients({entities, connections:(state&&state.connections)||[]});
    if(this.MAX_CLIENTS && clients.length>this.MAX_CLIENTS) clients=clients.slice(0,this.MAX_CLIENTS);
    return clients;
  }
  // Fetch + cache any client-set import rows not yet materialized, then
  // re-project and re-render. No-ops once every import blob is cached.
  materializeLive(state){
    const AR=window.AminoRows; if(!AR||!AR.importsForSet) return;
    const imps=[]; this.clientSetNames(state).forEach(n=>{ AR.importsForSet(state,n).forEach(e=>imps.push(e)); });
    const missing=imps.filter(e=>e&&e._anchor&&!this._importRows[e._anchor]&&!this._importInFlight.has(e._anchor));
    if(!missing.length) return;
    missing.forEach(imp=>{
      this._importInFlight.add(imp._anchor);
      Promise.resolve(AR.materializeImportRows(imp)).then(rows=>{ if(Array.isArray(rows)) this._importRows[imp._anchor]=rows; })
        .catch(()=>{})
        .then(()=>{
          this._importInFlight.delete(imp._anchor);
          const st=this._liveState||state;
          this.clients=this.projectLive(st);
          let cur=this.state.cur; if(cur>=this.clients.length) cur=0;
          this.setState({cur});
        });
    });
  }
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
      this.refold();
    }catch(e){ this.toast('Could not add client: '+((e&&e.message)||e)); }
  }
  // A case note is an INS('note') carrying the client anchor — one stored operator.
  async addNote(){
    const t=(this.state.noteDraft||'').trim(); if(!t) return;
    const ci=this.state.cur, c=this.clients[ci];
    if(!c||!c.anchor||!this.curWs){ this.setState({noteDraft:''}); return; }
    try{ await this.emitOp(this.curWs, this.ME().OP.INS, { entity_type:'note', payload:{ client:c.anchor, text:t, type:'Note', date:'just now' } }); }catch(e){}
    this.setState(s=>({extraNotes:Object.assign({},s.extraNotes,{[ci]:[t].concat(s.extraNotes[ci]||[])}),noteDraft:''})); this.refold(); }

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
  async setVal(ci,k,v){ const c=this.clients[ci]; this.setState(s=>({vals:Object.assign({},s.vals,{[ci+'::'+k]:v})})); if(!c||!c.anchor||!this.curWs)return; try{ await this.emitOp(this.curWs, this.ME().OP.DEF, { anchor:c.anchor, path:k, value:v }); if(this.demo) this.refold(); }catch(e){} }
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

  dbTables(){
    return {
      clientInfo:{name:'Client Info',icon:'identification-card',count:String((this.clients||[]).length),fields:312,
        columns:[{k:'__name',n:'Name',icon:'text-aa'},{k:'A#',n:'A#',icon:'hash'},{k:'Country',n:'Country',icon:'tag'},{k:'DOB',n:'DOB',icon:'calendar-blank'},{k:'Entry Date',n:'Entry Date',icon:'calendar-blank'},{k:'Relief Sought',n:'Relief Sought',icon:'tag'},{k:'Client Engagement Status',n:'Engagement',icon:'tag'},{k:'Phone Number',n:'Phone',icon:'phone'},{k:'box_shared_link',n:'box_shared_link',icon:'link-simple'}],open:true},
      caseMaster:{name:'Case Master View',icon:'briefcase',count:String((this.clients||[]).length),fields:312,
        columns:[{k:'Client Name',n:'Client Name',icon:'text-aa'},{k:'Case Type',n:'Case Type',icon:'tag'},{k:'Case Status',n:'Case Status',icon:'tag'},{k:'Matter',n:'Matter',icon:'text-aa'},{k:'NTA Date',n:'NTA Date',icon:'calendar-blank'},{k:'Priority Level',n:'Priority',icon:'tag'},{k:'I589 Biom Status',n:'I589 Biom Status',icon:'tag'},{k:'Date Relief Filed',n:'Date Relief Filed',icon:'calendar-blank'}],open:true},
      caseNotes:{name:'case_notes',icon:'note',count:String((this.clients||[]).reduce((n,c)=>n+((c.notes&&c.notes.length)||0),0)),fields:22,columns:[{k:'act',n:'Activity',icon:'text-aa'},{k:'type',n:'Type',icon:'tag'},{k:'date',n:'Date',icon:'calendar-blank'},{k:'by',n:'Created_By',icon:'tag'},{k:'desc',n:'Description',icon:'text-align-left'},{k:'matter',n:'Matter',icon:'text-aa'}],open:false},
    };
  }

  renderVals(){
    const S=this.state;
    const isCrm=S.view==='crm', isDb=S.view==='db', isSpaces=S.view==='spaces';
    // Spaces launchpad — what you land on after sign-in: a card per workspace
    // (each an encrypted room / demo space), folded just enough to show a count.
    const myLocal=(S.session&&S.session.userId)?String(S.session.userId).replace(/^@/,'').split(':')[0]:'';
    let spaceCards=[];
    if(isSpaces){
      this.applyEngineNS();
      spaceCards=this.workspaces.map(w=>{
        let cnt='';
        try{
          const st=this.ME().fold(this.eventsFor(w.roomId));
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
    const T=this.dbTables(), DT=T[S.dbTable], dq=S.dbSearch.trim().toLowerCase();
    const VW=this.VIEWS[S.dbTable], curViewId=S.dbView[S.dbTable]||'all', curView=VW.find(v=>v.id===curViewId)||VW[0];
    const noteType={hearings:'Hearing',tasks:'Task',filings:'Filing'};
    const passClient=(c)=>{ if(S.dbTable==='clientInfo'){ if(curViewId==='engaged')return c.f['Client Engagement Status']==='Engaged'; if(curViewId==='prospects')return c.f['Client Engagement Status']==='Prospect'; if(curViewId==='detained')return c.f['Case Status']==='Detained'; return true; } if(curViewId==='proc')return c.f['Case Status']==='In proceedings'; if(curViewId==='uscis')return c.f['Case Status']==='USCIS pending'; if(curViewId==='detained')return c.f['Case Status']==='Detained'; if(curViewId==='granted')return c.f['Case Status']==='Granted'; return true; };
    const viewCount=(vid)=>{ if(S.dbTable==='caseNotes'){ let n=0; this.clients.forEach(c=>{ (S.extraNotes[c.id]||[]).forEach(()=>{ if(!noteType[vid])n++; }); c.notes.forEach(x=>{ if(!noteType[vid]||x.type===noteType[vid])n++; }); }); return n; } let n=0; this.clients.forEach(c=>{ const keep=(S.dbTable==='clientInfo')?(vid==='all'||(vid==='engaged'&&c.f['Client Engagement Status']==='Engaged')||(vid==='prospects'&&c.f['Client Engagement Status']==='Prospect')||(vid==='detained'&&c.f['Case Status']==='Detained')):(vid==='all'||(vid==='proc'&&c.f['Case Status']==='In proceedings')||(vid==='uscis'&&c.f['Case Status']==='USCIS pending')||(vid==='detained'&&c.f['Case Status']==='Detained')||(vid==='granted'&&c.f['Case Status']==='Granted')); if(keep)n++; }); return n; };
    let dbRows=[];
    if(S.dbTable==='caseNotes'){
      const all=[]; this.clients.forEach(c=>{ (S.extraNotes[c.id]||[]).forEach(t=>all.push({act:t,type:'Note',date:'just now',by:'CVega',desc:'',matter:c.f['Matter']})); c.notes.forEach(n=>all.push({act:n.act,type:n.type,date:n.date,by:n.by,desc:n.desc||'—',matter:c.f['Matter']})); });
      dbRows=all.filter(r=>(!noteType[curViewId]||r.type===noteType[curViewId])&&(!dq||(r.act+' '+r.matter+' '+r.by).toLowerCase().includes(dq))).map(r=>({cursor:'pointer',onOpen:()=>this.setState({dbRecord:{table:'caseNotes',note:r}}),cells:DT.columns.map((col,i)=>{
        const v=r[col.k];
        if(i===0)return {isPrimary:false,isTag:false,isBox:false,isPlain:true,text:v,color:'#18202D'};
        if(col.k==='type'){const [bg,fg]=this.colorFor(v);return {isPrimary:false,isTag:true,isBox:false,isPlain:false,text:v,bg,fg};}
        return {isPrimary:false,isTag:false,isBox:false,isPlain:true,text:v||'—',color:v?'#46505B':'#C2C7CE'};
      })}));
    } else {
      const lay=S.dbTable==='caseMaster'?'courtClient':'editClient';
      dbRows=this.clients.filter(c=>{ if(!passClient(c))return false; const blob=(c.f['Family Name']+' '+c.f['First Name']+' '+c.f['A#']+' '+c.f['Matter']+' '+c.f['Country']).toLowerCase(); return !dq||blob.includes(dq); }).map(c=>({cursor:'pointer',onOpen:()=>this.setState({dbRecord:{table:S.dbTable,ci:c.id}}),
        cells:DT.columns.map((col,i)=>{
          if(col.k==='__name'){ return {isPrimary:true,isTag:false,isBox:false,isPlain:false,av:c.av,initials:c.initials,text:c.f['Family Name']+', '+c.f['First Name']}; }
          let v= col.k==='Client Name'? (c.f['Family Name']+', '+c.f['First Name']) : this.rawVal(c.id,col.k);
          if(i===0) return {isPrimary:true,isTag:false,isBox:false,isPlain:false,av:c.av,initials:c.initials,text:v};
          if(col.k==='box_shared_link') return {isPrimary:false,isTag:false,isBox:!!v,isPlain:!v,text:v||'—',color:'#C2C7CE'};
          if(this.TAGK.includes(col.k)||this.SEL[col.k]){ if(!v||v==='—')return {isPrimary:false,isTag:false,isBox:false,isPlain:true,text:'—',color:'#C2C7CE'}; const [bg,fg]=this.colorFor(v); return {isPrimary:false,isTag:true,isBox:false,isPlain:false,text:v,bg,fg}; }
          return {isPrimary:false,isTag:false,isBox:false,isPlain:true,text:v||'—',color:v&&v!=='—'?'#46505B':'#C2C7CE'};
        })}));
    }
    const dbColTemplate=DT.columns.map((c,i)=>i===0?'minmax(210px,1.4fr)':(c.k==='desc'?'minmax(200px,1.4fr)':'minmax(140px,1fr)')).join(' ');
    const dbRec=S.dbRecord; let dbRecordOpen=false,dbRecordTitle='',dbRecordSub='',dbRecordInitials='',dbRecordAv='#8F95A0',dbRecordFields=[],dbRecordCrm=()=>{},dbRecordIcon='note';
    if(dbRec){
      dbRecordOpen=true;
      if(dbRec.table==='caseNotes'){
        const r=dbRec.note; dbRecordTitle=r.act; dbRecordSub='case_notes'; dbRecordIcon='note'; dbRecordInitials='✎';
        const [tb,tf]=this.colorFor(r.type);
        dbRecordFields=[{label:'Type',value:r.type,isTag:true,tagBg:tb,tagFg:tf},{label:'Date',value:r.date},{label:'Created By',value:r.by},{label:'Matter',value:r.matter||'—'},{label:'Description',value:r.desc||'—'}];
      } else {
        const c=this.clients[dbRec.ci]; dbRecordTitle=c.f['Family Name']+', '+c.f['First Name']; dbRecordInitials=c.initials; dbRecordAv=c.av;
        dbRecordSub=(dbRec.table==='caseMaster'?'Case Master View':'Client Info')+' · '+c.f['A#'];
        dbRecordIcon=dbRec.table==='caseMaster'?'briefcase':'identification-card';
        const cols=this.dbTables()[dbRec.table].columns;
        dbRecordFields=cols.filter(col=>col.k!=='__name').map(col=>{ let v=col.k==='Client Name'?(c.f['Family Name']+', '+c.f['First Name']):this.rawVal(dbRec.ci,col.k); const isTag=this.TAGK.includes(col.k)||!!this.SEL[col.k]; let tb='#F0F2F4',tf='#5A5D63'; if(isTag&&v&&v!=='—'){const p=this.colorFor(v);tb=p[0];tf=p[1];} return {label:col.n,value:(v==null||v==='')?'—':v,isBox:col.k==='box_shared_link',isTag:isTag&&v&&v!=='—',tagBg:tb,tagFg:tf}; });
        dbRecordCrm=()=>this.setState({view:'crm',cur:dbRec.ci,panelView:'clients',tab:'clientinfo',layout:dbRec.table==='caseMaster'?'courtClient':'editClient',dbRecord:null});
      }
      dbRecordFields=dbRecordFields.map(f=>({label:f.label,value:f.value,isBox:!!f.isBox,isTag:!!f.isTag,isPlain:!f.isBox&&!f.isTag,tagBg:f.tagBg||'#F0F2F4',tagFg:f.tagFg||'#5A5D63'}));
    }

    return {
      isCrm,isDb,isSpaces,
      // ── Spaces launchpad ──
      spaceCards, spacesEmpty:spaceCards.length===0,
      demoActive:this.demo,
      spacesGreeting:myLocal?('Welcome, '+myLocal):'Welcome',
      spacesTagline:this.demo
        ? 'Exploring demo data — pick a workspace to open. Nothing leaves this browser.'
        : (this.workspaces.length ? 'Pick a workspace to open, or start a new one.' : 'Create your first workspace to get started.'),
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
      loginHs:S.loginHs, loginUser:S.loginUser, loginPass:S.loginPass, loginErr:S.loginErr, hasLoginErr:!!S.loginErr,
      onLoginHs:(e)=>this.setState({loginHs:e.target.value}), onLoginUser:(e)=>this.setState({loginUser:e.target.value}), onLoginPass:(e)=>this.setState({loginPass:e.target.value}),
      onConnect:()=>this.connect(), onLoginKey:(e)=>{if(e.key==='Enter'){e.preventDefault();this.connect();}},
      sessUser:(S.session&&S.session.userId)||'', sessHs:((S.session&&S.session.homeserver)||'').replace(/^https?:\/\//,''), onDisconnect:()=>this.disconnect(),
      meName:(S.session&&S.session.userId)?String(S.session.userId).replace(/^@/,'').split(':')[0]:'Not signed in',
      meSub:(S.session&&S.session.userId)?('signed in · '+(String(S.session.userId).split(':')[1]||this.HOMESERVER.replace(/^https?:\/\//,''))):'app.aminoimmigration.com',
      dbName:DT.name, dbIcon:DT.icon, dbCount:DT.count, dbFieldCount:DT.fields, dbSearch:S.dbSearch, onDbSearch:(e)=>this.setState({dbSearch:e.target.value}),
      dbTabs:Object.entries(T).map(([id,t])=>{const on=S.dbTable===id;return {name:t.name,icon:t.icon,count:t.count,bg:on?'#fff':'transparent',underline:on?'#C2872B':'transparent',color:on?'#18202D':'#6B7682',weight:on?'700':'500',icolor:on?'#C2872B':'#9aa3ad',onPick:()=>this.setState({dbTable:id,dbSearch:''})};}),
      dbViewSearch:S.dbViewSearch, onDbViewSearch:(e)=>this.setState({dbViewSearch:e.target.value}),
      dbViews:VW.filter(v=>{const vq=S.dbViewSearch.trim().toLowerCase();return !vq||v.name.toLowerCase().includes(vq);}).map(v=>{const on=curViewId===v.id;return {name:v.name,icon:v.icon,iw:on?'-bold':'',icolor:on?'#C2872B':'#9aa3ad',bg:on?'#FBF3E2':'transparent',color:on?'#8A5A14':'#46505B',weight:on?'700':'500',active:on,count:viewCount(v.id),onPick:()=>this.setState({dbView:Object.assign({},S.dbView,{[S.dbTable]:v.id}),dbSearch:''})};}),
      dbViewName:curView.name, dbViewIcon:curView.icon,
      dbTools:[{icon:'eye-slash',label:'Hide fields'},{icon:'funnel-simple',label:'Filter'},{icon:'arrows-down-up',label:'Sort'},{icon:'rows',label:'Group'}],
      dbColumns:DT.columns.map(c=>({name:c.n,icon:c.icon})), dbColTemplate, dbRows, dbRowsShown:dbRows.length,
      dbRecordOpen, dbRecordTitle, dbRecordSub, dbRecordInitials, dbRecordAv, dbRecordIcon, dbRecordFields, dbRecordIsClient:!!(dbRec&&dbRec.table!=='caseNotes'), onDbRecordCrm:dbRecordCrm, onCloseDbRecord:()=>this.setState({dbRecord:null}),
    };
  }
}

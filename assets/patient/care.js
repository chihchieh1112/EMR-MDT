/* Shared-care history, necessary communication, and specialty consultation. */
(function (root) {
  'use strict';

  const workItems = [
    ['history','Progress history'],
    ['communication','Essential communication'],
    ['consultation','Interdepartmental consult']
  ];
  const href = (route, changes) => '#'+new URLSearchParams({...route,...changes}).toString();

  function educationHistory(ctx) {
    const {state, patient, actors, esc, badge, source, empty} = ctx;
    const records = state.notes.filter(item=>item.p===patient.id&&item.noteType==='progress'&&item.sections?.educationContent).slice().sort((a,b)=>String(b.clinicalAt||b.at).localeCompare(String(a.clinicalAt||a.at)));
    if (!records.length) return `<section class="card"><h2>Doctor discharge education</h2>${empty('No education content saved by doctors yet.')}</section>`;
    return `<section class="card"><div class="row between"><div><h2>Doctor discharge education</h2><p>Nurses can view what doctors saved in the Progress Note / discharge preparation; add a communication record if needed.</p></div>${badge(records.length+' records')}</div>${records.map(item=>`<article class="education-readback"><div class="row between"><strong>${esc(item.sections.educationAudience||'Education audience not provided')}</strong>${badge(item.status==='signed'?'Signed (simulated)':'Draft')}</div><p class="preserve-lines">${esc(item.sections.educationContent)}</p><p><strong>Teach-back: </strong>${esc(item.sections.educationTeachBack||'Not provided')}</p>${source(item.id+' · '+(actors[item.author]?.name||'Author not provided by source')+' · '+(item.clinicalAt||item.at))}</article>`).join('')}</section>`;
  }

  function consultation(ctx) {
    const {state, patient, actor, actors, route, esc, badge, source, empty, form, area, select} = ctx;
    const all = (state.consultations || []).filter(item=>item.p===patient.id).slice().sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt)));
    const visible = actor.consultationOnly ? all.filter(item=>item.assignee===route.actor) : all;
    const directory = Object.entries(actors).filter(([,item])=>item.consultationOnly&&item.specialty);
    const cards = visible.length ? `<div class="consultation-list">${visible.map(item=>{
      const canRespond = actor.consultationOnly&&item.assignee===route.actor&&item.status==='requested';
      return `<article class="consultation-card"><div class="row between"><div><h3>${esc(item.specialty)} consult</h3><p class="consultation-person">Consultant: <strong>${esc(actors[item.assignee]?.name||'Not provided by source')}</strong></p></div>${badge(item.status==='completed'?'Replied':'Awaiting reply',item.status!=='completed')}</div><dl class="consultation-meta"><dt>Requesting doctor</dt><dd>${esc(actors[item.requester]?.name||'Not provided by source')}</dd><dt>Consult time</dt><dd>${esc(item.requestedAt||'Not provided by source')}</dd></dl><section class="consultation-question"><h4>Reason and question for consult</h4><p class="preserve-lines">${esc(item.question)}</p></section>${item.recommendation?`<section class="consultation-recommendation"><h4>Consult recommendation</h4><p class="preserve-lines">${esc(item.recommendation)}</p>${source((actors[item.responder]?.name||'Replier not provided by source')+' · '+(item.respondedAt||'Time not provided'))}</section>`:''}${canRespond?`<section class="consultation-response"><h4>Write consult recommendation</h4>${form('consultRespond',area('recommendation','Recommendation'),'Save consult reply',{id:item.id})}</section>`:''}${source(item.id+' · '+(item.source||'Consult record created in this prototype'))}</article>`;
    }).join('')}</div>` : empty(actor.consultationOnly?'No consults for this patient are assigned to you.':'No interdepartmental consult records for this patient.');
    const requester = actor.role==='doctor'&&!actor.consultationOnly ? `<section class="card consultation-request"><h2>New interdepartmental consult</h2><p>Specify the department and consultant doctor; after you submit, that doctor opens the patient record under their own login and replies.</p>${form('consultRequest',select('assignee','Consult department and staff',directory.map(([id,item])=>[id,item.specialty+' · '+item.name]))+area('question','Reason for consult, questions and what you want answered'),'Create consult record')}</section>` : '';
    return `<section class="card"><div class="row between"><div><h2>${actor.consultationOnly?'Consults assigned to me':'Interdepartmental consult history'}</h2><p>Consult requests and replies keep their own staff, department and time, separate from general communication records.</p></div>${badge(visible.length+' records')}</div>${cards}</section>${requester}`;
  }

  // Read-only condensations reused by 病人總覽 so the overview never re-implements this rendering.
  function consultationSummary(ctx) {
    const {state, patient, actor, actors, route, esc, badge, source, empty} = ctx;
    const all = (state.consultations || []).filter(item=>item.p===patient.id).slice().sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt)));
    const visible = actor.consultationOnly ? all.filter(item=>item.assignee===route.actor) : all;
    if (!visible.length) return empty('No cross-specialty consultation recorded; this does not mean none is needed.');
    return visible.slice(0,4).map(item=>`<article class="history"><div class="row between"><strong>${esc(item.specialty)} consultation · ${esc(actors[item.assignee]?.name||'assignee not supplied')}</strong>${badge(item.status==='completed'?'Answered':'Awaiting reply',item.status!=='completed')}</div><p class="preserve-lines">${esc(item.question)}</p>${item.recommendation?`<p class="preserve-lines"><strong>Recommendation:</strong> ${esc(item.recommendation)}</p>`:''}<p class="handover-line">${esc('Requested by '+(actors[item.requester]?.name||'not supplied')+' · '+(item.requestedAt||'time not supplied'))}</p></article>`).join('')
      + (visible.length>4?`<p class="source">${visible.length-4} more; see the shared-care history.</p>`:'');
  }
  function communicationSummary(ctx) {
    const {state, patient, actors, esc, source, empty} = ctx;
    const list = (state.communications || []).filter(item=>item.p===patient.id).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    if (!list.length) return empty('No communication recorded; this does not mean none took place.');
    return list.slice(0,4).map(item=>`<article class="history"><strong>${esc(item.kind+' · '+item.recipient)}</strong><p class="preserve-lines">${esc(item.text)}</p><p class="handover-line">${esc((actors[item.actor]?.name||'author not supplied')+' · '+item.at)}</p></article>`).join('')
      + (list.length>4?`<p class="source">${list.length-4} more; see shared-care history › communication.</p>`:'');
  }
  root.ICUPatientCareSummaries = {consultation: consultationSummary, communication: communicationSummary};

  root.ICUPatientViews.register('care', function (ctx) {
    const {actor, route, esc, badge, source, helpers} = ctx;
    const current = ['history','communication','consultation'].includes(route.careWork) ? route.careWork : 'history';
    const nav = workItems.map(([value,text])=>`<a href="${esc(href(route,{careWork:value,record:'',note:''}))}" class="${current===value?'active':''}" ${current===value?'aria-current="page"':''}>${text}</a>`).join('');
    const content = current === 'history' ? `<div class="care-notes care-history">${helpers.notes()}</div>` : current === 'communication' ? educationHistory(ctx)+helpers.communication() : consultation(ctx);
    // 外層已有子分頁與病人情境列；這裡只留內容，作者說明縮成一行。
    return `<section class="care-workspace" aria-live="polite">${current === 'consultation' ? '' : source('New entries will be recorded as ' + actor.name + '; author, role and time are saved with them.')}${content}</section>`;
  });
})(globalThis);

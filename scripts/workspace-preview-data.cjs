// Isolated fictional data. This module is never imported by the production app.
const at = new Date().toISOString();
const call = {callId:'review-call',source:'vapi_twilio',channel:'telephone',synthetic:false,state:'completed',stateLabel:'Completed',isFinal:true,callerNumberDisplay:'+1 202 555 0100',startedAt:at,endedAt:at,durationSec:93,transferState:'none'};
const inquiry = {id:1,callId:call.callId,callerName:'Maya Chen',topic:'New project consultation',details:'Would like to discuss a website for a small business.',callbackPhone:'+12025550100',callbackEmail:null,urgency:'normal',emailAckRequested:false,followUpStatus:'new',statusChangedAt:null,createdAt:at};
const contact = {id:'review-contact',name:'Maya Chen',phone:'+12025550100',source:'voice',lastInteractionAt:at,disposition:null,nextAppointmentAt:null,optedOut:false,callCount:1,conversationCount:0,unreadTexts:1};
const assistant = {id:1,name:'SiteMint assistant',templateKey:'general-receptionist',status:'draft',provider:null,providerLinked:false,config:{},providerSyncState:'not_published',providerSyncError:null,lastSyncedAt:null,syncError:null,createdAt:at,updatedAt:at};
const requests = [{id:'review-appointment',firmId:1,appointmentTypeId:'consult',startUtc:at,endUtc:at,state:'pending_review',source:'voice',contact:{name:'Maya Chen',phone:'+12025550100',email:null},createdAt:at,holdExpiresAt:null}];

const plus=(hours)=>{const d=new Date();d.setUTCHours(hours,0,0,0);return d.toISOString();};
const calls=[call,...Array.from({length:6},(_,i)=>({...call,callId:'sample-call-'+i,callerNumberDisplay:'+1 202 555 01'+String(i+11).padStart(2,'0'),startedAt:new Date(Date.now()-(i+1)*3600000).toISOString(),durationSec:75+i*21,summary:['Requested an estimate for a patio extension. Details sent to the inbox.','Asked to change an appointment. A request was captured.','Followed up on a previous inquiry. Callback details collected.'][i%3]}))];
call.summary='Requested a consultation. Contact details collected and sent to the inbox.';
requests.push(...['Morgan Lee','Daniel Kim','Priya Shah'].map((name,i)=>({...requests[0],id:'booked-'+i,state:'booked',startUtc:plus(9+i*2),endUtc:plus(10+i*2),contact:{name,phone:'+1202555012'+i,email:null}})));
inquiry.callerName='James Carter';inquiry.topic='New message from a past customer';inquiry.details='Hi Claidy, can you let me know when the crew will be available for a small walkway? Thanks!';
requests[0].contact.name='Sarah Mitchell';
const messages=[inquiry,{...inquiry,id:2,callerName:'Amelia Ross',topic:'Project update',followUpStatus:'resolved',details:'Thank you for the update. Looking forward to the consultation.'}];
const contacts=[contact,{...contact,id:'contact-2',name:'James Carter',phone:'+12025550111',unreadTexts:0}];

assistant.config={setup:{businessName:"SiteMint Preview Studio",role:'Friendly front-desk receptionist',industry:'Construction',primaryGoal:'Help callers request estimates and appointments',timezone:'UTC',language:'English (US)'},prompt:{firstMessage:"Thank you for calling SiteMint Preview Studio. How can I help you today?",businessInformation:'We help homeowners with patios, renovations and outdoor projects.',escalationRules:'Offer to take a message when the team is unavailable.',appointmentRules:'Collect the preferred date and project details.'}};
module.exports=function(u,method,input){const p=u.pathname;let body,status=200;
   if(p.endsWith('/auth/me')) body={firm:{id:1,name: "SiteMint Preview Studio",email:'preview@example.test',planTier:'trial',trialConversationsLimit:0,createdAt:at},conversationCount:0,viewer:{email:'preview@example.test',role:'owner',accountHolder:true}};
   else if(p.endsWith('/readiness')) body={state:'setting_up',label:'Setup in progress',detail:'Complete your setup before activation.',next:{label:'Continue setup',path:'/setup'},steps:[{key:'business',number:1,title:'Business details',state:'done',summary:'Complete',checks:[]},{key:'handling',number:2,title:'Call handling',state:'done',summary:'Complete',checks:[]},{key:'booking',number:3,title:'Appointment booking',state:'current',summary:'Two steps left',checks:[{key:'a',state:'todo',label:'Calendar',detail:'Connect calendar',fixPath:'/account/calendar'},{key:'b',state:'todo',label:'Availability',detail:'Set hours',fixPath:'/scheduling/availability'}]}],checkedAt:at};
   else if(p.endsWith('/voice/calls')) body={items:calls,count:calls.length};
   else if(/\/voice\/calls\/[^/]+$/.test(p)) body={call:{...(calls.find(c=>p.endsWith(c.callId))||call),assistantId:null,endedReason:'customer-ended-call',summary:'Asked about a new website.',transcript:null,recordingUrl:null,analysisAvailability:'unavailable',structuredOutcome:null,structuredOutcomeAvailability:'unavailable',artifactPolicy:'none',transfer:{state:'none',evidence:null,connectionKnowable:false,destinationMasked:null}}};
   else if(p.endsWith('/receptionist/dashboard')) body={generatedAt:at,timezone:'UTC',cards:[{key:'calls',label:'Calls today',value:7,detail:'Recorded calls',href:'/activity/calls'},{key:'messages',label:'Messages',value:1,detail:'Awaiting follow-up',href:'/activity/inquiries'},{key:'bookings',label:'Appointment requests',value:1,detail:'Needs a decision',href:'/scheduling/appointments'}],trend:Array.from({length:14},(_,i)=>({date:new Date(Date.now()-(13-i)*86400000).toISOString().slice(0,10),telephone:[4,6,3,8,5,9,7,5,10,8,6,12,9,7][i],browser:i%3,other:0})),activity:[{kind:'message',id:'1',title:'New project consultation',detail:'Maya asked about a website.',at,href:'/activity/inquiries',urgent:false}],unavailable:[]};
   else if(p.endsWith('/contacts')) body={items:contacts,count:contacts.length};
   else if(p.endsWith('/texts/read')) body={success:true};
   else if(p.endsWith('/texts')) body={items:[{direction:'out',body:'Your appointment request has been received. We will confirm your time shortly.',at,status:'sent',deliveryStatus:'delivered',errorCode:null,keyword:null,unread:false},{direction:'in',body:'Thank you. Please contact me tomorrow.',at,status:'received',deliveryStatus:null,errorCode:null,keyword:'other',unread:true}],count:1,unread:1};
   else if(p.endsWith('/voice/messages')) body={items:messages.filter(m=>!u.searchParams.get('status')||m.followUpStatus===u.searchParams.get('status')),count:messages.length,counts:Object.fromEntries(['new','in_progress','resolved'].map(state=>[state,messages.filter(m=>m.followUpStatus===state).length]))};
   else if(p.endsWith('/assistants/1')) {if(method==='PATCH'){if(input.name)assistant.name=input.name;if(input.config)assistant.config=input.config;}body={assistant};}
   else if(p.endsWith('/assistants')) body={items:[assistant],count:1};
   else if(p.endsWith('/calendar/requests/review-appointment/approve')) {requests[0].state='booked';body={ok:true,status:'booked'};}
   else if(p.endsWith('/availability/requests')) body={items:requests,count:1};
   else if(p.endsWith('/availability/config')) body={config:{timezone:'UTC',appointmentTypes:[{id:'consult',name:'Consultation',durationMinutes:30}],weeklyHours:[],exceptions:[],enabled:true}};
   else if(p.endsWith('/account/subscription')) body={subscription:null,serviceAccess:'not_activated'};
   else if(p.endsWith('/agent-config')) body={firm:{name: "SiteMint Preview Studio",industry:'Construction',greetingMessage:'Thank you for calling. How can I help?',businessDescription:'Residential projects and consultations.',qualifyingQuestions:[]}};
   else if(p.endsWith('/conversations')) body={conversations:[]};
   else if(p.endsWith('/voice/notifications')) body={items:[],count:0};
else if(p.endsWith('/voice/capabilities')) body={items:[]};
else if(/\/voice\/messages\/\d+$/.test(p)&&method==='PATCH') {const m=messages.find(m=>String(m.id)===p.split('/').pop());if(m)m.followUpStatus=input.followUpStatus||input.status;body={message:m};}
else {status=503;body={error:'Unavailable in isolated design review'};}

return {body,status};};

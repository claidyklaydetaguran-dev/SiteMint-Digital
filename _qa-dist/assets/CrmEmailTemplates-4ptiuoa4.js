import{r as a,j as e,M as D,X as E}from"./index-OoMxJQKc.js";import{C as b,P as M}from"./CrmLayout-Di9JJErW.js";import{B as c}from"./button-BhWtj4ci.js";import{a as l}from"./adminFetch-CvsmyhPR.js";import{P as _}from"./pen-7S1KPtj6.js";import{T as P}from"./trash-2-CEtUZ0YY.js";import"./zap-Bvx-0mhA.js";import"./AdminRouteGuard-BQna_Gqi.js";import"./search-lkaUh9ht.js";import"./bell-CiJHk70X.js";import"./circle-alert-BzVNjEC7.js";import"./check-BsSO1yrJ.js";import"./users-C806sNMq.js";import"./git-branch-CV78S8P7.js";import"./download-HwrWhjVy.js";import"./layers-DDGAerPA.js";import"./megaphone-D0lZzw84.js";import"./clipboard-list-D7MbhIp3.js";import"./globe-BHLDe5vd.js";import"./trending-up-BMGCNNdC.js";import"./wrench-wG-nTNqX.js";import"./clock-CVH3QybD.js";const I=[{name:"Initial Outreach",type:"initial_outreach",subject:"Hi {{name}}, let's talk about your website",body:`Hi {{name}},

I came across your business and wanted to reach out about how SiteMint Digital can help you grow your online presence.

We specialize in building custom websites, CRM systems, and automation tools that help businesses like yours get more customers.

Would you be open to a quick 15-minute call this week?

Best,
The SiteMint Digital Team`},{name:"Follow-Up",type:"follow_up",subject:"Following up — SiteMint Digital",body:`Hi {{name}},

I wanted to follow up on my previous message. I'd love to learn more about your business goals and see if we might be a good fit.

If you have any questions or would like to schedule a call, just reply to this email.

Looking forward to hearing from you!

Best,
The SiteMint Digital Team`},{name:"Discovery Call Reminder",type:"discovery_reminder",subject:"Your discovery call with SiteMint Digital — tomorrow",body:`Hi {{name}},

Just a quick reminder that we have a discovery call scheduled for tomorrow. We're looking forward to learning more about your project.

Please feel free to prepare any questions you have about our process, pricing, or timeline.

See you then!

Best,
Claidy Taguran
Technical Director, SiteMint Digital`},{name:"Proposal Sent",type:"proposal_sent",subject:"Your SiteMint Digital Proposal is Ready",body:`Hi {{name}},

Thank you for meeting with us! I've prepared a custom proposal based on our conversation.

Please review it at your convenience. I'm happy to walk you through it on a call or answer any questions via email.

We're excited about the opportunity to work with you.

Best,
The SiteMint Digital Team`},{name:"Checking In",type:"checking_in",subject:"Checking in — SiteMint Digital",body:`Hi {{name}},

I wanted to check in and see how things are going. We're still here if you're ready to move forward with your project.

Feel free to reach out whenever you're ready — no pressure at all.

Best,
The SiteMint Digital Team`},{name:"Thank You",type:"thank_you",subject:"Thank you for choosing SiteMint Digital!",body:`Hi {{name}},

Thank you for trusting SiteMint Digital with your project. We're thrilled to get started and will be in touch shortly to kick things off.

Expect a welcome email from our team within the next 24 hours with next steps.

We can't wait to build something great together!

Best,
The SiteMint Digital Team`}],g={name:"",type:"Other",subject:"",body:""};function se(){const[d,y]=a.useState([]),[j,w]=a.useState(!0),[v,n]=a.useState(!1),[m,u]=a.useState(null),[s,i]=a.useState(g),[p,h]=a.useState(!1),[x,f]=a.useState(!1),r=a.useCallback(async()=>{const t=await l("/api/crm/email-templates");if(t.status===401)return;const o=await t.json();y(o.templates||[]),w(!1)},[]);a.useEffect(()=>{r()},[r]);const N=()=>{u(null),i(g),n(!0)},k=t=>{u(t),i({name:t.name,type:t.type,subject:t.subject,body:t.body}),n(!0)},T=async()=>{!s.name||!s.subject||!s.body||(h(!0),m?await l(`/api/crm/email-templates/${m.id}`,{method:"PUT",body:JSON.stringify(s)}):await l("/api/crm/email-templates",{method:"POST",body:JSON.stringify(s)}),h(!1),n(!1),r())},S=async t=>{confirm("Delete this template?")&&(await l(`/api/crm/email-templates/${t}`,{method:"DELETE"}),r())},C=async()=>{f(!0);for(const t of I)await l("/api/crm/email-templates",{method:"POST",body:JSON.stringify(t)});f(!1),r()};return j?e.jsx(b,{children:e.jsx("div",{className:"flex items-center justify-center h-64",children:e.jsx("div",{className:"w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin"})})}):e.jsxs(b,{children:[e.jsxs("div",{className:"p-6 max-w-5xl mx-auto",children:[e.jsxs("div",{className:"flex items-center justify-between mb-5 flex-wrap gap-3",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-serif font-bold text-foreground",children:"Email Templates"}),e.jsxs("p",{className:"text-muted-foreground text-sm mt-0.5",children:[d.length," templates · Use ","{{name}}"," for personalization"]})]}),e.jsxs("div",{className:"flex gap-2",children:[d.length===0&&e.jsx(c,{variant:"outline",size:"sm",onClick:C,disabled:x,children:x?"Loading…":"Load Default Templates"}),e.jsxs(c,{size:"sm",className:"gap-1.5",onClick:N,children:[e.jsx(M,{className:"w-3.5 h-3.5"})," New Template"]})]})]}),d.length===0?e.jsxs("div",{className:"bg-white rounded-xl border border-border py-16 text-center",children:[e.jsx(D,{className:"w-10 h-10 text-muted-foreground/40 mx-auto mb-3"}),e.jsx("p",{className:"text-muted-foreground font-medium",children:"No email templates yet"}),e.jsx("p",{className:"text-sm text-muted-foreground/70 mt-1",children:'Click "Load Default Templates" to add 6 pre-built ones.'})]}):e.jsx("div",{className:"grid sm:grid-cols-2 gap-4",children:d.map(t=>e.jsxs("div",{className:"bg-white rounded-xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2 mb-2",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"font-semibold text-sm text-foreground",children:t.name}),e.jsx("span",{className:"text-xs text-muted-foreground",children:t.type.replace(/_/g," ")})]}),e.jsxs("div",{className:"flex gap-1 shrink-0",children:[e.jsx("button",{onClick:()=>k(t),className:"p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors rounded",children:e.jsx(_,{className:"w-3.5 h-3.5"})}),e.jsx("button",{onClick:()=>S(t.id),className:"p-1.5 text-muted-foreground/60 hover:text-red-500 transition-colors rounded",children:e.jsx(P,{className:"w-3.5 h-3.5"})})]})]}),e.jsx("p",{className:"text-xs font-medium text-muted-foreground mb-2 border-b border-border/60 pb-2",children:t.subject}),e.jsx("p",{className:"text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap",children:t.body})]},t.id))})]}),v&&e.jsx("div",{className:"fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4",onClick:()=>n(!1),children:e.jsxs("div",{className:"bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between p-5 border-b border-border/60",children:[e.jsx("h2",{className:"font-serif font-bold text-lg",children:m?"Edit Template":"New Template"}),e.jsx("button",{onClick:()=>n(!1),className:"text-muted-foreground/60 hover:text-foreground",children:e.jsx(E,{className:"w-4 h-4"})})]}),e.jsxs("div",{className:"p-5 space-y-4",children:[e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{className:"text-xs font-semibold text-muted-foreground block mb-1",children:"Template Name"}),e.jsx("input",{className:"w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none",placeholder:"e.g. Initial Outreach",value:s.name,onChange:t=>i(o=>({...o,name:t.target.value}))})]}),e.jsxs("div",{children:[e.jsx("label",{className:"text-xs font-semibold text-muted-foreground block mb-1",children:"Type"}),e.jsx("select",{className:"w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none",value:s.type,onChange:t=>i(o=>({...o,type:t.target.value})),children:["initial_outreach","follow_up","discovery_reminder","proposal_sent","checking_in","thank_you","Other"].map(t=>e.jsx("option",{children:t},t))})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"text-xs font-semibold text-muted-foreground block mb-1",children:"Subject"}),e.jsx("input",{className:"w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none",placeholder:"Email subject",value:s.subject,onChange:t=>i(o=>({...o,subject:t.target.value}))})]}),e.jsxs("div",{children:[e.jsxs("label",{className:"text-xs font-semibold text-muted-foreground block mb-1",children:["Body ",e.jsxs("span",{className:"text-muted-foreground/60 font-normal",children:["(use ","{{name}}"," for personalization)"]})]}),e.jsx("textarea",{className:"w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none resize-none",rows:10,placeholder:"Email body…",value:s.body,onChange:t=>i(o=>({...o,body:t.target.value}))})]})]}),e.jsxs("div",{className:"flex gap-2 p-5 border-t border-border/60",children:[e.jsx(c,{variant:"outline",className:"flex-1",onClick:()=>n(!1),children:"Cancel"}),e.jsx(c,{className:"flex-1",onClick:T,disabled:p||!s.name||!s.subject||!s.body,children:p?"Saving…":m?"Update Template":"Create Template"})]})]})})]})}export{se as default};

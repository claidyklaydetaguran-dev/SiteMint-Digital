/**
 * The connected operating journey, against the OWNER-PREVIEW database.
 *
 * Client → lead → deal → proposal → won → project → tasks → appointment →
 * documents → communications → reminders → completion → history and reports.
 *
 * Every step asserts the NEXT surface actually reflects it, because a step
 * that writes a row but never reaches the screen somebody works from is not
 * a working feature.
 */

const API = "http://localhost:8080/api";
const ADMIN = "local-dev-bootstrap-only";
const PW = "LocalOnlyDevAccess42!";

let H = { "Content-Type": "application/json" };
const results = [];
let failures = 0;

function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "  PASS " : "  FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body === undefined ? H : H,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

const owners = [
  { key: "shasta", email: "shasta@sitemintdigital.test", name: "Shasta Greene" },
  { key: "claidy", email: "claidy@sitemintdigital.test", name: "Claidy Taguran" },
  { key: "saisa", email: "saisa@sitemintdigital.test", name: "Saisa Lorraigne" },
];
const sessions = {};

async function loginAs(key) {
  H = { "Content-Type": "application/json", ...sessions[key] };
}

(async () => {
  console.log("\n=== 1. Three separate owner accounts ===");

  let r = await fetch(`${API}/crm/staff/bootstrap`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: owners[0].email, displayName: owners[0].name, password: PW, adminPassword: ADMIN }),
  });
  check("the first owner bootstraps", r.status === 201, `status ${r.status}`);

  const lr = await fetch(`${API}/crm/staff/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: owners[0].email, password: PW }),
  });
  const lb = await lr.json();
  sessions.shasta = {
    Cookie: lr.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
    "X-CSRF-Token": lb.csrfToken,
  };
  await loginAs("shasta");
  check("signing in returns a session and a CSRF token", lr.status === 200 && !!lb.csrfToken);

  // The other two owners, created and activated so each can act as themselves.
  for (const who of owners.slice(1)) {
    const created = await call("POST", "/crm/staff", { email: who.email, displayName: who.name, role: "owner" });
    check(`${who.name} is invited as an owner`, created.status === 201, `status ${created.status}`);
    const token = created.json.activationToken;
    const activated = await call("POST", "/crm/staff/activation", { token, password: PW });
    check(`${who.name} sets her own password`, activated.status === 200);
    // Verification is NOT granted by an operator-relayed token.
    check(`${who.name}'s mailbox is not claimed as verified`, activated.json.emailVerified === false,
      `emailVerified=${activated.json.emailVerified}`);

    const s = await fetch(`${API}/crm/staff/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who.email, password: PW }),
    });
    const sb = await s.json();
    sessions[who.key] = {
      Cookie: s.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
      "X-CSRF-Token": sb.csrfToken,
    };
  }
  await loginAs("shasta");

  console.log("\n=== 2. Client and lead ===");
  const lead = await call("POST", "/crm/leads", {
    name: "Dana Whitfield", company: "Northbay Dental",
    email: "dana@northbaydental.test", phone: "+15550199001",
    source: "Referral", serviceInterest: "Website redesign", status: "New",
  });
  const leadId = lead.json.lead?.id ?? lead.json.id;
  check("a contact is created", lead.status === 201 && !!leadId, `id ${leadId}`);

  console.log("\n=== 3. Deal, owned and forecast ===");
  const deal = await call("POST", "/crm/deals", {
    leadId, name: "Northbay Dental — site rebuild", value: "12000.00", stage: "Proposal",
  });
  const dealId = deal.json.deal?.id ?? deal.json.id;
  check("a deal is created", !!dealId, `id ${dealId}`);

  const staffList = await call("GET", "/crm/staff");
  const claidyId = staffList.json.staff.find((s) => s.email === owners[1].email).id;
  const owned = await call("POST", `/crm/deals/${dealId}/owner`, { staffId: claidyId });
  check("the deal is put in Claidy's name", owned.status === 200 && owned.json.deal.ownerStaffId === claidyId);

  await call("POST", `/crm/deals/${dealId}/probability`, { probability: 75 });
  const forecast1 = await call("GET", "/crm/sales/forecast");
  check("the forecast separates pipeline from money received",
    forecast1.json.pipelineValue === 12000 && forecast1.json.moneyReceivedAllTime === 0,
    `pipeline ${forecast1.json.pipelineValue}, received ${forecast1.json.moneyReceivedAllTime}`);
  check("the weighted forecast uses the deal's own 75%",
    Math.round(forecast1.json.weightedForecast) === 9000,
    `weighted ${forecast1.json.weightedForecast}`);
  check("a win rate with no decided deals is null, not 0%",
    forecast1.json.winRate === null && forecast1.json.winRateDenominator === 0);

  console.log("\n=== 4. Proposal ===");
  const proposal = await call("POST", `/crm/leads/${leadId}/proposal/generate`, {});
  check("a proposal is generated", proposal.status === 200 || proposal.status === 201, `status ${proposal.status}`);
  const accepted = await call("PATCH", `/crm/leads/${leadId}/proposal`, { proposalStatus: "Accepted" });
  check("the proposal is marked accepted", accepted.status === 200);

  console.log("\n=== 5. Won, then converted (duplicate-safe) ===");
  const won = await call("POST", `/crm/deals/${dealId}/close`, { outcome: "won" });
  check("the deal is closed as won, with who decided", won.status === 200 && won.json.deal.closedByStaffId != null);

  const convert1 = await call("POST", `/crm/deals/${dealId}/convert`, {});
  const projectId = convert1.json.project?.id;
  check("the won deal becomes a project", convert1.status === 201 && !!projectId, `project ${projectId}`);
  check("the agreed value carries across", Number(convert1.json.project.budget) === 12000);

  const convert2 = await call("POST", `/crm/deals/${dealId}/convert`, {});
  check("converting again returns the SAME project, not a second one",
    convert2.json.created === false && convert2.json.project.id === projectId);

  const leadAfter = await call("GET", `/crm/leads/${leadId}`);
  check("the contact is now a Client",
    (leadAfter.json.lead?.status ?? leadAfter.json.status) === "Client");

  console.log("\n=== 6. Tasks ===");
  const task = await call("POST", "/crm/operations/tasks", {
    title: "Draft the homepage", projectId,
    assignedToStaffId: claidyId,
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    remindAt: new Date(Date.now() + 60000).toISOString(),
  });
  const taskId = task.json.task?.id;
  check("a task is assigned to Claidy", task.status === 201 && !!taskId, `task ${taskId}`);

  await loginAs("claidy");
  const herDay = await call("GET", "/crm/my-day");
  const inHerDay = JSON.stringify(herDay.json).includes("Draft the homepage");
  check("it appears in Claidy's own My Day", inHerDay);
  await loginAs("shasta");

  console.log("\n=== 7. Appointment and reminder ===");
  const start = new Date(Date.now() + 3 * 86400000);
  const appt = await call("POST", "/crm/appointments", {
    title: "Northbay kickoff", startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3600000).toISOString(),
    leadId, projectId, location: "Zoom", reminderMinutesBefore: 30,
  });
  const apptId = appt.json.appointment?.id;
  check("an appointment is booked", appt.status === 201 && !!apptId);
  check("it does not claim invitations were sent", appt.json.invitationsSent === false);

  const jobs = await call("GET", "/crm/operations/jobs");
  const hasReminder = JSON.stringify(jobs.json).includes(`appointment_reminder:${apptId}`);
  check("a reminder job exists for it", hasReminder);

  console.log("\n=== 8. Documents ===");
  const request = await call("POST", "/crm/document-requests", {
    entityType: "project", entityId: projectId, title: "Logo files and brand guide",
  });
  check("a document request is recorded", request.status === 201);

  const pdf = Buffer.from("%PDF-1.4\ntrailer<<>>\n%%EOF\n").toString("base64");
  const upload = await call("POST", "/crm/documents", {
    entityType: "project", entityId: projectId,
    filename: "northbay-brand-guide.pdf", mimeType: "application/pdf", contentBase64: pdf,
  });
  check("a document is uploaded", upload.status === 201);
  check("it is explicitly not a signature",
    upload.json.attachment?.signatureStatus === "not_a_signature");

  const svg = await call("POST", "/crm/documents", {
    entityType: "project", entityId: projectId,
    filename: "evil.svg", mimeType: "image/svg+xml",
    contentBase64: Buffer.from("<svg onload=alert(1)>").toString("base64"),
  });
  check("an executable upload is refused", svg.status === 415);

  const share = await call("POST", `/crm/documents/${upload.json.attachment.id}/share`, { expiresInHours: 24 });
  check("a share link is issued once", share.status === 201 && !!share.json.shareToken);

  const anon = await fetch(`${API}/crm/documents/shared/${share.json.shareToken}`);
  check("the link downloads with no credentials",
    anon.status === 200 && anon.headers.get("content-disposition")?.includes("attachment"),
    `status ${anon.status}`);
  await call("POST", `/crm/documents/shares/${share.json.share.id}/revoke`);
  const afterRevoke = await fetch(`${API}/crm/documents/shared/${share.json.shareToken}`);
  check("and stops working once revoked", afterRevoke.status === 404);

  console.log("\n=== 9. Communications ===");
  // An inbound SMS, written the way the Twilio webhook writes it.
  const { execSync } = await import("node:child_process");
  execSync(
    `wsl -d Ubuntu -- psql "postgresql://crm_test:crm_test_local@localhost:5432/crm_preview" -c ` +
    `"insert into crm_messages (lead_id, direction, channel, body, from_number, to_number, origin) ` +
    `values (${leadId}, 'inbound', 'sms', 'Is the quote still valid?', '+15550199001', '+15550002222', 'inbound');"`,
    { stdio: "pipe" },
  );
  const backfill = await call("POST", "/crm/inbox/backfill");
  check("the message joins a durable conversation", backfill.json.linked >= 1,
    `linked ${backfill.json.linked}`);

  const convs = await call("GET", "/crm/inbox/conversations?limit=10");
  const conv = convs.json.conversations.find((c) => c.contactId === leadId);
  check("it shows in the inbox as unread", !!conv && conv.unread === 1, `unread ${conv?.unread}`);
  check("and nobody has taken it on yet", conv?.status === "unassigned");

  await call("POST", `/crm/inbox/conversations/${conv.id}/read`);
  const afterRead = await call("GET", `/crm/inbox/conversations/${conv.id}`);
  check("reading it clears only the badge",
    afterRead.json.conversation.unread === 0 && afterRead.json.conversation.status === "unassigned");

  await call("POST", `/crm/inbox/conversations/${conv.id}/assign`, { staffId: claidyId });
  const assigned = await call("GET", `/crm/inbox/conversations/${conv.id}`);
  check("assigning is a separate act", assigned.json.conversation.status === "assigned");

  // Claidy still has not read it — read state is per person.
  await loginAs("claidy");
  const hers = await call("GET", `/crm/inbox/conversations/${conv.id}`);
  check("Shasta reading it did not clear Claidy's badge", hers.json.conversation.unread === 1);
  await loginAs("shasta");

  console.log("\n=== 10. Completion, money, history ===");
  await loginAs("claidy");
  const done = await call("PATCH", `/crm/operations/tasks/${taskId}`, { status: "completed" });
  check("Claidy completes her task", done.status === 200);
  check("and is recorded as the person who did", done.json.task.completedByStaffId === claidyId);
  await loginAs("shasta");

  const payment = await call("POST", `/crm/deals/${dealId}/transactions/manual`, {
    amount: "4000.00", method: "manual_transfer", status: "received",
  });
  check("a payment is recorded", payment.status === 200 || payment.status === 201, `status ${payment.status}`);

  const chain = await call("GET", `/crm/sales/chain/${leadId}`);
  check("the chain shows the deal, its project and its money in one place",
    chain.json.deals?.[0]?.project?.id === projectId && chain.json.totals.received === 4000,
    `received ${chain.json.totals?.received}`);
  check("contracted and received are kept apart",
    chain.json.totals.contracted === 12000 && chain.json.totals.received === 4000);

  const forecast2 = await call("GET", "/crm/sales/forecast");
  check("the forecast now shows money actually received",
    forecast2.json.moneyReceivedAllTime === 4000 && forecast2.json.contractedValue === 12000);

  console.log("\n=== 11. Who did what ===");
  const audit = await call("GET", "/crm/staff/audit?limit=50");
  const actors = new Set(audit.json.entries.map((e) => e.actor));
  check("the audit log names more than one person", actors.size >= 2,
    `${actors.size} distinct actors`);
  const hasConvAudit = audit.json.entries.some((e) => e.action === "deal.converted");
  check("the conversion is audited", hasConvAudit);

  const cc = await call("GET", "/crm/command-center");
  const signed = cc.json.panels.find((p) => p.key === "documents_signed");
  check("the Command Center still refuses to call an upload a signature",
    signed.available === false && /not a signature/i.test(signed.reason));
  const appts = cc.json.panels.find((p) => p.key === "appointments");
  check("and reports the real appointment", appts.available === true && appts.count >= 1);

  console.log("\n=== 12. Restricted access stays restricted ===");
  const hire = await call("POST", "/crm/staff", {
    email: "newhire@sitemintdigital.test", displayName: "New Hire", role: "operations_manager",
  });
  const hireToken = hire.json.activationToken;
  await call("POST", "/crm/staff/activation", { token: hireToken, password: "NewHireLocalOnly55!" });
  const hs = await fetch(`${API}/crm/staff/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "newhire@sitemintdigital.test", password: "NewHireLocalOnly55!" }),
  });
  const hsb = await hs.json();
  const hireH = {
    "Content-Type": "application/json",
    Cookie: hs.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
    "X-CSRF-Token": hsb.csrfToken,
  };
  const saved = H; H = hireH;
  check("a new hire can do their job", (await call("GET", "/crm/my-day")).status === 200);
  check("but cannot manage staff", (await call("GET", "/crm/staff")).status === 403);
  check("cannot delete a client record", (await call("DELETE", `/crm/leads/${leadId}`)).status === 403);
  check("and cannot delete a client's document",
    (await call("DELETE", `/crm/documents/${upload.json.attachment.id}`)).status === 403);
  H = saved;

  console.log(`\n=== ${results.length - failures}/${results.length} checks passed ===`);
  if (failures > 0) {
    console.log("FAILED:");
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.label} ${r.detail}`);
  }
  process.exit(failures > 0 ? 1 : 0);
})().catch((e) => {
  console.error("JOURNEY CRASHED:", e?.message);
  console.error(e?.stack?.split("\n").slice(0, 5).join("\n"));
  process.exit(1);
});

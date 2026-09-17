import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupportRequest, listSupportRequests } from "@/lib/supportApi";
import { ROUTES } from "@/lib/routes";
import { NUMBER_REQUEST as COPY, numberRequestBody } from "./phoneNumberContract";

/** Uses the existing business-owned support thread, including its server
 * validation and notification outcome. No purchase or routing happens here. */
export function NumberSetupRequest() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"new" | "existing">("new");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const requests = useQuery({ queryKey: ["support", "requests"], queryFn: listSupportRequests, retry: false });
  const send = useMutation({
    mutationFn: (body: string) => createSupportRequest({ subject: COPY.subject, category: "question", body }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["support"] }); },
  });
  const pending = requests.data?.items.find((request) => request.subject === COPY.subject && request.status !== "closed");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (send.isPending || pending || requests.isError || !requests.data) return;
    const body = numberRequestBody({ kind, region, phone, notes });
    if (!body) { setValidation(!region.trim() ? COPY.regionRequired : COPY.phoneRequired); return; }
    setValidation(null);
    send.mutate(body);
  }

  return (
    <section className="sd-section">
      <h2 className="sd-h2">{COPY.heading}</h2>
      {requests.isLoading ? <p role="status">{COPY.loading}</p> : requests.isError ? (
        <div className="sd-error" role="alert"><p>{COPY.readFailed}</p><button type="button" className="sd-error__action" disabled={requests.isFetching} onClick={() => requests.refetch()}>Try again</button></div>
      ) : pending || send.isSuccess ? (
        <div className="sd-status" data-state="unknown" role="status">
          <h3 className="sd-status__title">{COPY.pendingTitle}</h3>
          <p className="sd-status__detail">{COPY.pendingDetail}</p>
          <Link href={ROUTES.support} className="sd-link">{COPY.viewSupport}</Link>
        </div>
      ) : (
        <form className="sn-request" onSubmit={submit}>
          <fieldset className="sn-options">
            <legend className="sd-sr">{COPY.heading}</legend>
            <label><input type="radio" name="number-kind" value="new" checked={kind === "new"} onChange={() => setKind("new")} /> <strong>{COPY.newLabel}</strong><p className="sd-muted">{COPY.newDetail}</p></label>
            <label><input type="radio" name="number-kind" value="existing" checked={kind === "existing"} onChange={() => setKind("existing")} /> <strong>{COPY.existingLabel}</strong><p className="sd-muted">{COPY.existingDetail}</p></label>
          </fieldset>
          <label className="sn-field">{COPY.regionLabel}<input required maxLength={100} value={region} onChange={(e) => setRegion(e.target.value)} placeholder={COPY.regionPlaceholder} /></label>
          {kind === "existing" && <label className="sn-field">{COPY.phoneLabel}<input type="tel" required maxLength={26} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={COPY.phonePlaceholder} /></label>}
          <label className="sn-field">{COPY.notesLabel}<textarea maxLength={1000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} aria-describedby="sn-notes-detail" /></label>
          <p id="sn-notes-detail" className="sd-muted">{COPY.notesDetail}</p>
          {(validation || send.isError) && <p role="alert" className="sd-error">{validation ?? COPY.failed}</p>}
          <button type="submit" className="sn-submit" disabled={send.isPending} aria-busy={send.isPending}>{send.isPending ? COPY.submitting : COPY.submit}</button>
        </form>
      )}
      <p className="sd-muted"><Link href={ROUTES.assistants} className="sd-link">{COPY.browserTest}</Link></p>
    </section>
  );
}

/**
 * Add a contact, or edit one's name, email and notes, in a dialog.
 *
 * The phone number is only asked for when adding: it is how calls are matched
 * to a contact, so the server refuses to change it. Field errors from the
 * server are shown next to the field they belong to.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createContact, updateContact, type ContactDetailResponse, type ContactFieldError } from "@/lib/contactsApi";
import { FORM, validateContactForm, type ContactFormValues } from "./contactsContract";

type Props =
  | { mode: "add"; onSaved?: (detail: ContactDetailResponse) => void }
  | { mode: "edit"; contactId: string; initial: { name: string | null; email?: string | null; notes?: string | null }; onSaved?: (detail: ContactDetailResponse) => void };

export function ContactFormDialog(props: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const blank: ContactFormValues = { phone: "", name: "", email: "", notes: "" };
  const [values, setValues] = useState<ContactFormValues>(blank);
  const [errors, setErrors] = useState<Partial<Record<ContactFieldError["field"], string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setValues(
        props.mode === "edit"
          ? { phone: "", name: props.initial.name ?? "", email: props.initial.email ?? "", notes: props.initial.notes ?? "" }
          : blank,
      );
      setErrors({});
      setFormError(null);
    }
  };

  const set = (field: keyof ContactFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErrors({});
    setFormError(null);
    const check = validateContactForm(values, props.mode);
    if (!check.ok) {
      setErrors({ [check.field]: check.message });
      return;
    }
    setSaving(true);
    const result =
      props.mode === "add"
        ? await createContact(values)
        : await updateContact(props.contactId, { name: values.name, email: values.email, notes: values.notes });
    setSaving(false);
    if (!result.ok) {
      if (result.errors.length > 0) {
        setErrors(Object.fromEntries(result.errors.map((err) => [err.field, err.message])));
      } else {
        setFormError(result.message);
      }
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    setOpen(false);
    props.onSaved?.(result.detail);
  };

  const field = (name: keyof ContactFormValues) => ({
    id: `contact-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `contact-${name}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button variant={props.mode === "add" ? "default" : "outline"}>{props.mode === "add" ? FORM.addButton : FORM.editButton}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.mode === "add" ? FORM.addTitle : FORM.editTitle}</DialogTitle>
          <DialogDescription>{props.mode === "add" ? FORM.addDetail : FORM.editDetail}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          {formError !== null && (
            <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
              <strong className="block">{FORM.failedTitle}</strong>
              {formError}
            </div>
          )}

          {props.mode === "add" && (
            <div className="grid gap-1.5">
              <Label htmlFor="contact-phone">
                {FORM.phoneLabel} <span className="text-muted-foreground">({FORM.required})</span>
              </Label>
              <Input {...field("phone")} type="tel" autoComplete="tel" inputMode="tel" value={values.phone} onChange={set("phone")} required />
              <p className="text-xs text-muted-foreground">{FORM.phoneHelp}</p>
              {errors.phone && <p className="text-sm text-destructive" id="contact-phone-error">{errors.phone}</p>}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="contact-name">
              {FORM.nameLabel} <span className="text-muted-foreground">({FORM.optional})</span>
            </Label>
            <Input {...field("name")} autoComplete="off" value={values.name} onChange={set("name")} />
            {errors.name && <p className="text-sm text-destructive" id="contact-name-error">{errors.name}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="contact-email">
              {FORM.emailLabel} <span className="text-muted-foreground">({FORM.optional})</span>
            </Label>
            <Input {...field("email")} type="email" autoComplete="off" value={values.email} onChange={set("email")} />
            {errors.email && <p className="text-sm text-destructive" id="contact-email-error">{errors.email}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="contact-notes">
              {FORM.notesLabel} <span className="text-muted-foreground">({FORM.optional})</span>
            </Label>
            <Textarea {...field("notes")} rows={4} value={values.notes} onChange={set("notes")} />
            <p className="text-xs text-muted-foreground">{FORM.notesHelp}</p>
            {errors.notes && <p className="text-sm text-destructive" id="contact-notes-error">{errors.notes}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {FORM.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? FORM.saving : FORM.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

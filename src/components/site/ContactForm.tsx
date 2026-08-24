"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitContactForm } from "@/lib/actions/contact";
import { useDict } from "@/components/site/LocaleProvider";

function SendButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ContactForm() {
  const { t } = useDict();
  const f = t.contact.form;
  const [state, action] = useActionState(submitContactForm, undefined);

  if (state?.success) {
    return (
      <div className="card elev-sm p-8 flex flex-col items-center text-center gap-3">
        <span className="text-4xl" aria-hidden>
          🎉
        </span>
        <h3 className="text-lg">{f.thanksTitle}</h3>
        <p style={{ color: "var(--color-neutral-600)" }}>{f.thanksBody}</p>
      </div>
    );
  }

  return (
    <form action={action} className="card elev-sm p-7 flex flex-col gap-4">
      <h3 className="text-lg">{f.title}</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="field">
          <label htmlFor="fullName">{f.fullName}</label>
          <input className="input" id="fullName" name="fullName" placeholder={f.fullNamePlaceholder} required />
        </div>
        <div className="field">
          <label htmlFor="email">{f.email}</label>
          <input className="input" id="email" name="email" type="email" placeholder={f.emailPlaceholder} required />
        </div>
        <div className="field">
          <label htmlFor="phone">{f.phone}</label>
          <input className="input" id="phone" name="phone" placeholder={f.phonePlaceholder} />
        </div>
        <div className="field">
          <label htmlFor="projectType">{f.projectType}</label>
          <select className="input" id="projectType" name="projectType" defaultValue="">
            <option value="" disabled>
              {f.projectTypePlaceholder}
            </option>
            {f.projectTypes.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="message">{f.message}</label>
        <textarea
          className="input"
          id="message"
          name="message"
          rows={5}
          placeholder={f.messagePlaceholder}
          required
        />
      </div>
      {state?.error && (
        <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-4 flex-wrap">
        <SendButton label={f.send} pendingLabel={f.sending} />
        <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
          {f.responseTime}
        </p>
      </div>
    </form>
  );
}

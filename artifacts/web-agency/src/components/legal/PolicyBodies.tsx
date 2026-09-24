/**
 * The wording of the Terms of Service and the Privacy Policy, shared by the
 * standalone pages and the signup dialogs so the two can never differ.
 *
 * Drafted from what the platform actually does; pending owner/legal approval
 * before production publication. Keep POLICY_VERSIONS in step with any change.
 */

import { POLICY_VERSIONS, policyDateLabel } from "@/pages/legal/policyVersions";

export function PolicyUpdated({ policy }: { policy: keyof typeof POLICY_VERSIONS }) {
  return <>Last updated: {policyDateLabel(POLICY_VERSIONS[policy])}</>;
}

export function TermsBody() {
  return (
    <>
      <p>
        These terms govern your use of the SiteMint Digital website and, where
        you hold an account, the SiteMint AI Receptionist service. By using the
        site or the service, you agree to them.
      </p>

      <h2>Using this website</h2>
      <p>
        The website and its content belong to SiteMint Digital. You may browse
        it and submit inquiries about our services. Don&apos;t misuse it — no
        attempting to break, probe, or overload it, and no submitting
        information you don&apos;t have the right to share.
      </p>

      <h2>Service accounts and your team</h2>
      <p>
        If you create a SiteMint AI Receptionist account, you&apos;re
        responsible for keeping your credentials secure and for the accuracy of
        the business information you configure. You may invite team members;
        each signs in with their own password, and you are responsible for what
        they do in your account and for removing access they no longer need.
        You must have the authority to connect the phone numbers, calendars, and
        systems you connect.
      </p>

      <h2>What the receptionist does</h2>
      <p>
        The receptionist answers calls with an automated voice, takes messages,
        and — where you turn it on and connect a calendar — books appointments
        after the caller confirms the details. It may misunderstand a caller or
        make mistakes, so review its messages and bookings. It does not send
        text messages to callers.
      </p>

      <h2>Acceptable use of the receptionist</h2>
      <p>
        The receptionist service must be used lawfully: with any notice or
        consent your jurisdiction requires for automated call handling, honoring
        opt-out requests, and never for spam, harassment, or deceptive
        impersonation. We may suspend accounts that break these rules.
      </p>

      <h2>Usage and billing</h2>
      <p>
        Accounts include a usage allowance, shown in your dashboard, and use
        beyond it may be limited. Any charge is agreed with you before it is
        made.
      </p>

      <h2>Project work</h2>
      <p>
        Website, application, and automation projects are governed by the
        written scope agreed for that project. Unless that agreement says
        otherwise, you own the deliverables, your content, and your data.
      </p>

      <h2>Service changes and availability</h2>
      <p>
        We work to keep services available and will communicate material
        changes, but no online service is uninterrupted. Features described as
        previews or pilots may change as they mature.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, SiteMint&apos;s liability for issues
        arising from use of the website or service is limited to the amount you
        paid for the service in the preceding twelve months.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Contact us through this website and a
        person will respond.
      </p>
    </>
  );
}

export function PrivacyBody() {
  return (
    <>
      <p>
        SiteMint Digital (&quot;SiteMint&quot;, &quot;we&quot;) builds and
        operates business systems, including this website and the SiteMint AI
        Receptionist service. This policy explains what information we collect,
        why we collect it, and the choices you have.
      </p>

      <h2>Information you give us</h2>
      <p>
        When you complete a discovery brief, contact form, or service signup, we
        collect what you enter: your name, contact details, and the information
        you provide about your business and project. When you create an
        account, we record which version of these terms and this policy you
        accepted, and when. We use this information to respond to you and to
        deliver the service you requested — not to build advertising profiles.
      </p>

      <h2>Information from using our services</h2>
      <p>
        If your business uses the SiteMint AI Receptionist, the service
        processes the call information it needs to operate: the caller&apos;s
        number, what the caller says during the call, the details they give (for
        example a name, a reason for calling, or a preferred appointment time),
        call outcomes, messages, appointments, and delivery status. Speech is
        converted to text and answered by automated voice and language services
        run by our providers. Call recordings and full transcripts are not kept.
        The details the receptionist saves — messages, contacts and
        appointments — are kept in your business&apos;s account, where your
        team can see and edit them.
      </p>

      {/*
        Google Calendar disclosure. Required for Google OAuth verification of
        the three calendar scopes, and written from what the product does:
        lib/calendar/googleOAuth.ts (scopes), tokenCrypto.ts (AES-256-GCM at
        rest), calendarConnectionsRepository.ts (tokens cleared on disconnect
        or revocation).
      */}
      <h2>Google Calendar</h2>
      <p>
        A business using the SiteMint AI Receptionist can choose to connect a
        Google Calendar. When it does, SiteMint uses Google&apos;s permission to
        do three things, and nothing more:
      </p>
      <ul>
        <li>
          read the list of the account&apos;s calendars, so the business can
          choose which one receives appointments;
        </li>
        <li>
          read busy and free times on the chosen calendar, so the receptionist
          never offers a time that is already taken — the titles, descriptions
          and guests of other events are not read;
        </li>
        <li>create, move and remove only the appointment events SiteMint itself added for that business.</li>
      </ul>
      <p>
        We store the access tokens Google issues, encrypted, together with the
        chosen calendar and the identifiers of the events we created.
        Disconnecting the calendar in the dashboard deletes the stored tokens,
        and access can also be removed at any time from the Google Account
        permissions page. Information received from Google is used only to
        provide these scheduling features to the business that connected it. It
        is not sold, not used for advertising, not used to train AI models, and
        not shared except with the service providers needed to run the feature
        or where the law requires it.
      </p>
      <p>
        SiteMint&apos;s use and transfer of information received from Google
        APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Emails and messages</h2>
      <p>
        We send account emails (such as verification, password reset, team
        invitations and call summaries) to the addresses on the account. The
        receptionist does not send text messages to callers. Where our other
        systems do send text messages, replying STOP ends them and records the
        opt-out.
      </p>

      <h2>Cookies and analytics</h2>
      <p>
        This website uses only the storage needed for it to function (such as
        keeping you signed in, or saving an in-progress discovery draft in your
        browser). We do not run third-party advertising trackers.
      </p>

      <h2>Sharing</h2>
      <p>
        We do not sell personal information. We share it only with the service
        providers needed to operate our systems (such as telephony, voice and
        language processing, email delivery, and payment processing), under
        their own contractual obligations, and where the law requires it.
      </p>

      <h2>Retention and security</h2>
      <p>
        We keep information for as long as needed to provide the service and
        meet legal obligations, and we protect it with access-controlled,
        authenticated systems. Customer data in the receptionist platform is
        isolated per business account, and only the people that business
        invites can see it.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us what we hold about you, ask for a correction, or ask for
        deletion where the law provides for it. Contact us through this website
        and a person will respond.
      </p>
    </>
  );
}

import { MailWarning } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * The one place that says "this email might not arrive".
 *
 * Every surface that tells a user an email has been sent must render this
 * note underneath it. Two-factor codes, hours-verification requests and
 * application decisions all travel through ordinary mail, which school spam
 * filters routinely eat — and "I never got it" reads to the user as "the app
 * is broken". Saying it up front turns a support ticket into a spam-folder
 * check.
 *
 * `who` customises whose inbox to check: the default ("your") fits codes sent
 * to the signed-in user; pass e.g. "your coordinator's" for emails sent to a
 * third party.
 */
export default function EmailDeliveryNote({
  who = 'your',
  className,
}: {
  who?: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted font-medium',
        className,
      )}
      role="note"
    >
      <MailWarning className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
      <span>
        Email can take a few minutes to arrive and sometimes lands in{' '}
        {who} spam or junk folder — please check there if you don't see it.
      </span>
    </p>
  );
}

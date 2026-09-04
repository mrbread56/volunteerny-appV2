import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

/**
 * Who built this and why.
 *
 * Deliberately does not name the founders. Everyone who built this is a minor,
 * the site is public, and a name on a public page is not something a fifteen
 * year old can take back later. "A couple of high school students in North
 * York" carries the part that matters, which is that the people who made it
 * are the people who needed it.
 *
 * Every number here is real and checkable. Nothing claims that hours logged on
 * this site are filed with a school board, because they are not.
 */
export default function About() {
  usePageTitle('About us');

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-blue-dark/60 mb-4">
          About us
        </p>
        <h1 className="text-[2rem] sm:text-[2.5rem] font-semibold text-ink tracking-[-0.035em] leading-tight mb-6">
          We built this because we needed it
        </h1>
        <p className="text-lg leading-[1.7] text-ink-soft mb-16">
          Volunteer North York was made by a couple of high school students in
          North York, for high school students in North York. We are not a
          company and nobody is paid. The site is free, and it will stay free.
        </p>

        <div className="space-y-12 text-base leading-[1.8] text-ink-muted">
          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              Where this came from
            </h2>
            <p>
              Every high school student in Ontario has to complete 40 hours of
              community involvement before they can graduate. Between us we have
              done more than 600. What surprised us was that the volunteering
              was never the hard part. Finding it was.
            </p>
            <p className="mt-3">
              We would come across an organization we genuinely wanted to help,
              and they were not taking anyone that month. Or there was an
              opening, but it was an hour away by bus. Or it ran during school.
              Or the minimum age was 16 and we were 14. We wanted to help. We
              just could not find the door.
            </p>
            <p className="mt-3">
              We thought it might just be us, so before building anything we
              asked other students one question: is finding a place to volunteer
              one of the biggest challenges when you try to volunteer? Out of
              the first 20 students, more than 70% said yes. Twenty is a small
              number and we know it. It was enough to convince us the problem
              was worth trying to solve.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              Asking people who knew better than us
            </h2>
            <p>
              We spent months building it, and then did something that felt
              terrifying at the time. We emailed professors who had no reason at
              all to reply to a group of teenagers, and asked them to tear the
              project apart.
            </p>
            <p className="mt-3">
              Some of them wrote back. Professor Marsha Chechik at the
              University of Toronto, who holds a chair in software engineering,
              told us that what we were doing was "extremely useful," and pushed
              us on scalability, privacy and security. Professor Jeff Avery at
              the University of Waterloo went through the platform screen by
              screen and asked the questions we had never thought of, like what
              an organization is supposed to do when 200 people apply and there
              are two places.
            </p>
            <p className="mt-3">
              And a third professor at Waterloo asked the one question that
              changed the most: students prove who they are with a school email,
              but who checks the organizations? We did not have a good answer.
              That question is the reason we now review every organization by
              hand before it can post anything.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              How we think about safety
            </h2>
            <p>
              Almost everyone using this site is between 14 and 18. That changes
              what we are allowed to get wrong.
            </p>
            <p className="mt-3">
              No organization can post anything until we have reviewed it
              ourselves. Registered charities give us their charity registration
              number. For everyone else we look at the organization directly:
              its website, its address, how to reach it. Organizations are also
              required to use two step sign in, because they can see the contact
              details of students who apply to them.
            </p>
            <p className="mt-3">
              We would rather grow slowly and check everything than grow quickly
              and find out later.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              Where we are now
            </h2>
            <p>
              We have written to more than seventy organizations across Toronto,
              one at a time. Several are now on the site, among them Community
              Share Food Bank, Flemingdon Food Bank, the Tirgan Centre for Art
              and Culture and the Weston King Neighbourhood Centre.
            </p>
            <p className="mt-3">
              We are early, and we would rather say so than pretend otherwise.
              If you are a student, the honest position is that there is more
              coming than there is today. If you are an organization, the honest
              position is that we will do the work of setting your listing up
              for you, and you can take it down the moment it stops being
              useful.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              What we are not
            </h2>
            <p>
              We are not your school board and we are not affiliated with one.
              Hours confirmed on this site are confirmed by the organization you
              volunteered with, which is worth something, but your school
              decides on its own whether to count them, and you may still need
              your board's own community involvement form. We would rather tell
              you that plainly here than have you find out at the office.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              Get in touch
            </h2>
            <p>
              If you run an organization and want students, if you are a student
              and something is broken, or if you just think we have got
              something wrong, we would genuinely like to hear it.
            </p>
            <p className="mt-3">
              <a
                href="mailto:volunteernorthyorkbusiness@gmail.com"
                className="font-semibold text-blue-dark hover:underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-blue-dark focus-visible:outline-offset-2 rounded"
              >
                volunteernorthyorkbusiness@gmail.com
              </a>
            </p>
            <p className="mt-3">
              You can also send us feedback from inside the site on the{' '}
              <Link
                to="/feedback"
                className="font-semibold text-blue-dark hover:underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-blue-dark focus-visible:outline-offset-2 rounded"
              >
                feedback page
              </Link>
              , which comes straight to us.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

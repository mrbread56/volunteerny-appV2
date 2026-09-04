import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

/**
 * Who built this and why.
 *
 * Copy is the owner's, supplied verbatim. Do not rewrite it without being
 * asked: earlier drafts of this page were rejected for sounding written rather
 * than said, and this version is the one he wanted.
 *
 * Deliberately names nobody. Everyone who built this is a minor and the page
 * is public and indexable, so a name here is not something a fifteen year old
 * can take back later.
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
          Volunteer North York was started by a couple of high school students
          in North York who were having trouble finding volunteer opportunities
          ourselves. We wanted to make that process easier for other students
          going through the same thing.
        </p>

        <div className="space-y-12 text-base leading-[1.8] text-ink-muted">
          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              Where this came from
            </h2>
            <p>
              Every high school student in Ontario needs 40 hours of community
              involvement before graduating. Between us, we have completed more
              than 600 hours.
            </p>
            <p className="mt-3">
              Finding somewhere to volunteer was often harder than actually
              volunteering.
            </p>
            <p className="mt-3">
              We would find an organization we really wanted to help, only to
              discover they were not accepting volunteers that month. Sometimes
              an opportunity was an hour away by bus. Other times it was during
              school hours, or the minimum age was 16 when we were 14.
            </p>
            <p className="mt-3">
              We knew we could not be the only students dealing with this.
            </p>
            <p className="mt-3">
              Before building Volunteer North York, we asked other students
              whether finding a place to volunteer was one of the biggest
              challenges they faced. More than 70% of the first 20 students we
              asked said yes. We know 20 students is a small sample, but it was
              enough for us to think the problem was worth trying to solve.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              We asked people who knew more than we did
            </h2>
            <p>
              After spending months working on the platform, we started reaching
              out to professors and other people who could give us an outside
              perspective.
            </p>
            <p className="mt-3">
              We were honestly not sure how many people would respond. We were
              just high school students asking people with much more experience
              to look at something we had built.
            </p>
            <p className="mt-3">Some did.</p>
            <p className="mt-3">
              Professor Marsha Chechik at the University of Toronto told us the
              idea was "extremely useful" and challenged us to think more
              seriously about things like scalability, privacy and security.
            </p>
            <p className="mt-3">
              Professor Jeff Avery at the University of Waterloo went through the
              platform with us and raised questions we had not considered. One
              example was what happens if 200 students apply for an opportunity
              that only has two spots.
            </p>
            <p className="mt-3">
              Another Waterloo professor asked us a question that changed how we
              handle organizations on the platform: students can use their school
              email to help show who they are, but how do we know an
              organization is legitimate?
            </p>
            <p className="mt-3">We did not have a good answer at the time.</p>
            <p className="mt-3">
              That is one of the reasons we now review organizations ourselves
              before they can post opportunities.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              How we think about safety
            </h2>
            <p>
              Most students using Volunteer North York are between 14 and 18, so
              we take the organizations on the platform seriously.
            </p>
            <p className="mt-3">
              Organizations cannot post opportunities until we have reviewed
              them. Registered charities provide their charity registration
              number. For other organizations, we look at things such as their
              website, address and contact information.
            </p>
            <p className="mt-3">
              Organizations are also required to use two-step sign-in because
              they may receive contact information from students who apply to
              their opportunities.
            </p>
            <p className="mt-3">
              We would rather take a little longer to review an organization
              than let something questionable onto the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink tracking-[-0.02em] mb-3">
              Get in touch
            </h2>
            <p>
              We are still early in this project, and we want to be upfront
              about that.
            </p>
            <p className="mt-3">
              There is still a lot we want to improve and add. If you are a
              student, you may not find everything you are looking for yet. If
              you are an organization, we are happy to help set up your listing
              and make changes if something is not working for you.
            </p>
            <p className="mt-3">
              If you run an organization and want to work with students, if you
              are a student and something is not working, or if you have an idea
              for how we can make Volunteer North York better, we would like to
              hear from you.
            </p>
            <p className="mt-4">
              <a
                href="mailto:volunteernorthyorkbusiness@gmail.com"
                className="font-semibold text-blue-dark hover:underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-blue-dark focus-visible:outline-offset-2 rounded"
              >
                volunteernorthyorkbusiness@gmail.com
              </a>
            </p>
            <p className="mt-3">
              You can also send feedback through the{' '}
              <Link
                to="/feedback"
                className="font-semibold text-blue-dark hover:underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-blue-dark focus-visible:outline-offset-2 rounded"
              >
                feedback page
              </Link>{' '}
              inside the site. It comes directly to us.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

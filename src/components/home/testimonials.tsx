import { Quote } from "lucide-react"

import { Section } from "@/components/site/section"
import { testimonials, type Testimonial } from "@/lib/site"

function Attribution({ initials, name, location }: Testimonial) {
  return (
    <figcaption className="mt-5 flex items-center gap-3">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full border border-primary-200 bg-white font-heading text-xs font-semibold text-primary-700">
        {initials}
      </span>
      <span>
        <span className="block text-sm font-semibold text-secondary-900">{name}</span>
        <span className="block text-xs leading-relaxed text-secondary-600">{location}</span>
      </span>
    </figcaption>
  )
}

export function Testimonials() {
  const [lead, ...otherQuotes] = testimonials

  return (
    <Section id="testimonials" aria-labelledby="testimonials-title" className="bg-secondary-50">
      <h2 id="testimonials-title" className="text-4xl leading-[1.05] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl xl:text-6xl">
        In their own <span className="font-serif font-normal text-primary-600 italic">words.</span>
      </h2>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.18fr_1fr] lg:gap-10">
        <figure className="flex flex-col justify-between rounded-2xl border border-primary-200 bg-linear-to-br from-white to-primary-100 p-6 sm:p-9">
          <div>
            <Quote aria-hidden strokeWidth={1.5} className="mb-5 size-9 text-primary-600" />
            <blockquote className="max-w-2xl font-serif text-[1.65rem] leading-[1.25] text-pretty text-secondary-900 sm:text-[2.1rem]">
              {lead.quote}
            </blockquote>
          </div>
          <Attribution {...lead} />
        </figure>

        <div className="divide-y divide-secondary-200 border-y border-secondary-200">
          {otherQuotes.map((testimonial) => (
            <figure key={testimonial.name} className="py-6">
              <blockquote className="leading-relaxed text-pretty text-secondary-700">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <Attribution {...testimonial} />
            </figure>
          ))}
        </div>
      </div>
      <p className="mt-4 text-sm text-secondary-600">Individual experiences vary.</p>
    </Section>
  )
}

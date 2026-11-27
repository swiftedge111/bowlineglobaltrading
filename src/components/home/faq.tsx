"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, Search } from "lucide-react"

import { Section } from "@/components/site/section"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { faqs, faqTopics, supportContact } from "@/lib/site"
import { cn } from "@/lib/utils"

const topics = ["All questions", ...faqTopics] as const

export function Faq() {
  const [topic, setTopic] = useState<(typeof topics)[number]>("All questions")
  const [query, setQuery] = useState("")
  const searchInput = useRef<HTMLInputElement>(null)
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const isFiltered = topic !== "All questions" || words.length > 0
  const results = faqs.filter(({ question, answer, topic: itemTopic }) => {
    const text = `${question} ${answer}`.toLowerCase()
    return (topic === "All questions" || topic === itemTopic) && words.every((word) => text.includes(word))
  })

  return (
    <Section
      id="faq"
      aria-labelledby="faq-title"
      className="bg-white"
      innerClassName="grid gap-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12 xl:gap-20"
    >
      <div className="lg:sticky lg:top-28 lg:self-start">
        <h2 id="faq-title" className="text-4xl leading-[1.05] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl xl:text-6xl">
          Questions, <span className="inline-block font-serif font-normal text-primary-600 italic">answered.</span>
        </h2>

        <div className="mt-6 rounded-2xl border border-secondary-200 bg-secondary-50 p-4 sm:p-5">
          <div role="search" aria-label="Frequently asked questions">
            <label htmlFor="faq-search" className="sr-only">Search questions</label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-primary-700" />
              <input
                id="faq-search"
                ref={searchInput}
                type="search"
                placeholder="Search questions"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-12 w-full rounded-xl border border-secondary-300 bg-white pr-3 pl-11 text-base text-secondary-900 placeholder:text-secondary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
              />
            </div>
          </div>

          <div role="group" aria-label="FAQ topics" className="mt-3 flex flex-wrap gap-1.5">
            {topics.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === topic}
                aria-controls="faq-results"
                onClick={() => setTopic(option)}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-sm leading-snug font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700",
                  option === topic
                    ? "border-primary-700 bg-primary-700 text-white"
                    : "border-secondary-200 bg-white text-secondary-700 hover:border-primary-300 hover:text-primary-700"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {supportContact && (
          <p className="mt-4 text-sm text-secondary-600">
            Still have a question?{" "}
            <a href={supportContact.href} className="font-semibold text-primary-700 underline underline-offset-4">
              {supportContact.label}
            </a>
          </p>
        )}
      </div>

      <div id="faq-results" className="min-w-0">
        <p role="status" className={isFiltered ? "mb-2 text-sm text-secondary-600" : "sr-only"}>
          {results.length} {results.length === 1 ? "question" : "questions"}
        </p>
        {results.length > 0 ? (
          <Accordion type="single" collapsible className="border-t border-secondary-200">
            {results.map((faq) => (
              <AccordionItem
                key={faq.question}
                value={faq.question}
                className="rounded-none border-x-0 border-t-0 border-b border-secondary-200 data-[state=open]:border-primary-200 data-[state=open]:bg-primary-50 data-[state=open]:shadow-none"
              >
                <AccordionTrigger className="min-h-16 px-3 focus-visible:ring-inset sm:px-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="px-3 text-sm sm:px-5 sm:text-base">
                  <p>{faq.answer}</p>
                  {faq.link && (
                    <Link href={faq.link.href} className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary-700 underline underline-offset-4">
                      {faq.link.label} <ArrowRight aria-hidden className="size-4 shrink-0" />
                    </Link>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="rounded-2xl border border-secondary-200 bg-secondary-50 p-5 sm:p-7">
            <h3 className="text-lg font-semibold text-secondary-900">No matching questions</h3>
            <p className="mt-2 text-sm text-secondary-600">Try another search or browse all questions.</p>
            <button
              type="button"
              onClick={() => {
                setTopic("All questions")
                setQuery("")
                searchInput.current?.focus()
              }}
              className="mt-2 min-h-11 text-sm font-semibold text-primary-700 underline underline-offset-4"
            >
              Reset search and topics
            </button>
          </div>
        )}
      </div>
    </Section>
  )
}

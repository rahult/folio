# Thinking techniques with evidence, and what Folio could do with them

A survey of what cognitive and decision science actually knows about making people better
readers, critical thinkers, and deciders, done to answer one question: which of it can
become a concrete, local, deterministic (or optionally agent-assisted) feature in Folio,
matching the same discipline the market survey applied to editors — primary sources,
strength-of-evidence labels, and effort-scoped feature sketches rather than roadmap
promises. Citation style matches
[docs/research/2026-09-11-markdown-editor-landscape.md](2026-09-11-markdown-editor-landscape.md):
inline Markdown links, `([Source name](url))`.

## Framing

"A better reader / thinker / decider" is used here operationally, not as self-improvement
rhetoric. A person reads better when they retain more of what they read after the tab
closes, notice when they've stopped understanding, and can reconstruct the argument in
their own words. They think more critically when they can name a claim's warrant, generate
a case against their own conclusion, and tell strong evidence from a plausible-sounding
assertion. They decide better when their stated confidence matches their actual hit rate,
when they've considered at least one alternative before committing, and when a later
review of the decision can tell whether the *process* was sound independent of whether the
outcome was lucky. They build better mental models when a new concept survives being
explained without the source text in front of them, and when they can place it correctly
relative to what they already know.

None of that is a claim that a document tool makes anyone smarter. Software cannot install
capacities a person doesn't have, cannot verify that a decision worked out in the world, and
cannot make someone engage who has decided not to. What a document tool *can* plausibly do,
per the evidence below, is narrower and more mechanical: prompt specific behaviors shown to
work at the moment they're useful (asking someone to retrieve before re-reading, asking for
a written prediction before a verdict), structure the record of what a person did and
concluded so it's inspectable and revisable later (a takeaway, a decision log, a calibration
history), and surface friction that a fluent read hides (an unexplained inference, a claim
with no stated warrant, a false sense of having understood). Read stage does the first,
Decide stage the second, and Interrogate — the not-yet-designed agent-analysis stage — is
mostly a way to manufacture the third without the human having to generate the friction
themselves, which the sourcing below treats as a double-edged tool rather than a
straightforward win: several of the techniques that most reliably build understanding
(retrieval, self-explanation, generating one's own predictions) work *because* the human
does the cognitive work, and an agent that pre-digests the document for them can remove the
exact difficulty that made the technique effective. That tension is why the "bad
implementation to avoid" column in the shortlist below repeats "the agent writes the
takeaway" as a specific failure mode.

## 1. Reading and comprehension

### Retrieval practice / self-testing

**Evidence: strong.** Recalling information from memory, rather than re-exposing yourself to
it, produces durably better long-term retention than re-reading, and the effect reverses the
learner's own intuition: in Roediger & Karpicke's classic study, students who read a passage
once and then practiced free recall (no feedback) retained 61% of it a week later, versus
40% for students who re-read the passage four times, even though the re-readers were more
confident they'd remember it ([Roediger & Karpicke 2006, "Test-Enhanced
Learning"](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x)). Dunlosky et
al.'s meta-review of ten learning techniques rated practice testing "high utility," the top
tier alongside distributed practice, based on evidence across ages, materials, and delays
([Dunlosky, Rawson, Marsh, Nathan & Willingham 2013, "Improving Students' Learning With
Effective Learning Techniques," *Psychological Science in the Public
Interest*](https://journals.sagepub.com/doi/10.1177/1529100612453266); summary at
[psychologicalscience.org](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html)).

**Mechanism:** retrieval is not a neutral read of memory, it's an act that strengthens the
retrieved trace and the cues that led to it (the same generation effect Robinson's SQ3R
anticipated by three decades — see below). It also gives the learner accurate feedback on
what they don't yet know, which re-reading doesn't: re-reading fluency is easily mistaken for
comprehension.

**Folio feature sketch:** deterministic and local. The Outline tab already has section
boundaries and reading times; a "recall check" affordance per section — collapse the
section, show a blank text box with the prompt "what did this section say, in your own
words, before you look again" — needs no model, just the outline machinery Folio already
has. The recall text itself is disposable (not graded, nothing to get wrong); its only
purpose is to force retrieval before re-exposure. Writing nothing and clicking through is a
legitimate, low-friction opt-out — this must never gate navigation or nag. Could log
"recalled: yes/no" per section into `<doc>.decision.md` alongside the takeaway, but even
that is optional telemetry a user would need to opt into, not a default.

### Spacing / distributed practice

**Evidence: strong.** Cepeda, Pashler, Vul, Wixted & Rohrer's meta-analysis of 839
assessments across 317 experiments found that distributing study across time reliably beats
massing it, with the optimal gap between study and review scaling with how long you need to
remember it — cramming for a test next week helps that test and nothing else, while a gap of
days to weeks pays off for retention over months ([Cepeda, Pashler, Vul, Wixted & Rohrer
2006, "Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis,"
*Psychological Bulletin*](https://www.yorku.ca/ncepeda/publications/CPVWR2006.html)).
Dunlosky et al. rated distributed practice "high utility," the other top-tier technique
alongside testing ([Dunlosky et al.
2013](https://journals.sagepub.com/doi/10.1177/1529100612453266)). Spacing and retrieval are
also the canonical examples of Bjork & Bjork's "desirable difficulties" — conditions that
slow or impair performance during learning but improve long-term retention, as opposed to
conditions (like massed practice) that make learning feel easy in the moment and evaporate
later ([Bjork & Bjork 2020, "Desirable Difficulties in Theory and
Practice"](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2021/01/RABjorkELBjorkJARMAC2020ForPostingSingleSpaced.pdf)).
The Bjorks are explicit that a difficulty is only desirable if the learner has enough
background to overcome it — spacing a beginner too far apart just produces forgetting, not
learning.

**Mechanism:** each re-encounter after partial forgetting forces retrieval rather than
recognition, and studying material that's become slightly unfamiliar recruits more
elaborative processing than studying something still fresh in working memory.

**Folio feature sketch:** this is the one technique in this document that fits a document
*reader* awkwardly, since Folio's unit is a single document read start to finish, not a
deck of items to be reviewed on a schedule. The honest sketch is narrow: for documents
revisited across multiple review rounds (Folio's actual repeat-read case — an agent-written
plan you re-open after revisions), the reading panel could show "last read: 4 days ago,
last takeaway: …" pulled from `<doc>.decision.md`'s existing timestamp, which nudges a
spaced re-read without scheduling anything. A full spaced-repetition system (flashcards from
document content, review queues) is out of Folio's shape — that's Anki's job, not a
Markdown reader's — and would be the "bad implementation to avoid" for this technique: don't
bolt on an SRS.

### Self-explanation

**Evidence: strong.** Chi, Bassok, Lewis, Reimann & Glaser's foundational study found that
students who spontaneously generated more self-explanations while studying worked examples
learned physics mechanics problems better, and that poor performers under-explained and
mis-monitored their own understanding ([Chi, Bassok, Lewis, Reimann & Glaser 1989,
"Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems,"
*Cognitive Science*](https://onlinelibrary.wiley.com/doi/abs/10.1207/s15516709cog1302_1)).
Chi's later theoretical treatment frames self-explanation as a dual process: generating
inferences to fill gaps in the text, and repairing or revising your existing mental model
when the inferences don't fit it — the mechanism, not just the correlation ([Chi 2000,
"Self-Explaining Expository Texts: The Dual Processes of Generating Inferences and Repairing
Mental
Models"](https://education.asu.edu/lcl/publications/chi-m-t-h-2000-self-explaining-expository-texts-dual-processes-generating-0)).
A 2018 meta-analysis of *induced* (not spontaneous) self-explanation training across 69
studies found a moderate positive effect on learning outcomes, confirming the effect
generalizes beyond people who do it naturally ([Bisra et al. 2018, "Inducing
Self-Explanation: A Meta-Analysis," *Educational Psychology
Review*](https://link.springer.com/article/10.1007/s10648-018-9434-x)).

**Mechanism:** explaining forces the reader to make implicit connections explicit, exposing
gaps between the text and their existing knowledge that silent reading glides over.

**Folio feature sketch:** deterministic, local, and the direct ancestor of the existing
takeaway field. `writeTakeaway` already asks "what did you take from it" once, at the end;
self-explanation research argues for asking narrower versions of the same question *during*
the read, one prompt per section rather than one for the whole document — mechanically the
same feature as the retrieval-practice sketch above, reusing the outline's section
boundaries and `<doc>.decision.md`'s existing append pattern. No model needed: the value is
entirely in the human writing the sentence, not in anything analyzing it.

### SQ3R and its evidence gap

**Evidence: weak/mixed, historically important.** Francis Robinson's Survey-Question-Read-
Recite-Review method, developed for soldiers working through technical material in WWII and
published in *Effective Study*, anticipated the testing effect and the generation effect by
about thirty years — "recite" is retrieval practice and "question" is generation, both
avant la lettre ([Robinson 1946, *Effective Study*; overview at
[Wikipedia](https://en.wikipedia.org/wiki/SQ3R)). The trouble is that SQ3R as a *whole
bundled procedure* has never had the kind of large controlled-trial evidence base that
retrieval practice and spacing individually now have — later component analysis (e.g.
McDaniel et al. 2009) found that the benefit concentrates in the recite (retrieval) and
question (generation) steps, not in survey or review, meaning the acronym packages one
well-evidenced technique with several inert ones ([overview of SQ3R evidence and component
studies](https://www.researchgate.net/publication/400600826_The_Effectiveness_of_Survey_Question_Read_Recite_and_Review_SQ3R_Technique_to_Increase_Students'_Reading_Comprehension)).
Studies specifically testing SQ3R against comparison conditions are smaller, less
controlled, and less replicated than the retrieval-practice and spacing literatures.

**Folio feature sketch:** don't implement SQ3R as a named ritual. Its two evidence-backed
components are already covered above as retrieval practice (recite) and, partially, by the
outline-as-preview (survey) Folio ships today. Naming a feature "SQ3R" would import three
components (survey, read, review) riding on the credibility of one (recite) that's actually
tested — exactly the kind of bundling this document's Traps section flags.

### Comprehension monitoring

**Evidence: strong for the underlying skill, moderate for how well it can be taught quickly.**
The National Reading Panel identifies comprehension monitoring — noticing when you've stopped
understanding and knowing what to do about it — as one of the core strategies that separates
skilled from unskilled readers, alongside question generation and summarization ([overview at
Reading
Rockets](https://www.readingrockets.org/topics/comprehension/articles/instruction-metacognitive-strategies-enhances-reading-comprehension)).
Pressley & Afflerbach's synthesis of decades of think-aloud protocol studies of skilled adult
readers found that good readers are "constructively responsive": continuously predicting,
questioning, evaluating, and repairing their understanding as they go, rather than passively
decoding ([Pressley & Afflerbach 1995, *Verbal Protocols of Reading: The Nature of
Constructively Responsive Reading*](https://eric.ed.gov/?id=ED379618)). Eye-movement studies
of comprehension monitoring confirm it's measurable and distinct from raw decoding speed
([overview](https://escholarship.org/uc/item/59s9872k)). The caveat: teaching monitoring as a
skill that transfers is a longer, more scaffolded intervention than a single UI nudge — a
recent large study found the predictive value of self-reported metacognitive strategy use
varies substantially across educational contexts, meaning "ask people if they're monitoring"
is not the same as making them better monitors ([Springer 2025, cross-context evaluation of
metacognitive reading
strategies](https://link.springer.com/article/10.1186/s40536-025-00240-3)).

**Mechanism:** monitoring catches comprehension failures at the point they happen, when
repair (re-reading the confusing bit, looking up a term) is cheap, instead of after the
reader has moved on and built further understanding on a broken foundation.

**Folio feature sketch:** deterministic. A lightweight per-section "did this make sense"
control in the Outline tab — not a quiz, just a binary the reader sets themselves, visible
next to the reading-time figure — turns an invisible internal process into something the
reading panel can show back to the reader as a map of where they actually got lost, which
the takeaway then has to reckon with. Because self-report of monitoring is a weaker signal
than actual retrieval, this should be framed as a note-to-self, not a metric Folio judges
the reader on.

### Social/collaborative annotation

**Evidence: moderate, mixed by implementation.** A frequently cited 2012 meta-analysis found
social annotation activities are associated with learning gains, improved critical thinking,
metacognitive skill, and reading comprehension across higher-education studies (cited via
[Frontiers in Education
2024](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1257747/full)).
A controlled comparison of individual versus team annotation on reading comprehension,
critical thinking, and metacognition found team annotation produced measurable gains over
individual annotation on several outcomes ([Yang, Zhang, Su & Tsai/related study,
"Individual and team annotation effects on students' reading comprehension, critical
thinking, and meta-cognitive
skills"](https://www.sciencedirect.com/science/article/abs/pii/S0747563210001524)). A newer
study combining a close-reading method with Hypothes.is-style collaborative annotation
reports improved critical reading of primary scientific literature in a graduate course
([Frontiers in Education 2024, CERIC
method](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1257747/full)).
The mechanism is fairly specific — a second reader's comment prompts re-engagement with a
passage the first reader might have glided past — and the evidence is mostly from classroom
settings with instructor-designed annotation prompts, not unstructured public commenting,
which is a real limit on how far it generalizes to Folio's single-reviewer-plus-agent case.

**Mechanism:** annotation forces production (writing a comment is a retrieval/self-
explanation act) and a second party's annotations act as an external monitor, flagging
passages the first reader read too fluently to notice were unclear.

**Folio feature sketch:** Folio already has the annotation vocabulary (comment, suggest,
delete, approve) from Review Mode, built for a human-agent loop rather than human-human, and
the reading-panel Annotations tab already exists as the second tab alongside Outline. The
evidence above is about a second *reader*, not a second *writer* — its closest fit in
Folio's model is a doc reviewed by more than one human sequentially (a plan two people each
review with Folio, feedback files diffed), which is a bigger scope change (multi-reviewer
identity, merged feedback files) than a small feature; flag as an idea, not a near-term
sketch, and note it needs no agent — it's purely about giving Folio's existing annotation
data a second author.

### Readability metrics and their limits

**Evidence: the formulas are well-defined; their validity as comprehension proxies is
weak/contested.** Rudolf Flesch's Reading Ease formula, from sentence length and syllables
per word, was the original readability yardstick ([Flesch 1948, "A New Readability
Yardstick," *Journal of Applied
Psychology*](https://readabilityformulas.com/learn-about-the-flesch-reading-ease-formula/)),
and Flesch-Kincaid Grade Level is its descendant, used ubiquitously in writing tools
including Hemingway Editor (which the market-landscape doc already covers as Folio's
reference design for readability signals). But a substantial methodological literature finds
the formulas correlate poorly with actual comprehension: a review of readability formulas
used to assess health information found no reliable correlation between formula scores and
human judgments of difficulty, and identified that the formulas ignore document layout,
reader prior knowledge, motivation, and writing quality entirely, scoring only surface
syllable-and-sentence-length counts ([Wang, Liu et al., "Assessing reading levels of health
information: uses and limitations of the Flesch
formula"](https://pubmed.ncbi.nlm.nih.gov/28707643/)). This is a load-bearing caveat for any
Folio feature that surfaces a grade-level number: it measures surface sentence mechanics,
not whether the reader will actually understand the document.

**Mechanism (of the formula, not of comprehension):** longer sentences and longer words
correlate weakly with harder text at a population level, which is why the formulas are
useful as a coarse, deterministic proxy for prose density — and exactly why they shouldn't
be presented as a comprehension score.

**Folio feature sketch:** deterministic, cheap, already scoped in the market-landscape doc's
"ideas Folio could own" list as a Hemingway-style per-section grade-level plus long-sentence
highlight in the reading panel. The addition this research makes concrete: label it
explicitly as a *prose-density* signal, not a comprehension or quality score, in the UI copy
itself — "grade 11 sentence complexity," never "readability" or "clarity" unqualified — so
the tool doesn't quietly overclaim what a syllable count can tell a reviewer of agent output.

### Construction-integration and schema-building

**Evidence: strong as a descriptive model, foundational rather than an "intervention."**
Kintsch's construction-integration model describes comprehension as two interacting phases:
construction, where the reader builds a loose network of propositions from the text plus
whatever background knowledge activates, and integration, where that network is pruned and
organized into a coherent structure, suppressing what turned out irrelevant and
strengthening what connects ([Kintsch 1988, "The Role of Knowledge in Discourse
Comprehension: A Construction-Integration
Model,"](https://pubmed.ncbi.nlm.nih.gov/3375398/) *Psychological Review*). It's not a
technique a person performs, it's the theory that explains *why* the techniques above
work — self-explanation supplies the connections integration needs, prior knowledge
determines what gets constructed in the first place, and a document with clear structure
(headings, signaling — see Mayer below) gives the constructive phase less irrelevant material
to prune.

**Folio feature sketch:** not directly implementable — it's the theoretical grounding for
why outline-based navigation, section-scoped takeaways, and self-explanation prompts are the
right shape of feature rather than, say, a single end-of-document quiz. Worth citing in
Folio's own design docs when justifying the section-scoped (not whole-document) shape of the
Read stage's takeaway and any future recall/monitoring features.

### Multimedia and signaling principles

**Evidence: strong, from one of the most replicated research programs in instructional
design.** Mayer's coherence principle — excluding extraneous material improves learning —
held across 23 of 23 experimental tests with a median effect size of 0.86; the signaling
principle — cueing the organization of essential material — and the redundancy principle —
narration plus matching on-screen text hurts more than it helps, versus narration with
non-redundant text — are similarly well-replicated across Mayer's program ([Mayer & Fiorella,
"Principles for Reducing Extraneous Processing in Multimedia Learning: Coherence, Signaling,
Redundancy, Spatial Contiguity, and Temporal Contiguity
Principles"](https://www.researchgate.net/publication/262915119_Principles_for_reducing_extraneous_processing_in_multimedia_learning_Coherence_signaling_redundancy_spatial_contiguity_and_temporal_contiguity_principles),
synthesizing [Mayer 2001/2009, *Multimedia
Learning*](https://www.jsu.edu/online/faculty/cognitive-theory-of-multimedia-learning.html)).

**Mechanism:** working memory is limited; extraneous material and redundant channels compete
for the same limited capacity as the material that actually matters, and signaling (bolding,
headers, explicit transitions) spends a small amount of that capacity to save a much larger
amount by pre-organizing what the reader has to hold in mind.

**Folio feature sketch:** this mostly validates decisions Folio has already made rather than
suggesting a new one — clean WYSIWYG rendering over a cluttered source view *is* coherence
and signaling applied to a document reader, and it's the argument for keeping section
headers, the outline's nesting, and the current-section highlight rather than a flatter
design. The concrete unbuilt piece: agent-authored documents are exactly where extraneous
material (boilerplate caveats, repeated context, redundant restatement of the same point in
prose and then in a bullet list) tends to accumulate, so a deterministic "redundancy"
scan — flagging near-duplicate sentences across the document, no model required, just
string-similarity — would be a Mayer-grounded reading aid specific to reviewing agent
prose. Effort and scope are closer to the readability-metric sketch above than to a new
subsystem.

## 2. Critical thinking and argument evaluation

### Toulmin argument structure

**Evidence: strong as pedagogical practice, not an empirical claim of its own.** Stephen
Toulmin's model breaks an argument into claim, grounds/data, warrant (the license connecting
grounds to claim), backing, qualifier, and rebuttal, and has been the dominant framework in
American critical-thinking and composition pedagogy since its introduction ([Toulmin 1958,
*The Uses of Argument*; overview and pedagogical adaptation at [Argument-Centered
Education](https://argumentcenterededucation.com/2019/07/17/our-adaptation-of-the-toulmin-model-of-argument/)
and a teaching summary at [Let's Get
Writing!](https://viva.pressbooks.pub/letsgetwriting/chapter/the-toulmin-argument-model/)).
Toulmin's own project was philosophical (arguing formal logic doesn't describe how real
arguments work), not an experimental claim that using the model improves reasoning; its
standing as a technique rests on decades of adoption in composition and debate curricula and
on being the explicit skeleton most argument-mapping tools (below) render onto.

**Mechanism:** naming "warrant" as a separate, often-unstated element forces the question "why
does this evidence support this claim" instead of letting an argument's rhetorical
confidence substitute for its logical structure — most weak arguments fail at the warrant,
not the grounds.

**Folio feature sketch:** the natural home is Review Mode's existing annotation vocabulary.
A fifth annotation kind — `w` "warrant?" — flags a passage where a claim rests on an
unstated inferential leap, alongside the existing comment/suggest/delete/approve, exported
into `<doc>.feedback.md` the same way. This is squarely deterministic *if* the human is
marking the warrant gaps themselves (a reading discipline, like the existing review
annotations); an agent auto-flagging "missing warrants" is a much bigger ask (real argument
parsing) and belongs to the Interrogate stage, not this one — see the argument-mapping
sketch below for where that heavier version fits.

### Argument mapping

**Evidence: moderate-to-strong, one of the better-controlled findings in this document.**
Van Gelder, Bissett & Cumming's 2004 study of a semester-long argument-mapping-centred
critical thinking course found gains on the California Critical Thinking Skills Test of
around 20%, an effect size of about 0.87, larger than the roughly 0.11 a semester of
university study alone produces; van Gelder's later chapter reports this and a work-in-progress
meta-analysis of argument-mapping instruction with a pooled effect size around 0.7, while
noting many contributing studies are unpublished and the mechanism is little studied ([van
Gelder 2015, "Using Argument Mapping to Improve Critical Thinking Skills," in *The Palgrave
Handbook of Critical Thinking in Higher Education*, reporting van Gelder, Bissett & Cumming
2004, *Canadian Journal of Experimental Psychology* 58:142–152](https://doi.org/10.1057/9781137378057_12)).
Alvarez's 2007 University of Melbourne thesis, the meta-analysis of one-semester
critical-thinking gains that van Gelder draws on, is not available online; its per-condition
figures are cited here only as reported in that chapter. An independent Irish study (Dwyer,
Hogan & Stewart) evaluated argument mapping against a conventional critical-thinking course
in an e-learning setting with first-year students ([thesis
PDF](https://researchrepository.universityofgalway.ie/server/api/core/bitstreams/4034a5fa-43a2-4fb3-b889-847ee48dbb60/content)).
Purpose-built tools exist across a spectrum: Kialo for collaborative public/classroom
debate-tree mapping ([Kialo Edu
research](https://www.kialo-edu.com/research)), Rationale for guided individual argument
construction, and Argdown, a Markdown-inspired plain-text syntax for argument maps aimed at
solo authoring and version control ([overview of argument-mapping
tools](https://link.springer.com/chapter/10.1007/978-3-031-36033-6_6); [Argunet, an
open-source mapper](http://www.argunet.org/)).

**Mechanism:** externalizing an argument's structure as a diagram makes gaps and unsupported
leaps visually obvious in a way linear prose hides, and *building* the map (not just reading
one) is the part the evidence ties to the learning gain — passive map-reading has weaker
effects than active map construction.

**Folio feature sketch:** the meaningful version of this for Folio is text-native, following
Argdown's model rather than a separate diagramming canvas: a lightweight convention for
marking claim/grounds/warrant relationships inline in the Markdown (or in a companion
`<doc>.argmap.md`), rendered by the reading panel as a collapsible tree in a new tab. This is
deterministic if the human authors the structure (the evidence is specifically about
active construction, so an agent auto-generating the map would likely forfeit the effect);
an agent-assisted *first draft* of a map from an agent-written document, for the human to
correct rather than build from scratch, is a plausible Interrogate-stage feature but a
distinctly weaker version of what the evidence actually measured. Effort: L — this is a new
document model and rendering surface, not a small addition.

## 3. Decision-making and judgement

### When to trust intuition vs. deliberate (Kahneman & Klein)

**Evidence: strong, as an adversarial-collaboration synthesis of two previously opposed
research programs.** Kahneman (heuristics-and-biases) and Klein (naturalistic decision
making) jointly concluded that whether an intuitive judgment should be trusted depends on two
conditions: whether the environment has enough regularity to be learnable, and whether the
person has had enough practice with valid feedback to have learned those regularities — a
chess grandmaster's or firefighter's intuition is trustworthy because both conditions hold; a
stock picker's or political forecaster's intuition, in a noisier, less feedback-rich
environment, is not ([Kahneman & Klein 2009, "Conditions for Intuitive Expertise: A Failure
to Disagree," *American Psychologist*](https://pubmed.ncbi.nlm.nih.gov/19739881/)).

**Mechanism:** skilled intuition is pattern recognition trained by many trials with clear,
timely feedback; without that training loop, "intuition" is often just an unexamined guess
dressed in confidence.

**Folio feature sketch:** not a UI feature directly — it's the theoretical case for why
Folio's Decide stage should distinguish decisions by domain (a call in a domain the reviewer
has deep, feedback-rich experience in vs. a novel one) rather than applying one uniform
"write your reasoning" ritual to everything. Concretely, a decision-log entry could carry an
optional self-rated field — "have I made calls like this before and found out how they
turned out?" — that flags whether the calibration/premortem techniques below are worth the
extra friction for this particular decision. Deterministic; no agent needed.

### Premortems

**Evidence: moderate — a well-argued applied technique built on established prospective
hindsight research, HBR-published rather than peer-reviewed itself.** Gary Klein's premortem
has the team imagine the project has already failed and write down why, before the plan is
finalized, on the logic that framing critique as retrospective ("what went wrong") rather
than prospective ("what could go wrong") makes it socially safer to voice doubts and
cognitively easier to generate specific failure modes than open-ended risk brainstorming
([Klein 2007, "Performing a Project Premortem," *Harvard Business
Review*](https://hbr.org/2007/09/performing-a-project-premortem)). It draws on earlier
research on prospective hindsight (imagining an outcome as certain increases the ability to
correctly identify its causes), which is the underlying experimental result; the premortem
article itself is a practitioner write-up applying that finding, not a controlled trial of
the premortem procedure as a whole.

**Mechanism:** "assume it failed, explain why" reframes a hard, ego-threatening prediction
task ("what's wrong with my plan") into an easier narrative task ("account for a known
outcome"), and grants social permission for dissent that direct criticism doesn't.

**Folio feature sketch:** fits the Decide stage cleanly and is one of the more concrete
sketches in this document. Before a verdict is finalized in Review Mode (or as a distinct
prompt when opening the Decide tab), an optional "premortem" field — "imagine you approved
this and it went badly; why?" — writes into a new section of `<doc>.decision.md`, following
the same append-a-section pattern `writeTakeaway` already uses. Purely a text prompt the
human answers; deterministic, no agent, and empty answers should be allowed exactly like the
takeaway field today.

### Decision journals

**Evidence: weak/popular for the specific artifact, moderate for the underlying principle it
operationalizes.** The decision-journal template most commonly cited (situation, decision,
expected outcome, confidence, key factors, alternatives considered, later review) is Shane
Parrish's Farnam Street template, explicitly built on Kahneman's calibration research but
itself a blog/practitioner artifact rather than a studied intervention with its own trial
data ([Farnam Street decision journal
template](https://readcrucible.com/articles/decision-journals-the-practice-the-science-the-templates);
[fs.blog/dj referenced via Parrish
interview](https://fs.blog/shane-parrish-mental-models/)). Annie Duke's *Thinking in Bets*
popularized the same idea (separating decision quality from outcome quality, "resulting"),
and is explicitly a popular decision-science book, not a research monograph — notably, Duke
herself has said in interviews she doesn't personally keep a decision journal, preferring to
reason through decisions in conversation, which is worth flagging as a caveat on the
technique's own most visible advocate ([Duke's stated practice, reported via Christopher
Wink's summary of the
book](https://blog.christopherwink.com/2022/07/31/thinking-in-bets-decision-annie-duke/);
[*Thinking in Bets*, Portfolio,
2018](https://www.penguinrandomhouse.com/books/552885/thinking-in-bets-by-annie-duke/)). The
underlying principle — writing a prediction down before you know the outcome, so you can
later compare prediction to result without hindsight bias rewriting your memory of what you
expected — is the same mechanism calibration training (below) relies on and has much
stronger backing than the journal-as-artifact does on its own.

**Mechanism:** hindsight bias silently rewrites remembered predictions to match known
outcomes; a timestamped, unfalsifiable written record is the only defense against your own
memory doing that.

**Folio feature sketch:** this is close to a direct extension of `<doc>.decision.md` as
already spec'd — the Read stage doc explicitly names "options, choice, confidence, outcome,
revisit" as the Decide stage's planned fields. The evidence above argues for two specific,
concrete additions beyond a free-text choice: a numeric or coarse confidence rating recorded
*at decision time*, and a separate, later "revisit" entry that's appended, not edited in
place, so the original prediction stays intact for comparison — exactly the failure mode
hindsight bias produces if the confidence field is editable after the fact. Deterministic,
local, no agent required; the file format is the whole feature.

### Reversible vs. irreversible framing

**Evidence: weak/popular-business-source, but a clean, low-cost framing with an intuitive
mechanism.** Jeff Bezos's distinction between Type 1 ("one-way door") decisions, which are
hard or costly to reverse and warrant slow, careful, consultative process, and Type 2
("two-way door") decisions, which are reversible and should be made quickly by an individual
or small group, first appeared in his 1997 shareholder letter and was elaborated in the 2015
letter's warning that organizations tend to apply heavyweight Type-1 process to Type-2
decisions by default, producing "slowness, unthoughtful risk aversion" ([Amazon shareholder
letters, official archive](https://www.aboutamazon.com/about-us/shareholder-letters)). This
is a CEO's stated operating principle, not a studied intervention — there's no controlled
comparison of teams using the framing versus not — but the underlying logic (spend
deliberation budget in proportion to a decision's reversibility) is consistent with rational
decision theory even without a dedicated empirical literature of its own.

**Mechanism:** most process failures in decision-making are mismatches between the weight of
deliberation and the actual stakes; naming the two categories up front makes that mismatch
visible before the process starts rather than after it's wasted the time.

**Folio feature sketch:** deterministic, and cheap enough to be one of the smaller entries
in this document. A single tag on a `<doc>.decision.md` entry — "reversible" / "irreversible"
/ unset — set by the human when they record a choice, shown as a small badge in the Decide
tab. No model needed; the value is entirely in the human having to actually answer the
question, which is itself a forcing function distinct from whatever the badge displays
afterward.

### Calibration and forecasting training

**Evidence: strong for the phenomenon of trainable calibration in controlled settings,
moderate/contested for how far the trained skill transfers to real-world domains.** Douglas
Hubbard reports that roughly 80% of people can be trained to be well-calibrated on trivia
confidence intervals after a few hours of practice with immediate feedback ([overview of
Hubbard's calibration training](https://hubbardresearch.com/calibration-training/), from
*How to Measure Anything*). Separately and with a larger, better-documented evidence base,
the Good Judgment Project, led by Philip Tetlock and Barbara Mellers, found in a multi-year
IARPA-run forecasting tournament that a subset of forecasters ("superforecasters") were
reliably and substantially more accurate than average, including 30% more accurate than
intelligence analysts with access to classified information, and that their accuracy
tracked measurable calibration and active updating on new evidence ([overview of GJP
methodology and
results](https://en.wikipedia.org/wiki/The_Good_Judgment_Project); popularized in [Tetlock &
Gardner 2015, *Superforecasting: The Art and Science of
Prediction*](https://en.wikipedia.org/wiki/Superforecasting:_The_Art_and_Science_of_Prediction)).
The caveat, raised directly in a critical discussion on the Effective Altruism Forum, is that
most of the strongest calibration-training evidence is within-domain (trivia questions
predicting trivia performance); evidence that trivia-calibration training transfers to
substantively different real-world forecasting domains is thinner and less controlled
([EA Forum, "Does 'calibrated probability assessment' training
work?"](https://forum.effectivealtruism.org/posts/qFkEhW7Hn2mkJvjNv/does-calibrated-probability-assessment-training-work)).

**Mechanism:** calibration training works by giving a tight, fast feedback loop between a
stated confidence and an observed outcome — precisely the "valid feedback" condition Kahneman
& Klein identify as necessary for intuition to become trustworthy (above); it's the same
principle, operationalized as a repeatable drill.

**Folio feature sketch:** needs the decision-journal confidence field above as a
prerequisite, then adds one thing: when a decision's outcome is later recorded in the
"revisit" entry, Folio can compute — deterministically, no model needed — a running
calibration score across all of a person's decision files in a folder (of the "when you said
80% confident, how often were you right" shape), shown as a simple histogram in a Decisions
overview. This only becomes meaningful with enough recorded decisions to be a real sample,
so it should surface honestly as "not enough data yet" rather than a premature score. Purely
arithmetic over the user's own files; no network, no agent.

### Debiasing checklists

**Evidence: moderate, and explicitly modest about its own limits.** Larrick's handbook
chapter reviews the decision-bias literature and organizes debiasing strategies into
categories — training people to consider the opposite, using outside views, forcing
consideration of alternatives — while being candid that most individual debiasing
interventions have small, inconsistent effects and that changing incentives or environments
often works better than trying to train the bias away directly ([Larrick 2004, "Debiasing,"
in Koehler & Harvey (eds.), *Blackwell Handbook of Judgment and Decision
Making*](https://web.stanford.edu/~knutson/jdm/larrick04.pdf)). Soll, Milkman & Payne's HBR
piece translates this research into practitioner-facing tactics — broadening the frame
before narrowing it, actively considering the opposite, using outside-view base rates before
inside-view detail — aimed at the same set of biases ([Soll, Milkman & Payne 2015,
"Outsmart Your Own Biases," *Harvard Business
Review*](https://hbr.org/2015/05/outsmart-your-own-biases)).

**Mechanism:** most cognitive biases are fast, automatic, and invisible to the person having
them; checklists work (when they work) by inserting a deliberate, effortful pause at a
specific decision point where the bias is most likely, rather than by "training the bias
away" globally.

**Folio feature sketch:** a static, non-adaptive checklist — "have you considered the
opposite of your conclusion? what's the base rate for decisions like this? whose
incentives does this decision serve?" — attached to the Decide tab as optional prompts
before a verdict is recorded, each answer (or explicit skip) appended to
`<doc>.decision.md`. Deterministic; the risk this document's Traps section flags applies
directly here — a checklist that must be completed to proceed becomes a forced-compliance
ritual people click through without reading, which defeats the entire mechanism (the pause
has to be genuine, not gated).

### WRAP

**Evidence: weak/popular-book, synthesized from the broader decision-bias literature rather
than independently tested as a bundle.** Chip and Dan Heath's WRAP process — Widen your
options, Reality-test your assumptions, Attain distance before deciding, Prepare to be
wrong — packages four decision-bias countermeasures (narrow framing, confirmation bias,
short-term emotion, overconfidence) into one acronym aimed at a business-book audience
([Heath & Heath 2013, *Decisive*; 1-page summary at
[heathbrothers.com](https://heathbrothers.com/member-content/1-page-summary-of-the-wrap-model/)]).
Like SQ3R, WRAP is a bundle of independently-motivated techniques (several with real
backing in the debiasing literature above) wrapped in a mnemonic that hasn't itself been
tested as a unit.

**Mechanism:** each letter targets a specific documented failure mode (Larrick's debiasing
categories map onto W and R fairly directly); the value of the acronym is recall and
adoption, not a mechanism of its own.

**Folio feature sketch:** don't build "WRAP" as a named feature for the same reason as
SQ3R — its components already appear above as the debiasing checklist, the premortem
("prepare to be wrong"), and the reversibility tag ("attain distance"). If Folio's Decide
stage ships a checklist, it should be built from the individually-evidenced pieces, not
badged with a mnemonic that implies more unified evidence than exists.

## 4. Concepts and mental models

### Concept mapping

**Evidence: strong as a constructivist pedagogical tool, grounded in Ausubel's assimilation
theory of learning.** Novak & Cañas's technical report lays out the theory (concepts are
held in propositional, hierarchical frameworks that new material assimilates into) and the
practice (nodes for concepts, labeled connecting lines for relationships, built by the
learner rather than given to them), tracing back to Novak's 1972 invention of the technique
for tracking how children's understanding of science concepts changed over time ([Novak &
Cañas 2006/2008, "The Theory Underlying Concept Maps and How to Construct and Use
Them,"](https://cmap.ihmc.us/publications/researchpapers/theoryunderlyingconceptmaps.pdf)
Florida Institute for Human and Machine Cognition). The active-construction requirement
recurs across this document (also central to argument mapping and self-explanation) — maps
the learner builds are the evidenced version; maps merely handed to a learner to read are
consistently weaker.

**Mechanism:** forcing an explicit, labeled connection between two concepts ("X *causes* Y,"
not just "X and Y are related") requires the kind of precise articulation self-explanation
research also credits with exposing gaps in understanding.

**Folio feature sketch:** overlaps with the argument-mapping sketch above but is broader in
scope (concepts and relationships generally, not specifically claims and warrants) and would
be a heavier addition — a genuine graph editor, not a small panel. The Zettelkasten sketch
below is a more file-native, lower-effort way to get much of the same "explicit linking"
benefit without a new visual editing surface; a dedicated concept-map canvas is a large,
speculative feature, closer to what Obsidian's Canvas or Excalidraw integrations already do
well, and probably not a gap Folio specifically needs to fill.

### Feynman technique

**Evidence: weak/popular, and notably has no canonical primary source at all.** Richard
Feynman never published a named, stepwise "Feynman Technique" — the four-step formalization
(choose a concept, explain it in plain language as if teaching a child, identify the gaps
where the explanation breaks down, go back and simplify/fill the gaps) was assembled by later
popularizers, most visibly Scott Young around 2011, from anecdotes about Feynman's study
habits and his stated teaching philosophy rather than from anything Feynman wrote as a
method ([overview of the technique's actual attribution and later
packaging](https://github.com/guicortei/feynman-technique)). What the technique packages,
though, is not itself unevidenced: "explain it in plain language and see where you get
stuck" is a specific, low-friction instance of self-explanation and self-testing, both of
which do have primary research behind them (above) — the technique's popularity has outrun
its sourcing, but its mechanism is borrowed from ones that are well-supported.

**Mechanism:** attempting a plain-language explanation without the source material in front
of you is an unusually strong forcing function for retrieval (you can't just copy) and
self-explanation (you must make your own connections) at once.

**Folio feature sketch:** deterministic and small. A distinct takeaway mode — "explain it
so a stranger could understand it, with the document closed" — is a stricter version of the
existing takeaway prompt: the Outline tab could hide the document text (or fold to just
headings) while the field is focused, mechanically enforcing the "without looking" part the
technique's mechanism depends on, rather than trusting the reader's honor system. No model
needed; writes to the same `<doc>.decision.md` takeaway section.

### Zettelkasten and linked notes

**Evidence: strong as a documented case of individual productivity (Luhmann), weak/popular
as a generalizable claim (Ahrens).** Niklas Luhmann built a slip-box of roughly 90,000
interlinked index cards over decades, crediting the system's associative, bottom-up linking
(rather than top-down folders) as central to his unusually high output of 70 books and 400+
articles; the physical archive is digitized and searchable at the Niklas Luhmann Archive in
Bielefeld ([overview of Luhmann's original method, two-box structure, and fixed numbering
scheme](https://www.ernestchiang.com/en/posts/2025/niklas-luhmann-original-zettelkasten-method/)).
This is a single, exceptional case study, not a controlled comparison — there's no trial
showing linked-note systems outperform alternatives for typical users. Sönke Ahrens's *How
to Take Smart Notes* is the popularization that introduced the method (and the term) to a
mainstream English-language audience, framed explicitly as "one simple technique," and is a
practitioner synthesis rather than a research contribution — worth reading as an argument,
not as evidence ([Ahrens 2017, *How to Take Smart Notes: One Simple Technique to Boost
Writing, Learning and
Thinking*](https://research.rug.nl/en/publications/s%C3%B6nke-ahrens-2017-how-to-take-smart-notes-one-simple-technique-to/)).

**Mechanism:** atomic notes (one idea each) with explicit links let structure emerge from
associations made at write-time rather than from a taxonomy imposed in advance, and the act
of writing a note in your own words, distinct from the source, is itself a self-explanation
act.

**Folio feature sketch:** the closest fit here is the "wikilinks and heading links" gap the
market-landscape doc already identifies for Folio generally (`[[file]]` resolution and
autocomplete, effort S–M) — Zettelkasten's evidence argues specifically for that feature
being valuable for a *decision/takeaway* corpus, not just documents generally: linking one
document's `<doc>.decision.md` takeaway to another's is a low-cost way to let a reviewer's
accumulated conclusions become associatively connected over time, the same way Luhmann's
cards were, without inventing a new note type. Deterministic; no agent required.

## 5. A ranked shortlist of implementable features

Ranked by evidence strength for the underlying technique times fit with Folio's existing
local/deterministic/file-based model — a feature with weaker evidence but a much better fit
can rank above a stronger technique that would require compromising that model.

1. **Section-scoped recall/self-explanation prompts.** Technique: retrieval practice +
   self-explanation. Evidence: strong. Stage: Read. Agent: no. Effort: S (reuses the outline
   and `<doc>.decision.md` machinery already built). Bad implementation to avoid: grading the
   answer, requiring one before letting the reader continue, or streaking/gamifying
   completion — the value is entirely in the human producing the sentence; anything that
   makes it feel like homework kills voluntary use.
2. **Decision-journal fields (confidence + separate revisit entry).** Technique: decision
   journals / calibration. Evidence: moderate (weak as a studied artifact, moderate via the
   calibration mechanism it operationalizes). Stage: Decide. Agent: no. Effort: S (extends
   the already-planned `<doc>.decision.md` schema). Bad implementation to avoid: an editable
   confidence field, which lets hindsight quietly rewrite the original prediction and
   defeats the entire mechanism.
3. **Premortem prompt before a verdict.** Technique: premortem. Evidence: moderate. Stage:
   Decide. Agent: no. Effort: S. Bad implementation to avoid: making it mandatory to submit a
   verdict — the premortem's own research argues coercion undercuts the psychological safety
   that makes it work.
4. **Reversible/irreversible tag on decisions.** Technique: Bezos Type 1/Type 2 framing.
   Evidence: weak/popular but mechanistically sound and nearly free. Stage: Decide. Agent:
   no. Effort: S. Bad implementation to avoid: an agent auto-classifying reversibility —
   the entire value is the human being forced to actually think about it.
5. **Calibration score across a folder's decision files.** Technique: calibration training.
   Evidence: strong in-domain, contested for transfer. Stage: Decide. Agent: no. Effort: M
   (needs #2 shipped first, plus a folder-level aggregation view). Bad implementation to
   avoid: presenting a score before there's enough data to mean anything, or turning it into
   a leaderboard/streak.
6. **Debiasing checklist (consider-the-opposite, base rate, incentives) in the Decide tab.**
   Technique: Larrick; Soll/Milkman/Payne. Evidence: moderate. Stage: Decide. Agent: no.
   Effort: S. Bad implementation to avoid: a forced, un-skippable checklist that becomes
   ritual clicking rather than genuine pause — every item needs a real skip.
7. **Redundancy/near-duplicate scan for agent-written documents.** Technique: Mayer's
   coherence/redundancy principles. Evidence: strong (as instructional-design research),
   applied here somewhat by inference (the principles are about multimedia lessons, not
   prose review, so the fit is reasoned rather than directly evidenced). Stage: Read. Agent:
   no (string-similarity is deterministic). Effort: M. Bad implementation to avoid: auto-
   deleting flagged redundancy — surface it, let the human or the agent (via feedback file)
   decide.
8. **Feynman-mode takeaway (document hidden while writing).** Technique: self-explanation /
   "Feynman technique." Evidence: moderate (borrowed from self-explanation's stronger
   backing; the named technique itself is weak/popular). Stage: Read. Agent: no. Effort: S.
   Bad implementation to avoid: silently grading or comparing the explanation to the source
   text — that's an AI-summary-style shortcut that removes the friction that makes it work.
9. **Prose-density (grade-level) signal in the reading panel, explicitly not labeled
   "readability."** Technique: Flesch-Kincaid, with its limits foregrounded. Evidence: the
   formula's mechanics are solid, its comprehension validity is contested. Stage: Read.
   Agent: no. Effort: S–M (already scoped in the market-landscape doc). Bad implementation
   to avoid: calling it a comprehension or quality score, or gating anything on it.
10. **Inline warrant-flagging annotation kind in Review Mode.** Technique: Toulmin. Evidence:
    strong as pedagogy, unvalidated as an automated check. Stage: Read/Interrogate boundary.
    Agent: no for the human-marks-it version (S effort, extends the existing annotation
    vocabulary); yes for an agent that proposes candidate warrant gaps for the human to
    confirm or dismiss (Interrogate stage, effort M, and explicitly a draft the human must
    approve, never an auto-inserted claim).
11. **Text-native argument map companion file (Argdown-style).** Technique: argument mapping.
    Evidence: moderate-to-strong, one of the best-controlled findings here, but specifically
    tied to active human construction. Stage: Interrogate/Decide boundary. Agent: only for an
    optional, clearly-labeled first-draft extraction from an agent-written document, which
    the human then edits — an agent silently producing the "final" map is the definitional
    bad implementation, since the evidence is about the human doing the mapping. Effort: L.
12. **Wikilink-style cross-references between decision files.** Technique: Zettelkasten.
    Evidence: weak/popular as a generalizable claim, but the mechanism (associative linking
    replacing rigid hierarchy) is well-motivated and the feature is nearly free once
    file-level wikilinks ship generally. Stage: Decide. Agent: no. Effort: S once general
    wikilinks exist (already scoped at S–M in the market-landscape doc), roughly S
    additionally for decision-file-specific linking.
13. **Read-again nudge based on last-read timestamp.** Technique: spacing. Evidence: strong
    for spacing generally, weak fit for Folio's single-document-read use case. Stage: Read.
    Agent: no. Effort: S. Bad implementation to avoid: a notification, reminder, or anything
    resembling a streak — a quiet timestamp in the panel is the entire feature; anything
    louder turns a desirable-difficulty technique into exactly the nagging pop-up this
    document's traps section warns against.

## 6. Traps: popular techniques the evidence doesn't support well

**Speed reading.** Controlled comparisons find a real speed-accuracy tradeoff: speed readers
and RSVP (rapid serial visual presentation) apps can move through text far faster, but
detailed comprehension suffers relative to normal reading, and a 2016 review by cognitive
scientists specializing in reading and visual perception directly rejected the claim that
peripheral vision can usefully absorb text outside the fovea, one of speed reading's central
technical premises ([Rayner et al., cited overview at
[MinnPost](https://www.minnpost.com/second-opinion/2016/02/speed-reading-involves-tradeoff-between-speed-and-comprehension-experts-say/);
2025 controlled study of the speed-accuracy tradeoff in
reading](https://www.tandfonline.com/doi/full/10.1080/10888438.2025.2612649); overview also
at [Center for
Inquiry](https://centerforinquiry.org/blog/does-speed-reading-improve-reading-comprehension/)).
Notably, regressive eye movements (re-reading a bit you just passed), which speed-reading
programs train users to suppress, actually support comprehension rather than hindering it.

**Learning styles / VARK.** A comprehensive review commissioned by the Association for
Psychological Science examined the "meshing hypothesis" — that matching instruction modality
(visual/auditory/etc.) to a learner's self-reported preferred style improves outcomes — across
dozens of studies and found virtually no support; the specific crossover interaction the
hypothesis requires essentially never appears, while several studies directly contradict it
([Pashler et al. 2008 findings, summarized via a 2020 replication/test of the meshing
hypothesis, "Providing Instruction Based on Students' Learning Style Preferences Does Not
Improve Learning"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7033468/); the myth's
persistence in professional training is documented in [a 2021 review of the "learning styles
neuromyth" in medical
education](https://pmc.ncbi.nlm.nih.gov/articles/PMC8385406/)).

**Highlighting and underlining alone.** Dunlosky et al. rate highlighting/underlining "low
utility": across studies, it produces no measurable benefit over simply reading, largely
because learners are poor at judging which passages are actually important while reading for
the first time, so what gets highlighted is often not what matters
([Dunlosky et al. 2013](https://journals.sagepub.com/doi/10.1177/1529100612453266); summary
of the "high vs. low utility" verdicts at
[psychologicalscience.org](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)).
Folio should treat this as a reason *not* to build passive text-highlighting as a headline
reading feature — it's exactly the kind of thing that feels productive and isn't.

**Rereading.** Also rated "low utility" by Dunlosky et al., for the same underlying reason
retrieval practice beats it in the Roediger & Karpicke comparison above: rereading trades on
fluency, which is a poor proxy for whether the material will be retrievable later, and
produces a false sense of mastery precisely because it *feels* productive
([Dunlosky et al. 2013](https://journals.sagepub.com/doi/10.1177/1529100612453266)).

**Massed practice / cramming.** Distributed practice's entire evidentiary case (Cepeda et
al. above) is a comparison against massed practice, and cramming reliably underperforms
spaced study on any retention interval longer than the next test, even though students
persistently believe otherwise because massed practice produces better *short-term*
performance, which is what students actually observe and remember ([overview of the
massed-vs-spaced evidence](https://learning.uiowa.edu/sites/learning.uiowa.edu/files/2026-03/Spaced-Practice-vs-Massed-Practice.pdf)).

**The "10,000 hours" framing, misapplied.** Anders Ericsson's own research on violinists
measured accumulated *deliberate* practice — practice with a specific goal, at the edge of
current ability, with feedback — not raw hours of any kind, and Ericsson explicitly pushed
back on the popularized version of his work implying anyone can reach expertise through
10,000 hours of ordinary repetition; his study never tested whether randomly assigned
practice of that volume produces expertise, and generic, non-deliberate repetition is not
what the underlying data showed correlating with skill ([overview of the misapplication and
Ericsson's own response](https://www.aubreydaniels.com/media-center/organizational-solutions/articles/expert-performance-apologies-to-dr-ericsson-but-it)).

**"Just add AI" summarization reducing comprehension and engagement.** A Microsoft/Carnegie
Mellon survey of 319 knowledge workers found that higher confidence in generative AI's
output was associated with *less* self-reported critical thinking applied to the task, and
that AI use shifted effort from independent reasoning toward verifying and integrating the
tool's output ([Lee et al. 2025, "The Impact of Generative AI on Critical Thinking:
Self-Reported Reductions in Cognitive Effort and Confidence Effects From a Survey of
Knowledge
Workers"](https://www.microsoft.com/en-us/research/wp-content/uploads/2025/01/lee_2025_ai_critical_thinking_survey.pdf)).
A separate, larger study of 666 participants found heavier AI-tool use was associated with
lower scores on critical-thinking self-assessment, mediated specifically by "cognitive
offloading" — delegating a task to the tool rather than reasoning through it — though the
authors note the causal direction and generalizability of this correlational finding are
still open questions (cited via [summary of 2025-2026 research on AI and critical
thinking](https://www.apa.org/monitor/2026/07-08/ai-job-skills-thinking)). An MIT Media Lab
EEG study comparing essay-writing with an LLM, with a search engine, and unaided found LLM
users showed the weakest neural connectivity of the three groups and coined the term
"cognitive debt" for the pattern of short-term effort savings compounding into long-term
reduced independent capability — flagged here as preprint, not yet peer-reviewed, and
methodologically contested, but directly on-point for a tool explicitly built around *not*
generating a summary or takeaway on the reader's behalf ([Kosmyna et al. 2025, "Your Brain on
ChatGPT: Accumulation of Cognitive Debt when Using an AI Assistant for Essay Writing
Task,"](https://arxiv.org/abs/2506.08872) preprint; [MIT Media Lab project
page](https://www.media.mit.edu/publications/your-brain-on-chatgpt/)). This is the direct
empirical case for Folio's existing "the agent writes elsewhere" line, and for why every
feature sketch above that touches the takeaway, the recall prompt, or the decision journal
insists the human write it, with the agent's role limited to drafts the human must actively
correct rather than passively accept.

**Digital annotation gamification.** No single canonical debunking study exists for this one
specifically, but it follows directly from the mechanism behind why highlighting fails and
why forced checklists undercut debiasing and premortems above: streaks, badges, and
completion counters optimize for the *appearance* of engagement (an annotation exists, a
streak continues) rather than the cognitive act the technique depends on (the annotation
actually required retrieval or self-explanation to produce). Anything in the shortlist above
that could be gamified — recall prompts, checklist completion, calibration scores — carries
an explicit warning against exactly this in its "bad implementation to avoid."

**Keyword mnemonics and imagery for text learning.** Rated "low utility" by Dunlosky et al.
alongside highlighting and rereading — the reported benefits are narrow (mostly vocabulary
lists) and don't transfer well to typical prose comprehension or retention of ideas, unlike
the domain-general effectiveness of retrieval practice and spacing
([Dunlosky et al. 2013](https://journals.sagepub.com/doi/10.1177/1529100612453266)).

## Sources

- Dunlosky, Rawson, Marsh, Nathan & Willingham (2013), "Improving Students' Learning With
  Effective Learning Techniques," *Psychological Science in the Public Interest* —
  <https://journals.sagepub.com/doi/10.1177/1529100612453266>
- Psychological Science summary of Dunlosky et al. (2013) —
  <https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html>
- Psychological Science press release, "Which Study Strategies Make the Grade?" —
  <https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html>
- Roediger & Karpicke (2006), "Test-Enhanced Learning," *Perspectives/Psychological Science* —
  <https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x>
- Bjork & Bjork (2020), "Desirable Difficulties in Theory and Practice," *Journal of Applied
  Research in Memory and Cognition* —
  <https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2021/01/RABjorkELBjorkJARMAC2020ForPostingSingleSpaced.pdf>
- Cepeda, Pashler, Vul, Wixted & Rohrer (2006), "Distributed Practice in Verbal Recall Tasks:
  A Review and Quantitative Synthesis," *Psychological Bulletin* —
  <https://www.yorku.ca/ncepeda/publications/CPVWR2006.html>
- Chi, Bassok, Lewis, Reimann & Glaser (1989), "Self-Explanations: How Students Study and Use
  Examples in Learning to Solve Problems," *Cognitive Science* —
  <https://onlinelibrary.wiley.com/doi/abs/10.1207/s15516709cog1302_1>
- Chi (2000), "Self-Explaining Expository Texts: The Dual Processes of Generating Inferences
  and Repairing Mental Models" —
  <https://education.asu.edu/lcl/publications/chi-m-t-h-2000-self-explaining-expository-texts-dual-processes-generating-0>
- Bisra et al. (2018), "Inducing Self-Explanation: A Meta-Analysis," *Educational Psychology
  Review* — <https://link.springer.com/article/10.1007/s10648-018-9434-x>
- Novak & Cañas (2006/2008), "The Theory Underlying Concept Maps and How to Construct and Use
  Them," IHMC — <https://cmap.ihmc.us/publications/researchpapers/theoryunderlyingconceptmaps.pdf>
- Mayer & Fiorella, "Principles for Reducing Extraneous Processing in Multimedia Learning" —
  <https://www.researchgate.net/publication/262915119_Principles_for_reducing_extraneous_processing_in_multimedia_learning_Coherence_signaling_redundancy_spatial_contiguity_and_temporal_contiguity_principles>
- JSU overview of Mayer's Cognitive Theory of Multimedia Learning —
  <https://www.jsu.edu/online/faculty/cognitive-theory-of-multimedia-learning.html>
- Kintsch (1988), "The Role of Knowledge in Discourse Comprehension: A Construction-
  Integration Model," *Psychological Review* — <https://pubmed.ncbi.nlm.nih.gov/3375398/>
- McNamara (2004), "SERT: Self-Explanation Reading Training," *Discourse Processes* —
  <https://andymatuschak.org/files/papers/McNamara%20-%202004%20-%20SERT.pdf>
- iSTART research overview (self-explanation training automation) —
  <https://www.researchgate.net/publication/237554287_Improving_adolescent_students'_reading_comprehension_with_iSTART>
- Pressley & Afflerbach (1995), *Verbal Protocols of Reading: The Nature of Constructively
  Responsive Reading* — <https://eric.ed.gov/?id=ED379618>
- Reading Rockets, overview of National Reading Panel comprehension-strategy findings —
  <https://www.readingrockets.org/topics/comprehension/articles/instruction-metacognitive-strategies-enhances-reading-comprehension>
- Comprehension monitoring / eye-movement methodology overview —
  <https://escholarship.org/uc/item/59s9872k>
- Cross-context evaluation of metacognitive reading strategies (2025) —
  <https://link.springer.com/article/10.1186/s40536-025-00240-3>
- Toulmin (1958), *The Uses of Argument*; pedagogical adaptation —
  <https://argumentcenterededucation.com/2019/07/17/our-adaptation-of-the-toulmin-model-of-argument/>
- Toulmin model teaching summary —
  <https://viva.pressbooks.pub/letsgetwriting/chapter/the-toulmin-argument-model/>
- Kahneman & Klein (2009), "Conditions for Intuitive Expertise: A Failure to Disagree,"
  *American Psychologist* — <https://pubmed.ncbi.nlm.nih.gov/19739881/>
- Klein (2007), "Performing a Project Premortem," *Harvard Business Review* —
  <https://hbr.org/2007/09/performing-a-project-premortem>
- The Good Judgment Project overview —
  <https://en.wikipedia.org/wiki/The_Good_Judgment_Project>
- Tetlock & Gardner (2015), *Superforecasting: The Art and Science of Prediction* —
  <https://en.wikipedia.org/wiki/Superforecasting:_The_Art_and_Science_of_Prediction>
- Larrick (2004), "Debiasing," in *Blackwell Handbook of Judgment and Decision Making* —
  <https://web.stanford.edu/~knutson/jdm/larrick04.pdf>
- Soll, Milkman & Payne (2015), "Outsmart Your Own Biases," *Harvard Business Review* —
  <https://hbr.org/2015/05/outsmart-your-own-biases>
- Duke (2018), *Thinking in Bets*, Portfolio/Penguin Random House —
  <https://www.penguinrandomhouse.com/books/552885/thinking-in-bets-by-annie-duke/>
- Summary noting Duke's own stated practice on decision journals —
  <https://blog.christopherwink.com/2022/07/31/thinking-in-bets-decision-annie-duke/>
- Amazon shareholder letters, official archive (1997 "one-way/two-way doors" letter and 2015
  follow-up) — <https://www.aboutamazon.com/about-us/shareholder-letters>
- Heath & Heath (2013), *Decisive*, WRAP model summary —
  <https://heathbrothers.com/member-content/1-page-summary-of-the-wrap-model/>
- Farnam Street decision journal template and background —
  <https://readcrucible.com/articles/decision-journals-the-practice-the-science-the-templates>
- Shane Parrish interview on mental models and decision journal —
  <https://fs.blog/shane-parrish-mental-models/>
- Feynman technique origin and attribution (no canonical Feynman source) —
  <https://github.com/guicortei/feynman-technique>
- Niklas Luhmann's original Zettelkasten method —
  <https://www.ernestchiang.com/en/posts/2025/niklas-luhmann-original-zettelkasten-method/>
- Ahrens (2017), *How to Take Smart Notes* —
  <https://research.rug.nl/en/publications/s%C3%B6nke-ahrens-2017-how-to-take-smart-notes-one-simple-technique-to/>
- Robinson (1946), *Effective Study* (SQ3R); overview —
  <https://en.wikipedia.org/wiki/SQ3R>
- SQ3R effectiveness and component-analysis overview —
  <https://www.researchgate.net/publication/400600826_The_Effectiveness_of_Survey_Question_Read_Recite_and_Review_SQ3R_Technique_to_Increase_Students'_Reading_Comprehension>
- Social annotation and reading comprehension, CERIC method study (2024) —
  <https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1257747/full>
- Individual vs. team annotation effects on comprehension/critical thinking —
  <https://www.sciencedirect.com/science/article/abs/pii/S0747563210001524>
- Flesch (1948), "A New Readability Yardstick," overview —
  <https://readabilityformulas.com/learn-about-the-flesch-reading-ease-formula/>
- Critique of Flesch formula validity for real comprehension —
  <https://pubmed.ncbi.nlm.nih.gov/28707643/>
- van Gelder, Bissett & Cumming (2004), "Cultivating Expertise in Informal Reasoning" —
  <https://www.researchgate.net/publication/304805904_Using_Argument_Mapping_to_Improve_Critical_Thinking_Skills>
- Alvarez-Ortiz (2007), "Does Philosophy Improve Critical Thinking Skills?" thesis —
  <https://researchrepository.universityofgalway.ie/server/api/core/bitstreams/4034a5fa-43a2-4fb3-b889-847ee48dbb60/content>
- Kialo Edu research page —
  <https://www.kialo-edu.com/research>
- Argument-mapping tools overview (Kialo, Rationale, Argdown) —
  <https://link.springer.com/chapter/10.1007/978-3-031-36033-6_6>
- Argunet, open-source argument mapper — <http://www.argunet.org/>
- Hubbard Decision Research, calibration training overview —
  <https://hubbardresearch.com/calibration-training/>
- EA Forum critique of calibration-training transfer evidence —
  <https://forum.effectivealtruism.org/posts/qFkEhW7Hn2mkJvjNv/does-calibrated-probability-assessment-training-work>
- APA Monitor, "How AI is reshaping human skills and thinking" (2026) —
  <https://www.apa.org/monitor/2026/07-08/ai-job-skills-thinking>
- Lee et al. (2025, Microsoft/Carnegie Mellon), "The Impact of Generative AI on Critical
  Thinking" —
  <https://www.microsoft.com/en-us/research/wp-content/uploads/2025/01/lee_2025_ai_critical_thinking_survey.pdf>
- Kosmyna et al. (2025), "Your Brain on ChatGPT: Accumulation of Cognitive Debt," preprint —
  <https://arxiv.org/abs/2506.08872>
- MIT Media Lab, "Your Brain on ChatGPT" project page —
  <https://www.media.mit.edu/publications/your-brain-on-chatgpt/>
- Speed-reading comprehension tradeoff, 2016 review overview —
  <https://www.minnpost.com/second-opinion/2016/02/speed-reading-involves-tradeoff-between-speed-and-comprehension-experts-say/>
- 2025 controlled study of speed-accuracy tradeoff in reading —
  <https://www.tandfonline.com/doi/full/10.1080/10888438.2025.2612649>
- Center for Inquiry, "Does Speed Reading Improve Reading Comprehension?" —
  <https://centerforinquiry.org/blog/does-speed-reading-improve-reading-comprehension/>
- Learning styles / meshing hypothesis, replication and test —
  <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7033468/>
- Learning-styles neuromyth persistence in medical education (2021 review) —
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC8385406/>
- Massed vs. spaced practice overview, University of Iowa —
  <https://learning.uiowa.edu/sites/learning.uiowa.edu/files/2026-03/Spaced-Practice-vs-Massed-Practice.pdf>
- Ericsson on the misapplication of the "10,000 hours" framing —
  <https://www.aubreydaniels.com/media-center/organizational-solutions/articles/expert-performance-apologies-to-dr-ericsson-but-it>

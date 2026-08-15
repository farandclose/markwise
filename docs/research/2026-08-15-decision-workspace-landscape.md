# Adjacent decision-workspace products and practices

**Date:** 2026-08-15

**Wayfinder ticket:** [Research adjacent decision-workspace products and practices](https://github.com/farandclose/markwise/issues/13)

**Question:** How do current products and open workflows help people understand long documents, obtain multi-perspective critique, deliberate over candidate findings, and record consequential decisions?

## Bottom line

The adjacent market is not one category. It is a stack of at least five established layers:

1. **Source-grounded comprehension** tools turn large source sets into summaries, questions, and cited explanations. Google NotebookLM is a strong representative: it accepts Markdown and other source types, creates whole-source and topic-focused summaries, and grounds chat answers in citations that navigate back to source passages. [NotebookLM overview](https://support.google.com/notebooklm/answer/16164461?hl=en), [source and summary behavior](https://support.google.com/notebooklm/answer/16215270?hl=en), [citation behavior](https://support.google.com/notebooklm/answer/16179559?hl=en)
2. **AI councils and critique systems** already market multiple models, expert personas, disagreement, synthesis, and decision support. Decidi is the closest conceptual collision found: it describes specialist personas on rival models, primary-source research, debate, dissent, a separate QA pass, and a final decision deliverable. Perspektiv offers generated panels, live debate, human interjection, and synthesis; Microsoft 365 Copilot Researcher offers separate Critique and Council modes, including side-by-side model responses and a cover letter about agreement and divergence. [Decidi](https://decidi.ai/how-it-works), [Perspektiv](https://perspektiv.ai/), [Microsoft Researcher](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-multi-model-intelligence-in-researcher/4506011)
3. **Document-review systems** have normalized anchored comments, exact edit suggestions, threads, resolution, reviewer identity, and approval gates. Google Docs and GitHub are the mainstream reference points; Roughdraft and markupmarkdown apply similar mechanics to agent-authored Markdown. [Google Docs suggestions](https://support.google.com/docs/answer/6033474?hl=en), [GitHub review flow](https://docs.github.com/en/pull-requests/get-started/reviewing-pull-requests-quickstart), [Roughdraft](https://www.roughdraft.md/), [markupmarkdown](https://github.com/jonradoff/markupmarkdown)
4. **Deliberation systems** structure arguments and participation. Kialo organizes atomic claims into pro/con trees, allows sources and claim-level discussion, and can measure perceived impact; Loomio moves a group from discussion through advice, consent, consensus, or polling to a stated outcome. [Kialo claim guidance](https://support.kialo-edu.com/en/hc/tips-for-students/), [Kialo voting](https://support.kialo-edu.com/en/hc/about-voting/), [Loomio proposals and polls](https://help.loomio.com/en/user_manual/polls/intro_to_decisions/index.html), [Loomio outcomes](https://help.loomio.com/en/user_manual/polls/outcomes/index.html)
5. **Decision records** preserve context, options, rationale, and consequences. MADR's Markdown template explicitly asks for the problem, decision drivers, considered options, chosen outcome, consequences, confirmation, and option-level pros and cons. [MADR template](https://adr.github.io/madr/decisions/adr-template.html)

This evidence rules out two easy uniqueness claims: neither “multiple AI perspectives for a decision” nor “agent-friendly Markdown review” is open territory. The potentially uncommon Markwise seam is the *combination* of a decision-centric reading experience, repository context, independently generated candidate findings, human promotion into a durable review protocol, visible disagreement, one accountable decision owner, and a final decision record without continuing into execution. That is a differentiation hypothesis from this sample, not proof of a unique market position.

## Method and limits

This scan used primary sources only: first-party product/help pages, official documentation, maintained source repositories, specifications, and original research papers. Product capabilities are reported as their makers document them; they were not independently benchmarked or validated. The sample is representative rather than exhaustive, and it does not establish adoption, willingness to pay, output quality, or whether model/persona diversity improves real decisions. Product surfaces were checked on 2026-08-15.

“Not documented” below means the reviewed first-party material did not describe the capability. It does not prove that the product cannot do it.

## 1. Understanding long documents and repository context

### NotebookLM: source-bounded orientation with inspectable citations

NotebookLM accepts PDFs, web pages, Google files, Word, Markdown, text, CSV, audio, video links, and other sources. A user can get an automatic whole-source summary in a Source Guide or ask for a topic-focused summary in chat. The user can include or exclude particular sources for a question. [NotebookLM source types and summaries](https://support.google.com/notebooklm/answer/16215270?hl=en)

Its key trust pattern is **answer-to-source navigation**: answers use source material as citations, hovering exposes the quoted material, and selecting a citation navigates to its source location. NotebookLM chat is normally restricted to the selected notebook sources; Google explicitly says information absent from those sources can cause it to decline an answer. [NotebookLM chat and citations](https://support.google.com/notebooklm/answer/16179559?hl=en), [NotebookLM overview and answer limits](https://support.google.com/notebooklm/answer/16164461?hl=en)

The official documentation also exposes relevant boundaries. Imported sources are copies or synced representations; NotebookLM does not edit originals, and imports from Google files omit comments. Its newer agentic actions are described as experimental, and Google tells users to supervise and double-check them. [NotebookLM source limitations](https://support.google.com/notebooklm/answer/16215270?hl=en), [NotebookLM agentic-action warning](https://support.google.com/notebooklm/answer/16179559?hl=en)

**Interaction pattern:** select sources → receive an overview → ask questions → inspect citations → save useful responses as notes.

**What it establishes:** long-document orientation and source traceability are already strong standalone capabilities.

**Boundary for Markwise:** the documented unit is a source-grounded answer or generated artifact, not a candidate finding with review state, owner adjudication, and a decision-record destination.

### ChatGPT Projects and GitHub: persistent project context

ChatGPT Projects keep chats, files, and custom instructions together, and project memory can constrain context to material within that project. Shared projects use project-only memory rather than a member's unrelated personal context. [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)

The GitHub connection can retrieve live repository content—including code, README files, and other documentation—and cite relevant snippets in responses. [Connecting GitHub to ChatGPT](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt-deep-research)

**Interaction pattern:** collect files and instructions in a persistent conversational workspace, then ask the model to reason across them.

**What it establishes:** “document plus repository context” can be assembled in a general AI workspace without a dedicated decision product.

**Boundary for Markwise:** the reviewed documentation describes context, memory, chat, and cited repository reasoning, but not a structured progression from independent findings through human promotion to an embedded review record and final decision artifact.

## 2. Multi-perspective and multi-agent critique

### Direct decision products

#### Decidi

Decidi describes a chat that escalates consequential questions to named specialist personas running on multiple frontier models. Its documented flow is: research current facts from primary sources, let specialists state and rebut positions, add a Devil's Advocate, have a separate Chair synthesize a verdict, and run another QA audit for hallucinations, weak reasoning, and missed caveats. It says the output exposes disagreement, load-bearing assumptions, ranked risks, a “verify before you rely” list, and cases where a responsible decision cannot yet be made. [Decidi workflow](https://decidi.ai/how-it-works)

Its worked example is unusually close to Markwise's contemplated wedge: a build-versus-buy decision reviewed from CTO, CFO, pragmatist, and Devil's Advocate perspectives. Decidi nevertheless centers a system-produced, audited **verdict** and can continue into producing finished documents, code, data, and other deliverables. [Decidi build-versus-buy example and deliverables](https://decidi.ai/how-it-works)

**Trust mechanisms claimed:** model-provider diversity, cited live research, visible dissent, an independent moderator where the plan supports it, a separate QA pass, explicit unknowns, and a verification checklist.

**Boundary relative to the map:** broad chat and attachment inputs, external research as a central step, an AI-authored verdict, many decision classes, and optional execution all differ from Markwise's current repository-native, candidate-first, human-adjudicated, stop-at-the-record boundary.

#### Perspektiv

Perspektiv markets a “room” in which a generated panel of personalities debates a decision. The user can edit the panel, mix models, interject during the debate, address a panelist directly, and request synthesis. It also supports collecting human poll responses and asking an AI council to analyze patterns and blind spots. [Perspektiv](https://perspektiv.ai/)

**Trust mechanism claimed:** disagreement and human intervention during a visible debate.

**Boundary relative to the map:** the documented experience begins with a question and added context, not a repository-native source document with durable anchored findings and a protocol-level decision record.

#### Microsoft 365 Copilot Researcher

Microsoft documents two multi-model modes for Researcher. **Critique** separates generation from review: one model researches and drafts, while a second model reviews and refines. **Council** shows multiple model responses side by side and adds a cover letter that calls out agreement, divergence, and each model's distinctive contribution. [Microsoft Researcher multi-model modes](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-multi-model-intelligence-in-researcher/4506011)

**Trust mechanism claimed:** separation of generator and reviewer, model diversity, preserved side-by-side outputs, and an explicit account of disagreement.

**Boundary relative to the map:** Researcher produces a research answer/report; its documented Council is not a finding lifecycle tied to an accountable owner's decision record.

### Open orchestration patterns

The implementation patterns behind “many perspectives” are already widely available:

- Anthropic recommends parallel calls when separate considerations or multiple perspectives need focused attention. Its evaluator-optimizer pattern uses one model call to generate and another to critique against clear evaluation criteria, iterating when improvement can be measured. Anthropic also warns that agentic complexity trades additional cost and latency for potential performance and should be added only when simpler approaches fall short. [Anthropic, “Building effective agents”](https://www.anthropic.com/engineering/building-effective-agents)
- OpenAI's Agents SDK documents a manager pattern in which one agent invokes specialists and combines their outputs under shared guardrails; it also documents code-orchestrated parallel agents and evaluator loops as more deterministic alternatives to leaving orchestration entirely to a model. [OpenAI Agents SDK orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- AutoGen's multi-agent debate example has solver agents exchange answers and refine them before an aggregator produces a final answer. AutoGen's team guidance says teams require more scaffolding than a single agent and should be used for complex tasks where diverse expertise is warranted. [AutoGen multi-agent debate](https://microsoft.github.io/autogen/dev/user-guide/core-user-guide/design-patterns/multi-agent-debate.html), [AutoGen teams](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html)
- Constitutional AI demonstrates a related but distinct pattern: written principles can drive model-generated critique and revision. That work is a model-training method, not a document-review product, but it is evidence that an explicit evaluation mandate can be operationalized without pretending to be a human executive. [Constitutional AI paper](https://arxiv.org/abs/2212.08073), [Anthropic explanation](https://www.anthropic.com/news/claudes-constitution)

These sources separate two choices that are often conflated:

1. **Orchestration topology:** independent parallel passes, sequential critique, debate with cross-talk, or specialists under a manager.
2. **Review mandate:** a named persona, a task specialization, a written rubric, or a set of decision criteria.

The sources show that all of these are implementable; they do not establish which topology or mandate produces better product decisions. A Markwise strategy therefore cannot treat “run several role prompts” as the unresolved technical insight.

## 3. Deliberating over candidate findings

### Kialo: claims as a structured argument graph

Kialo asks contributors to make concise, atomic claims and place each one as a pro or con of the claim immediately above it. It supports claim-level comments and edit history, links to external sources, and pending suggested claims/comments that an owner or admin can review. [Kialo claim guidance](https://support.kialo-edu.com/en/hc/tips-for-students/), [Kialo discussion menu](https://support.kialo-edu.com/en/hc/navigating-the-discussion-menu/), [Kialo claim history](https://support.kialo-edu.com/en/hc/navigating-the-claim-menu/)

Kialo's optional voting asks participants to rate a claim's impact on its parent, explicitly combining perceived veracity and relevance. Vote visibility can be hidden to reduce social influence before results are revealed. [Kialo voting](https://support.kialo-edu.com/en/hc/about-voting/)

**Reusable interaction ideas:** atomic candidates, explicit support/refute relationships, separate discussion from the claim itself, source attachment, pending suggestions before canonical inclusion, and optional blind assessment.

**Boundary relative to the map:** Kialo is organized around a collaboratively constructed claim tree and participant assessments. The reviewed documentation does not describe ingesting a source document, running AI review lenses, or producing a one-owner decision record.

### Loomio: discussion-to-outcome processes

Loomio offers advice, consent, consensus, sense-check, choice, score, allocation, and ranking templates. A proposal or poll can require reasons, set a deadline, remind nonparticipants, allow people to change their stance as information changes, and end with a stated outcome. [Loomio proposals and polls](https://help.loomio.com/en/user_manual/polls/intro_to_decisions/index.html)

The Advice template is especially relevant to a one-owner model: it seeks input from affected people or experts without transferring the decision itself. Loomio's outcome guidance includes an example where a project manager records that input was considered and then states the call they personally made. [Loomio proposal types](https://help.loomio.com/en/user_manual/polls/proposals/index.html), [Loomio outcomes](https://help.loomio.com/en/user_manual/polls/outcomes/index.html)

**Reusable interaction ideas:** distinguish advice from consent or consensus, ask participants to give reasons, allow updates when new information appears, and require an explicit outcome statement after deliberation.

**Boundary relative to the map:** Loomio primarily coordinates multiple humans and organizational governance; Markwise's initial map has one accountable owner evaluating AI-generated candidate findings rather than a committee reaching a vote.

## 4. Review protocols and human authority

### Mainstream expectations: Google Docs and GitHub

Google Docs separates comments from suggested changes. Suggestions preserve the original text until the owner accepts or rejects them, may include a threaded explanation, and can be reviewed individually or in a batch. Comments can be replied to, resolved, reopened, and assigned as action items. [Google Docs suggestions](https://support.google.com/docs/answer/6033474?hl=en), [Google Docs comments and action items](https://support.google.com/docs/answer/65129?hl=en-gb)

GitHub pull-request reviews support line- or range-anchored comments, exact change suggestions, a pending review that is submitted as a batch, and three review dispositions: comment, approve, or request changes. Authors can apply suggestions, update the branch, and mark conversations resolved; branch protection can require approving reviews and conversation resolution before merge. [GitHub review quickstart](https://docs.github.com/en/pull-requests/get-started/reviewing-pull-requests-quickstart), [resolving reviews](https://docs.github.com/en/pull-requests/concepts/resolving-reviews), [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

These systems establish familiar semantics: **anchor the observation, separate discussion from an exact edit, expose identity and state, and let an authorized human disposition the result**. They are review and merge systems, not decision-quality systems; their primary object is a document or code change rather than the underlying product bet.

### CriticMarkup: portable editorial intent in plain text

CriticMarkup defines human-readable, tool-optional syntax for additions, deletions, substitutions, comments, and highlighted passages. Its stated goals include compatibility with Markdown/HTML and readability in a plain text editor. [CriticMarkup toolkit and syntax](https://github.com/CriticMarkup/CriticMarkup-toolkit)

The documented protocol provides editorial marks and generic comment metadata, but it does not define threaded conversation, ownership transitions, candidate promotion, or a decision record. It is therefore prior art for portable edit intent rather than a complete human-agent decision loop.

### Roughdraft: a blocking human review step for agent-authored Markdown

Roughdraft's documented workflow asks a coding agent to write a Markdown plan, open it in a local review surface, wait while a human leaves inline comments and suggested edits, and resume after the human clicks “I'm done.” Roughdraft says its Markdown dialect extends CriticMarkup with full comment threads and suggestions, keeping the feedback in the file the agent will read next. [Roughdraft](https://www.roughdraft.md/)

**Overlap:** local Markdown, agent handoff, in-file comments, threads, and suggestions.

**Boundary relative to the map:** the documented reviewer is the human; the product is a feedback checkpoint before the coding agent continues, not an automated set of decision lenses with candidate triage and synthesis.

### markupmarkdown: repository Markdown with agent reviewers and human sign-off

markupmarkdown describes a Google-Docs-style review surface for actual `.md` files, GitHub import/pushback, anchored threads, suggested changes, `comment`/`approve`/`request changes` review states, AI-assisted revision, and an MCP surface through which agents can read, comment, suggest, reply, resolve, and set review state. It also documents index-level automated agent audits and agent identity badges. [markupmarkdown repository](https://github.com/jonradoff/markupmarkdown)

Its authority boundary is explicit: agent revisions remain proposed, and the GitHub push flow refuses to ship them until a human accepts; agents cannot self-accept through the agent token path. Its storage model is a per-document copy and review data in MongoDB, rather than a wholly self-contained review record in the source Markdown. [markupmarkdown human-sign-off and storage documentation](https://github.com/jonradoff/markupmarkdown)

**Overlap:** repository Markdown, agent reviewers, candidate changes, threaded review, lifecycle, GitHub handoff, and human authority.

**Boundary relative to the map:** its documented center is reviewing, revising, approving, and shipping the document. It does not describe decision-centered summaries, independent executive/functional lenses, cross-lens synthesis, or a final product-bet decision record. Because it already supports automated agent audits, that boundary could narrow.

### Pinjot: a critique layer over completed agent work

Pinjot's product promise—“Done isn't decided”—is close to Markwise's judgment-bottleneck thesis. It collects proof from agent runs (screenshots, video, logs, diffs, and artifacts), allows feedback anchored to moments, files, or decisions, and lets a builder approve, request changes, or rerun. [Pinjot](https://pinjot.com/)

**Overlap:** human judgment after cheap agent execution, anchored critique, evidence, iteration, and an explicit builder decision.

**Boundary relative to the map:** Pinjot's loop begins after an agent run and spans many proof types; Markwise's current map begins before a product or feature build, with a repository-native decision document as the source artifact.

## 5. Durable decision records

### MADR: record the context, alternatives, and consequences

MADR provides a Markdown decision-record template containing context/problem statement, decision drivers, considered options, decision outcome and justification, positive and negative consequences, confirmation, option-level pros and cons, and additional evidence or revisit information. The project says the format can record any decision while retaining an architecture-decision emphasis. [MADR overview](https://adr.github.io/madr/), [MADR template](https://adr.github.io/madr/decisions/adr-template.html)

**Trust mechanism:** force rationale and rejected alternatives into the durable artifact instead of retaining only the chosen answer.

**Boundary relative to the map:** MADR is a schema for recording a decision; it does not itself help a reader understand a long proposal, generate critique, test evidence, or adjudicate candidate findings.

### Loomio outcomes: tie the record to the deliberation

When a Loomio proposal or poll closes, the author records an outcome stating the results, the decision, what was learned, and optionally a review date. Loomio treats that statement as the durable record of the poll or decision and can notify participants with the results and outcome. [Loomio outcomes](https://help.loomio.com/en/user_manual/polls/outcomes/index.html)

**Trust mechanism:** preserve the discussion and participation trail, then require a concise human-authored conclusion.

**Boundary relative to the map:** the record is tied to a group process, not an embedded source-document review protocol or AI-lens evidence model.

## Cross-cutting trust and interaction patterns

| Pattern | Representative primary-source examples | What the pattern protects against | Important boundary |
| --- | --- | --- | --- |
| Source-to-claim traceability | NotebookLM citations navigate to source passages; Decidi says live facts are cited. [NotebookLM](https://support.google.com/notebooklm/answer/16179559?hl=en), [Decidi](https://decidi.ai/how-it-works) | Unsupported or hard-to-audit claims | A citation shows provenance, not that the inference or source is adequate. |
| Context scoping | NotebookLM lets users select sources; ChatGPT project-only memory limits context to a project. [NotebookLM](https://support.google.com/notebooklm/answer/16179559?hl=en), [ChatGPT Projects](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt) | Accidental use of irrelevant context | A bounded context may omit decisive external facts. |
| Independent first passes | Decidi says specialists state positions before rebuttal; Microsoft Council preserves multiple model outputs side by side. [Decidi](https://decidi.ai/how-it-works), [Microsoft Researcher](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-multi-model-intelligence-in-researcher/4506011) | Premature convergence and invisible disagreement | The reviewed claims do not independently prove that different models or personas are epistemically independent. |
| Explicit criteria | Anthropic's evaluator-optimizer assumes clear evaluation criteria; Constitutional AI uses written principles for critique. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), [Constitutional AI](https://arxiv.org/abs/2212.08073) | Vague “be critical” prompting and inconsistent reviews | Criteria can encode blind spots and need ownership/versioning. |
| Candidate before canonical state | Google Docs suggestions need owner acceptance; Kialo can hold suggested claims/comments; markupmarkdown keeps agent revisions proposed until human sign-off. [Google Docs](https://support.google.com/docs/answer/6033474?hl=en), [Kialo](https://support.kialo-edu.com/en/hc/navigating-the-discussion-menu/), [markupmarkdown](https://github.com/jonradoff/markupmarkdown) | AI or reviewer output silently becoming authoritative | Candidate volume can overwhelm the owner without ranking, grouping, or dismissal semantics. |
| Visible disagreement | Kialo preserves pro/con structure; Microsoft Council explains agreement and divergence; Decidi says dissent is shown rather than averaged away. [Kialo](https://support.kialo-edu.com/en/hc/tips-for-students/), [Microsoft Researcher](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-multi-model-intelligence-in-researcher/4506011), [Decidi](https://decidi.ai/how-it-works) | False consensus hidden by a single summary | A synthesis layer can still overrule or compress meaningful dissent. |
| Human authority gate | Google Docs owners accept/reject suggestions; GitHub approvals and protections gate merge; markupmarkdown requires human acceptance of agent revisions. [Google Docs](https://support.google.com/docs/answer/6033474?hl=en), [GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [markupmarkdown](https://github.com/jonradoff/markupmarkdown) | Unreviewed change becoming final | “Human in the loop” is weak unless the human can inspect evidence and the gate is technically enforced. |
| Durable rationale | MADR records options, justification, and consequences; Loomio links an outcome to its discussion and results. [MADR](https://adr.github.io/madr/decisions/adr-template.html), [Loomio](https://help.loomio.com/en/user_manual/polls/outcomes/index.html) | A decision surviving without its reasoning | A record written only at the end can become retrospective justification rather than a faithful deliberation trace. |
| Explicit stopping condition | Roughdraft blocks until “I'm done”; GitHub gates merge on review conditions; agent frameworks recommend termination conditions or human checkpoints. [Roughdraft](https://www.roughdraft.md/), [GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [AutoGen termination](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html) | Endless review loops or premature action | Passing a procedural gate does not establish decision quality. |

## Direct adjacency to Markwise's current thesis

| Adjacent product/practice | Material overlap | Documented difference from the current Markwise map |
| --- | --- | --- |
| Decidi | Consequential decisions, expert personas, multiple models, rebuttal, dissent, risks, assumptions, synthesis, decision deliverable. [Source](https://decidi.ai/how-it-works) | Broad chat/attachments; external live research is central; the system returns an audited verdict and may build the final artifact. Markwise currently proposes repository context by default, candidate findings, owner adjudication, and a stop at the decision record. |
| Perspektiv | Generated panel, model choice, live debate, human interjection, synthesis, and decision polls. [Source](https://perspektiv.ai/) | Question-centered debate rather than a repository Markdown source, anchored protocol, and persistent decision-record workflow. |
| Microsoft Researcher | Multi-model review, side-by-side outputs, agreement/divergence synthesis. [Source](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-multi-model-intelligence-in-researcher/4506011) | Research-report production rather than a decision-owner workflow over a build-bet document. |
| NotebookLM / ChatGPT Projects | Long-source understanding, bounded context, repository reasoning, citations. [NotebookLM](https://support.google.com/notebooklm/answer/16179559?hl=en), [ChatGPT Projects](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt), [GitHub connection](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt-deep-research) | General research/chat workspaces; the reviewed docs do not specify independent finding generation, review-state promotion, or a decision record. |
| Roughdraft | Local Markdown, human-agent handoff, in-file threaded feedback and suggestions. [Source](https://www.roughdraft.md/) | Human-authored review checkpoint before the coding agent resumes; no documented automatic lens or synthesis layer. |
| markupmarkdown | Repository Markdown, anchored threads, agent reviewers, review states, AI revision, human sign-off, GitHub handoff. [Source](https://github.com/jonradoff/markupmarkdown) | Document review/revision/shipping is central; review data lives in an application datastore; no documented decision-centered comprehension and cross-lens adjudication. |
| Pinjot | Judgment bottleneck, proof, anchored critique, rerun, builder decision. [Source](https://pinjot.com/) | Reviews completed agent work and heterogeneous proof rather than a pre-build Markdown decision proposal. |
| Kialo / Loomio | Structured dissent, candidate suggestions, reasons, deliberation, and durable outcomes. [Kialo](https://support.kialo-edu.com/en/hc/tips-for-students/), [Loomio](https://help.loomio.com/en/user_manual/polls/intro_to_decisions/index.html) | Primarily multi-human argumentation and governance, not AI review lenses serving one accountable owner. |
| MADR | Repository-native Markdown decision record with context, alternatives, rationale, and consequences. [Source](https://adr.github.io/madr/decisions/adr-template.html) | Captures a decision but does not generate or deliberate over findings. |

## What appears meaningfully distinct—and what does not

The following are **not** credible standalone distinctions after this scan:

- “See a decision from multiple AI perspectives.” Decidi, Perspektiv, Microsoft Researcher, and open council/debate implementations already do this in different forms. [Decidi](https://decidi.ai/how-it-works), [Perspektiv](https://perspektiv.ai/), [Microsoft Researcher](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-multi-model-intelligence-in-researcher/4506011), [AutoGen debate](https://microsoft.github.io/autogen/dev/user-guide/core-user-guide/design-patterns/multi-agent-debate.html)
- “Review agent-authored Markdown with inline comments and suggestions.” Roughdraft, markupmarkdown, and CriticMarkup cover substantial parts of that surface. [Roughdraft](https://www.roughdraft.md/), [markupmarkdown](https://github.com/jonradoff/markupmarkdown), [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit)
- “Keep the human in control.” Google Docs, GitHub, markupmarkdown, Pinjot, and other review systems already make human disposition or approval central. [Google Docs](https://support.google.com/docs/answer/6033474?hl=en), [GitHub](https://docs.github.com/en/pull-requests/get-started/reviewing-pull-requests-quickstart), [markupmarkdown](https://github.com/jonradoff/markupmarkdown), [Pinjot](https://pinjot.com/)
- “Produce a defensible decision record.” MADR and Loomio already encode alternatives, reasons, consequences, participation, and outcomes. [MADR](https://adr.github.io/madr/decisions/adr-template.html), [Loomio](https://help.loomio.com/en/user_manual/polls/outcomes/index.html)

The **combination** below was not documented as one product contract in the reviewed sample:

1. The object being evaluated is the **underlying pre-build product or feature decision**, not merely prose quality or a completed agent run.
2. A long repository-native Markdown proposal is first transformed into a **decision-oriented comprehension model**: proposed call, assumptions, evidence, alternatives, trade-offs, risks, and unknowns.
3. Review mandates work independently over both the document and repository context, producing **candidate findings rather than a verdict or authoritative note**.
4. The accountable human can inspect, question, expand, dismiss, merge, or promote those candidates into a **model-agnostic, self-contained review protocol** anchored to the source.
5. Synthesis preserves agreement and dissent without transferring the decision to a chair model, council vote, or committee.
6. The workflow ends with a durable decision record and clean handoff, rather than performing the build or managing delivery.

This is a potentially coherent systems-level distinction, but the scan cannot establish that customers perceive the combination as valuable, that self-contained protocol storage is preferable to application storage, or that the additional workflow produces better decisions.

## Strategy questions made sharper by the landscape

The research does not answer these questions; it makes them precise enough for later Wayfinder tickets:

1. **Decision-oriented summary:** Is the primary orientation artifact a conventional document/section summary, or a normalized model of the decision—call, evidence, assumptions, options, dependencies, and unknowns? NotebookLM already sets a high bar for generic source summary and citation.
2. **Lens contract:** Is a lens primarily a recognizable executive role, an explicit evaluation rubric, a repository-owned policy, or a combination? Persona-first products are abundant, while Anthropic's critique patterns suggest clear criteria are the operative mechanism.
3. **Independence:** Must lenses produce sealed first passes before seeing one another, and is model diversity required or optional? Current products use both persona diversity and model-provider diversity, but this scan found no independent evidence that either alone improves product decisions.
4. **Candidate lifecycle:** What are the exact transitions between generated finding, explored finding, promoted canonical Note, dismissed noise, and superseded/merged finding? Kialo, Google Docs, and markupmarkdown all demonstrate the value of a pending state before canonical change.
5. **Synthesis authority:** Does synthesis only organize evidence and disagreement for the owner, or may it recommend a call? Decidi chooses a system verdict; Microsoft Council preserves side-by-side outputs; Markwise's current map reserves authority for the human.
6. **Evidence classes:** How visibly should the system distinguish source-supported fact, repository inference, lens judgment, contradiction, missing evidence, and unverifiable external claim? Citation alone does not resolve these epistemic categories.
7. **Persistence boundary:** Which state must remain in the Markdown protocol, and which state—summaries, generated candidates, dismissed noise, lens runs, provenance—may live in a workspace? Roughdraft favors in-file review data; markupmarkdown uses application storage; both remain agent-accessible.
8. **Decision record:** Is the record generated incrementally from promoted findings or composed only at the end? MADR shows the useful final fields; Loomio shows why the outcome should remain linked to the deliberation.
9. **Validation:** What observable result would show improvement: faster orientation, higher useful-finding yield, discovery of a decision-changing unknown, fewer late reversals, clearer rationale, or owner confidence calibrated to evidence? None of the reviewed product claims answers this for Markwise's wedge.

## Resolution gist

Current tools separately—and sometimes directly—cover long-document comprehension, AI councils, structured deliberation, Markdown review, human approval, and decision records. Markwise's potentially distinct seam is a repository-native, decision-centric workflow in which independent lenses produce non-authoritative candidates that one accountable owner adjudicates through an embedded review protocol into a durable decision record; that seam still requires product validation and sharper choices about lenses, synthesis, persistence, and measurement.

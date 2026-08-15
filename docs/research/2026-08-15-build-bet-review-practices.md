# How software teams evaluate product and feature build bets

**Date:** 2026-08-15

**Scope:** Selected first-party small-team practices plus team-level mechanisms from larger software organizations, before a meaningful build commitment

**Question:** How do teams evaluate product and feature build bets, what artifacts and evidence do they use, where do they fail, and what changes when AI can reduce some implementation work?

## Executive answer

Across the cases, the recurring mechanism is not a universal score or a large approval meeting. It is a staged reduction of uncertainty around a written proposal:

1. identify the customer problem and the locus of decision authority;
2. classify how costly, consequential, and reversible the commitment is;
3. shape a bounded solution or a small set of alternatives;
4. attach evidence and make uncertainty explicit;
5. invite focused challenge from people with different knowledge;
6. make the call through an explicit authority model; and
7. use a prototype, spike, limited release, or success measure to learn before expanding the commitment.

Basecamp's pitch and betting table, Amazon's PR/FAQ, GitLab's Opportunity Canvas and validation track, Linear's project spec, and Atlassian's DACI document differ in ceremony, but all separate the proposal from the act of committing resources and give reviewers something concrete to interrogate. [Basecamp](https://basecamp.com/shapeup/1.5-chapter-06), [Amazon](https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2024-letter-to-shareholders), [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#opportunity-canvas), [Linear](https://linear.app/method/write-issues-not-user-stories), [Atlassian](https://www.atlassian.com/team-playbook/plays/daci)

The strongest shared standard is not “prove this idea is right.” It is “show that this is the right-sized next commitment given the problem, evidence, alternatives, unknowns, and downside.” Amazon explicitly varies decision depth by reversibility; Basecamp varies the bet between a shaped feature, a time-boxed R&D spike, and a production commitment; PostHog treats a minimal build as part of learning rather than as proof that a full product deserves investment. [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/), [Basecamp](https://basecamp.com/shapeup/2.3-chapter-09), [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build)

Direct evidence of AI inside build-bet evaluation is limited but not absent. AWS documents a four-person startup team using generative AI throughout a Working Backwards workshop—from customer-problem framing and option ranking through a PR/FAQ and generated mock—with human user interviews between two AI-assisted iterations. Separate delivery evidence shows why judgment may become more salient: an OpenAI team estimates that an agent-generated product took roughly one-tenth its expected hand-coding time and then identifies human QA capacity and attention as bottlenecks; DORA reports a positive association between AI adoption and delivery throughput alongside a negative association with delivery stability. [AWS/StudyPocket](https://aws.amazon.com/jp/blogs/startup/ml-enablement-workshop-studypocket-2026/), [OpenAI](https://openai.com/index/harness-engineering/), [DORA report](https://dora.dev/research/2025/dora-report/)

METR's randomized study is a task-level counterexample, not the “opposite” of DORA's organization-level association: 16 experienced open-source developers took 19% longer on 246 tasks with early-2025 AI tools even while believing they were faster. Throughput, task duration, delivery stability, and monetary cost are different outcomes; the evidence does not justify one universal “building is cheap” multiplier. [METR](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf), [DORA methodology and report](https://dora.dev/research/2025/dora-report/)

This research does **not** select Markwise's first wedge. It makes artifact-centered decision review a candidate hypothesis, identifies adaptive review depth and evidence-grounded challenge as relevant mechanisms, and leaves Markdown demand, a single-owner governance model, automated-lens value, and the decision-record boundary to be validated or settled in the [strategy map](https://github.com/farandclose/markwise/issues/12).

## Method and limits

This is a purposive comparison of public first-party practices and primary research, not a representative survey of all small and midsize software companies. The organizational cases were chosen because they expose concrete artifacts, roles, or workflows: Basecamp, Linear, PostHog, Intercom, GitLab, Atlassian, Amazon, StudyPocket via AWS, Anthropic, and OpenAI. The AI section adds DORA's survey research and METR's randomized field experiment to counterbalance vendor and company self-reports.

Company-authored accounts document what their authors say they practice and why; they do not independently establish adoption, effectiveness, industry prevalence, or causal superiority. OpenAI's speed and throughput figures are internal estimates and observations from an unusually agent-optimized repository, and OpenAI explicitly warns that its autonomy results should not be assumed to generalize without similar investment. [OpenAI](https://openai.com/index/harness-engineering/)

For this report:

- **AI-assisted workflow** means the team uses AI during discovery, specification, coding, review, or analysis, regardless of what the shipped product does.
- **Agent-first or AI-native delivery workflow** means the repository, tests, context, and work orchestration are deliberately designed so agents execute substantial parts of delivery.
- **AI product or feature** means the customer-facing offering contains AI. That fact alone says nothing about how the team evaluates or builds it.

The ticket concerns the first two meanings. A team building ordinary billing software with coding agents belongs in scope; a team hand-coding an AI chatbot is not AI-native in this workflow sense.

### Case-context boundary

| Source group | Unit actually represented | How it is used here |
| --- | --- | --- |
| Basecamp | A four-person betting table and two-to-three-person build teams inside one product company. [Source](https://basecamp.com/shapeup/2.2-chapter-08) | Direct small-team operating account. |
| PostHog | Small product teams that vote on features, followed by an individual owner; new products were tested in one-to-three-person hackathon teams. [Source](https://newsletter.posthog.com/p/how-we-decide-what-to-build) | Direct startup/small-team account and an explicit counterexample to sole-person selection authority. |
| StudyPocket/AWS | One startup product manager and three engineers in an AWS-facilitated AI/Working Backwards workshop. [Source](https://aws.amazon.com/jp/blogs/startup/ml-enablement-workshop-studypocket-2026/) | Direct but single-case evidence of AI-assisted product/feature evaluation; the company also builds an AI product, so workflow and product are both AI-related here. |
| Linear and Intercom | Company-authored product practices; the cited pages do not establish the size of every team applying them. [Linear](https://linear.app/method/introduction), [Intercom](https://www.intercom.com/blog/team-alignment-framework/) | Transferable artifact and evidence vocabulary, not small-company prevalence evidence. |
| GitLab, Atlassian, and Amazon | Organization-level playbooks from large companies; Amazon describes autonomous teams of ten or fewer, and Atlassian sizes the DACI exercise for three to six participants. [GitLab](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/), [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/), [Atlassian](https://www.atlassian.com/team-playbook/plays/daci) | Team-level mechanisms that may transfer; not evidence that an SMB operates like the parent enterprise. |
| Anthropic and OpenAI | Internal model-vendor teams, including OpenAI's unusually agent-optimized three-then-seven-engineer experiment. [Anthropic](https://claude.com/blog/how-anthropic-teams-use-claude-code), [OpenAI](https://openai.com/index/harness-engineering/) | Boundary cases for AI-assisted/agent-first work, not median-team benchmarks. |
| DORA and METR | Cross-organization survey/qualitative research and a 16-developer randomized field experiment, respectively. [DORA](https://dora.dev/research/2025/dora-report/), [METR](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf) | Quantitative constraints with different units and outcome measures. |

## What teams actually do before committing

### 1. Calibrate the decision before reviewing it

The case studies deliberately avoid applying the same ceremony to every choice. Amazon distinguishes one-way doors, whose consequences are difficult to reverse and merit deeper analysis, from two-way doors such as an A/B-tested feature, where acting with incomplete information can be the faster way to learn. Its small, single-threaded “two-pizza teams” have end-to-end ownership and metrics, pushing reversible decisions close to the people with customer context. [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/)

Basecamp makes the same calibration in operational terms. Existing-product features can be shaped and bet for a cycle; an uncertain new product enters R&D mode, where the team bets only a time box on learning through spikes and does not promise a shippable result. Even its long-running HEY effort was renewed one cycle at a time rather than approved as a two-year master commitment. [Basecamp](https://basecamp.com/shapeup/2.3-chapter-09)

These cases make **reversibility, downside, and the next learning threshold** candidate review inputs. When a probe is genuinely cheap and reversible, its ceremony can be lighter; reduced coding time does not remove security exposure, customer-trust loss, migration cost, operational load, or a hard-to-reverse product direction. This is an inference from Amazon's reversibility model and DORA's reported association between AI-assisted throughput and downstream instability. [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/), [DORA](https://dora.dev/research/2025/dora-report/)

### 2. Reframe a requested feature as a problem

Linear tells product builders to ask what use case and pain lie behind a requested feature, because users naturally propose solutions from the product they already know. That reframing makes multiple solutions possible and lets the team judge whether the pain is strategically valuable or merely nice to have. [Linear](https://linear.app/method/build-with-users)

GitLab is even more direct: a product manager should not simply implement a feature request, but should investigate the underlying use case because an existing or more elegant solution may already exist. Its validation track seeks a documented, understood customer problem before the build track, while allowing teams to shorten validation when confidence is already high. [GitLab product processes](https://handbook.gitlab.com/handbook/product/product-processes/#working-with-customer-feature-proposals), [GitLab product-development flow](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/)

PostHog's user-research account separates **problem exploration** from **solution validation** and recommends concrete evidence about a person's current workflow, frequency, importance, and difficulty. It warns that explaining a proposed solution biases the conversation and that requested solutions often do not address the underlying cause. [PostHog](https://newsletter.posthog.com/p/talk-to-users)

### 3. Turn the idea into a reviewable artifact

The artifacts differ in shape, but each is designed to surface a different class of missing reasoning:

| Practice | Primary artifact | What it makes explicit before commitment |
| --- | --- | --- |
| Basecamp Shape Up | A pitch | Problem, appetite, rough solution, rabbit holes, and explicit no-gos; readers comment asynchronously to poke holes before a small betting table makes the call. [Source](https://basecamp.com/shapeup/1.5-chapter-06) |
| Amazon Working Backwards | PR/FAQ | Customer benefit in a short imagined press release, then hard questions about target customers, disappointments, alternatives, launch scope, pricing, and architecture. [Source](https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2024-letter-to-shareholders) |
| GitLab validation track | Opportunity Canvas plus issue/epic | User pain, business value, problem constraints, hypotheses, confidence, lessons, and prioritization rationale; leadership reviews questions in the canvas before discussion. [Source](https://handbook.gitlab.com/handbook/product/product-processes/#opportunity-canvas) |
| Linear Method | Short project spec | Why, what, and how at project level; the owner gathers cross-functional feedback before implementation planning and code. [Source](https://linear.app/method/write-issues-not-user-stories) |
| Atlassian DACI | A decision document | Decision question, one approver, contributors, relevant data, decision factors, options, pros and cons, costs, actions, outcome, and final rationale. [Source](https://www.atlassian.com/team-playbook/plays/daci) |
| Intercom RICE | A scoring sheet | Reach, impact, confidence, and effort across competing ideas; Intercom cautions that the score is not a hard rule and that dependencies and table stakes can override ordering. [Source](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/) |

These artifacts serve different jobs. A pitch or PR/FAQ makes one bet intelligible; an Opportunity Canvas develops confidence in a problem; DACI makes authority and alternatives explicit; RICE compares a portfolio. Treating all of them as interchangeable “PRDs” would lose the particular question each is designed to answer. This classification is a synthesis of the cited first-party descriptions.

### 4. Challenge from distinct knowledge, then make authority explicit

Cross-functional review recurs in these examples, but decision authority varies. Basecamp's betting table combines its CEO, CTO, a senior programmer, and a product strategist; the pitch is read in advance, people contribute missing information asynchronously, and its CEO has the last word. Basecamp also observes that whether a problem matters can look different from support, product, technical, or business vantage points. [Basecamp betting table](https://basecamp.com/shapeup/2.2-chapter-08), [Basecamp questions](https://basecamp.com/shapeup/2.3-chapter-09)

Atlassian's DACI formalizes the boundary: subject-matter contributors make recommendations, but exactly one approver decides. The driver gathers the information; contributors have a voice, not a vote. [Atlassian](https://www.atlassian.com/team-playbook/plays/daci)

PostHog uses a different governance model: a small team votes to choose one to three features, and an individual owner becomes responsible after selection. GitLab assigns DRIs by phase and asks leadership and UX participants to add questions directly to an Opportunity Canvas before review. Linear gives a project owner responsibility for the spec and feedback, but its cited practice does not name that person as the sole final approver. [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build), [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#opportunity-canvas), [Linear](https://linear.app/method/write-issues-not-user-stories)

| Practice | Selection authority | Ownership after selection |
| --- | --- | --- |
| Basecamp | A four-person betting table deliberates; the CEO is the last word. [Source](https://basecamp.com/shapeup/2.2-chapter-08) | A named small build team receives the bet. |
| Atlassian DACI | Exactly one approver decides after contributors recommend. [Source](https://www.atlassian.com/team-playbook/plays/daci) | The decision document records outcome and follow-up; DACI itself does not prescribe one implementation owner. |
| PostHog | Team members vote; two or three votes can select a feature. [Source](https://newsletter.posthog.com/p/how-we-decide-what-to-build) | One product engineer owns validation, implementation, follow-up, and ongoing success. |
| Amazon | Reversible decisions are pushed to autonomous teams; harder-to-reverse decisions receive more methodical treatment. [Source](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/) | A small, single-threaded team owns its service and customer outcomes. |
| GitLab | Phase-specific DRIs prioritize and move work; the cited flow allows more than one DRI across phases. [Source](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/) | Product, design, and engineering roles share the validation/build flow. |
| Linear | A project owner writes the spec and gathers feedback; the cited method is silent on a sole final approver. [Source](https://linear.app/method/write-issues-not-user-stories) | The owner remains responsible for project communication and delivery. |

The shared pattern is **clarity about where recommendation stops and commitment begins**, not universally one human approver. Markwise's strategy map has already chosen one accountable decision owner; that is compatible with Basecamp and DACI, but this research does not establish it as the only model used by small software teams.

#### Team-level accounts compress roles, not decision questions

The team-level accounts use few people and lightweight artifacts. Basecamp's betting table has four members and assigns a bet to a designer plus one or two programmers. PostHog reports validating new products in one-to-three-person hackathon teams and makes one owner responsible for validation, implementation, follow-up, and ongoing success. Linear similarly requires one named project owner even when designers, engineers, and customer-facing colleagues contribute. [Basecamp](https://basecamp.com/shapeup/2.2-chapter-08), [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build), [Linear](https://linear.app/method/introduction)

Amazon is a large company, but its relevant unit is explicitly a small, single-threaded team of ten or fewer with end-to-end customer ownership. GitLab's larger-company validation flow is more explicit, yet it lets teams skip or shorten phases that do not improve confidence. [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/), [GitLab](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/)

These lean team structures suggest that a small team may lack a separate Head of Product, CTO, Head of Marketing, security leader, or finance partner while still needing the questions those functions would ask. They motivate a testable Markwise hypothesis: a lens could encode an evaluative mandate without assuming the title exists or impersonating an absent executive. Whether that mechanism surfaces better questions than a generic review remains unproven. This is an inference from the documented structures at [Basecamp](https://basecamp.com/shapeup/2.2-chapter-08), [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build), and [Linear](https://linear.app/method/introduction).

### 5. Commit to the next evidence-producing step, not always the final product

PostHog explicitly treats testing as part of decision-making: one-to-three-person hackathon teams build MVPs to learn whether anyone cares and how costly a fuller build may be. Its product choices combine user feedback, metrics, experience, product principles, and opinion rather than relying on a document alone. [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build)

Basecamp's R&D mode similarly uses code and interface spikes to learn what the product should be, while limiting each commitment to one cycle. GitLab recommends technical spikes whose goal is the minimum code needed to answer a question, usually discarding that code afterward; its build track then releases minimal changes, measures customer and technical outcomes, and may abandon a solution that misses the intended KPIs. [Basecamp](https://basecamp.com/shapeup/2.3-chapter-09), [GitLab product processes](https://handbook.gitlab.com/handbook/product/product-processes/#spikes), [GitLab product-development flow](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/)

This is the most important caveat to a purely “pre-build” product category: for many uncertain or reversible bets, a small build is itself evidence. The meaningful boundary is often **before a larger commitment to production, rollout, maintenance, or strategic direction**, not before the first line of exploratory code.

## The evidence decision owners seek

Across the cases, a defensible bet draws from an evidence stack rather than one master metric:

| Evidence class | Questions it answers | First-party examples |
| --- | --- | --- |
| Customer problem | Who experiences the problem, in what workflow, how often, and with what current workaround or pain? | PostHog's problem interviews; GitLab's problem validation; Linear's feature-request reframing. [PostHog](https://newsletter.posthog.com/p/talk-to-users), [GitLab](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/), [Linear](https://linear.app/method/build-with-users) |
| Demand and reach | How many relevant users or events are affected, and what observed signals support that estimate? | Intercom recommends product metrics for reach and user research for impact; PostHog uses usage, support, and customer conversations. [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/), [PostHog](https://newsletter.posthog.com/p/talk-to-users) |
| Strategic and market fit | Does this reinforce product direction, differentiation, or a timely company objective; what alternatives already exist? | Intercom evaluates innovation, investment, and urgency; Amazon's FAQ asks why the proposal beats current alternatives. [Intercom](https://www.intercom.com/blog/team-alignment-framework/), [Amazon](https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2024-letter-to-shareholders) |
| Option quality | Is the proposed solution a plausible fit for the problem; what alternatives and explicit exclusions were considered? | Basecamp requires problem, solution, and no-gos; DACI records options with pros and cons. [Basecamp](https://basecamp.com/shapeup/1.5-chapter-06), [Atlassian](https://www.atlassian.com/team-playbook/plays/daci) |
| Feasibility and system fit | What technical assumptions, dependencies, architectural choices, edge cases, scalability, performance, compatibility, and maintainability concerns exist? | Basecamp searches for technical rabbit holes; GitLab requires foundational requirements; Amazon's FAQ asks why architectural choices were made. [Basecamp](https://basecamp.com/shapeup/1.4-chapter-05), [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#foundational-requirements), [Amazon](https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2024-letter-to-shareholders) |
| Economics and appetite | What people, time, and money is the next commitment worth, and what opportunity cost or cross-team dependency does it create? | Basecamp sets an appetite instead of an open-ended estimate; Intercom's RICE and alignment frameworks include effort and investment; DACI records resource and financial cost. [Basecamp](https://basecamp.com/shapeup/1.2-chapter-03), [Intercom RICE](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/), [Intercom alignment](https://www.intercom.com/blog/team-alignment-framework/), [Atlassian](https://www.atlassian.com/team-playbook/plays/daci) |
| Confidence and unknowns | Which statements are measured facts, qualitative signals, estimates, assumptions, or unanswered questions? What evidence would change the call? | GitLab evolves confidence, hypotheses, and lessons in the Opportunity Canvas; Intercom explicitly discounts weakly supported reach or impact through confidence. [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#opportunity-canvas), [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/) |
| Reversibility and downside | If wrong, can the team cheaply undo the choice; what trust, security, operational, migration, or maintenance burden survives? | Amazon's one-way/two-way-door model; Basecamp's circuit breaker and no-gos. [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/), [Basecamp](https://basecamp.com/shapeup/2.2-chapter-08) |
| Learning and success | What observable outcome makes the next bet successful, invalidated, or ready for expansion? | GitLab measures an MVC against product and engineering KPIs; PostHog uses prototypes, analytics, user feedback, and reference customers. [GitLab](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/), [PostHog](https://newsletter.posthog.com/p/talk-to-users) |

The sources repeatedly mix quantitative and qualitative evidence. Intercom's own RICE example combines product metrics, user research, and engineering estimates, while warning that its score should not be a hard rule. PostHog explicitly combines qualitative feedback, analytics, experience, principles, and judgment. This supports testing whether a decision workspace can expose the provenance and confidence of evidence more usefully than forcing incomparable concerns into a single pseudo-objective number. [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/), [PostHog](https://newsletter.posthog.com/p/talk-to-users)

## Recurring failure modes

### Solution-first commitment

A feature request is accepted as the problem definition, so the team validates enthusiasm for its own proposed solution instead of investigating the underlying job or current behavior. Linear, GitLab, and PostHog all call out this trap. [Linear](https://linear.app/method/build-with-users), [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#working-with-customer-feature-proposals), [PostHog](https://newsletter.posthog.com/p/talk-to-users)

### Hidden rabbit holes and optimistic completeness

The document presents a smooth happy path while leaving technical unknowns, unsolved design problems, interdependencies, edge cases, or exclusions for the build team to discover under deadline. Basecamp describes abandoning a redesign after assuming that a viable design would emerge during the cycle and now explicitly probes such holes before betting. [Basecamp](https://basecamp.com/shapeup/1.4-chapter-05)

### Effort or output masquerading as value

Teams can optimize for what is easy to estimate or count: engineering effort, task completion, shipped features, or pull-request volume. Intercom frames effort as only one factor alongside reach, impact, and confidence; OpenAI's Symphony account says it had initially oriented around coding sessions and merged pull requests even though those are means to deliverables. [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/), [OpenAI](https://openai.com/index/open-source-codex-orchestration-symphony/)

### False precision and score laundering

A numerical prioritization score can conceal unsupported estimates or make a judgment call look mechanical. Intercom's RICE guidance explicitly asks teams to use real measurements where possible, represent confidence, revisit surprising scores, and override ranking for dependencies or table stakes. [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/)

### Unclear or mismatched authority

DACI is designed to prevent a passive “rubber stamp” approver by naming one active decision maker and separating contributors' recommendations from authority; Basecamp similarly makes its CEO the last word at its betting table. PostHog is an important counterexample: its team votes on features before an individual takes delivery ownership. The failure is not “more than one person participated”; it is ambiguity or a mismatch between the advertised and actual decision rule. [Atlassian](https://www.atlassian.com/team-playbook/plays/daci), [Basecamp](https://basecamp.com/shapeup/2.2-chapter-08), [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build)

### A document that is either too thin or too burdensome

Words alone may be too abstract to reveal the proposed interaction, but high-fidelity detail can distract review into premature implementation choices. Basecamp uses rough but concrete sketches for that middle ground. Linear argues that brief specs are more likely to be read, while Amazon caps its narrative body and uses a short press release plus FAQ to distill rather than display all prior work. [Basecamp](https://basecamp.com/shapeup/1.5-chapter-06), [Linear](https://linear.app/method/introduction), [Amazon](https://www.aboutamazon.com/news/workplace/an-insider-look-at-amazons-culture-and-processes)

### Treating every bet as irreversible

Heavy approval for low-cost, reversible experiments creates delay that can exceed the downside of trying them. Amazon's two-way-door practice and PostHog's minimal-build approach both prefer bounded action when it produces stronger evidence. [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/), [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build)

### Treating a prototype as market proof

A working prototype answers “can this be made?” and may improve a solution-validation conversation; it does not by itself establish demand, strategic fit, safe operation, or willingness to sustain the product. PostHog names separate learning questions for its minimal builds, GitLab continues to measure customer and technical outcomes after an MVC, and DORA reports that higher AI adoption can associate with both more throughput and less delivery stability. [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build), [GitLab](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/), [DORA](https://dora.dev/research/2025/dora-report/)

## What AI-assisted evaluation and agent-first delivery show

### Direct evaluation evidence: a four-person startup case

AWS reports that StudyPocket sent one product manager and three engineers—each already using Claude Code or Cursor—to a two-day Working Backwards workshop. The team used prepared prompts and parallel coding agents across five stages: mapping a customer journey, defining and ranking problem questions, combining candidate solutions, drafting a customer and internal PR/FAQ, generating a mock application, and defining decision milestones. The humans refined AI outputs with domain knowledge rather than accepting them as authority. [AWS/StudyPocket](https://aws.amazon.com/jp/blogs/startup/ml-enablement-workshop-studypocket-2026/)

Between workshop days, the team interviewed teachers and education-board staff. Those observations shifted the proposal away from technically ambitious agent concepts toward a simpler teacher-configured prompt feature; the team then reran the process and later announced the feature. This is unusually direct evidence of AI assisting a feature-bet workflow, but it remains one vendor-facilitated account, the participating startup itself sells an AI product, and the article does not compare the process with a non-AI control. [AWS/StudyPocket](https://aws.amazon.com/jp/blogs/startup/ml-enablement-workshop-studypocket-2026/)

Anthropic provides a weaker but relevant design-stage example: its product designers use Claude Code to prototype from Figma and to map logic flows, error states, and edge cases before development. Beyond these cases, this search did not find primary evidence that small software teams routinely use autonomous multi-role reviewers to make product investment calls. Markwise's automated-lens concept therefore remains a hypothesis to test, not a demonstrated category norm. [Anthropic](https://claude.com/blog/how-anthropic-teams-use-claude-code)

### Company accounts of delivery compression and broader prototyping access

Anthropic reports that product designers use Claude Code to turn designs into tested prototypes, explore abstract problems, and map error states and logic flows before development; non-engineering teams also create internal tools without dedicated developer resources. Anthropic's own conclusion is that its strongest teams use the tool as a thought partner around human workflows, not only as a code generator. [Anthropic](https://claude.com/blog/how-anthropic-teams-use-claude-code)

OpenAI's agent-first product experiment reports roughly one million lines across about 1,500 pull requests, initially driven by three engineers, and estimates the product took about one-tenth the time of hand coding. In that environment, humans shifted toward specifying intent, prioritizing work, translating user feedback into acceptance criteria, and validating outcomes. [OpenAI](https://openai.com/index/harness-engineering/)

These company reports illustrate claimed high-throughput cases in favorable environments; they do not independently establish typical cost reduction or median-team outcomes.

### Human attention and review become more visibly scarce

The OpenAI team says rising throughput made human QA capacity the bottleneck. Its later Symphony account says agents were fast but engineers could comfortably supervise only a few concurrent sessions before context switching hurt productivity; the system was redesigned around deliverables, explicit task state, automated guardrails, and human review of outcomes. [OpenAI harness engineering](https://openai.com/index/harness-engineering/), [OpenAI Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/)

DORA's 2025 research, based on nearly 5,000 survey respondents and more than 100 hours of qualitative data, reports that AI amplifies the surrounding system: user-centricity, clear workflows, strong testing, version control, internal platforms, and fast feedback loops are associated with better outcomes, while AI adoption had a negative relationship with delivery stability. These are observational associations, not a randomized estimate of AI's causal effect. [DORA announcement](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report), [report and methodology](https://dora.dev/research/2025/dora-report/)

For build-bet review, this shifts attention from “how many developer-days will coding take?” toward “what human judgment, evaluation, integration, safety, maintenance, and opportunity cost will this create?” That is an inference from the OpenAI and DORA evidence, not a claim that implementation effort disappears.

### Perceived speed is not reliable evidence of actual speed

METR randomized 246 real tasks from mature open-source repositories across 16 experienced contributors. With early-2025 tools allowed, participants took 19% longer even though they forecast a 24% speedup beforehand and estimated a 20% speedup afterward. The authors caution that the result is specific to experienced developers, familiar repositories, and the tools available in that period. [METR](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf)

The useful decision practice is therefore to treat AI leverage as an evidence-backed assumption for the particular team, repository, and task—not as a fixed multiplier in an effort score. Actual cycle time, review time, rework, defects, and operational outcomes are stronger evidence than the felt ease of producing code. The first sentence follows directly from METR's context-sensitive result; the second is an inference consistent with DORA's system-level findings. [METR](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf), [DORA](https://dora.dev/research/2025/dora-report/)

### Repository context becomes part of the decision environment

OpenAI's agent-first team treats structured repository documentation as the system of record because context hidden in chat or people's heads is unavailable to a running agent. It uses a short map that points to deeper product, architecture, plan, quality, reliability, and security material; the team reports that a single monolithic instruction document crowded out task context, rotted quickly, and was hard to verify. [OpenAI](https://openai.com/index/harness-engineering/)

For Markwise, this makes repository context a candidate hypothesis rather than a research conclusion: the OpenAI evidence concerns delivery agents, not product-decision review. A useful test would compare progressive, relevant retrieval with traceable sources against both document-only review and whole-repository context. This test design is an inference from OpenAI's documented failure with one monolithic instruction file.

### Faster reported building makes a review tax easier to reject

PostHog's small-team account explicitly criticizes multi-stage decision processes that disconnect builders from users and uses minimal builds to learn on demand. Amazon says reversible decisions should move quickly with less-than-complete information. This suggests a falsification criterion for any candidate decision workspace: if it cannot surface material blind spots faster or more reliably than a prototype, user conversation, or direct expert review, it adds review tax without demonstrated value. [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build), [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/)

## Candidate hypotheses for Markwise's strategy—not conclusions

The [strategy map](https://github.com/farandclose/markwise/issues/12) already fixes repository-native Markdown, one accountable decision owner, candidate rather than authoritative findings, and a clean handoff without execution as current product constraints. This research treats those as inputs; it does not relabel them as findings. The matrix below separates supporting observations from counterevidence or evidence gaps and proposes tests that could turn each candidate into a strategy decision.

| Candidate hypothesis | Supporting observations | Counterevidence or limit | What would validate or reject it |
| --- | --- | --- | --- |
| **An existing proposal should be the entry point.** Orient the owner to the decision, evidence, assumptions, alternatives, conflicts, and unresolved questions in a bounded artifact. | Basecamp, Amazon, GitLab, and Linear all review a concrete pitch, PR/FAQ, canvas, or short project spec before a larger commitment. [Basecamp](https://basecamp.com/shapeup/1.5-chapter-06), [Amazon](https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2024-letter-to-shareholders), [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#opportunity-canvas), [Linear](https://linear.app/method/write-issues-not-user-stories) | The reviewed sources do not test whether Markdown is common enough in Markwise's target segment, whether document orientation is the acute pain, or whether teams will insert a new review workspace. | Inventory real target-team artifacts; observe the current review; compare time-to-orientation and material gaps found with and without Markwise. |
| **Review depth should adapt to the bet's reversibility and downside.** | Amazon gives one-way-door decisions more analysis than reversible experiments; Basecamp distinguishes shaped production bets from time-boxed R&D learning bets. [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/), [Basecamp](https://basecamp.com/shapeup/2.3-chapter-09) | Classification can itself add overhead, and a supposedly reversible release can still create trust, security, migration, or operational costs. The sources do not provide a reusable threshold for Markwise. | Measure review time and material decision changes across low- and high-consequence bets; test whether owners agree with the system's depth recommendation. |
| **Automated lenses should carry explicit evaluative mandates, not synthetic executive authority.** | Basecamp, Amazon, Intercom, and GitLab solicit distinct technical, customer, business, and operational knowledge; StudyPocket used AI as a thought partner while humans refined its outputs. [Basecamp](https://basecamp.com/shapeup/2.3-chapter-09), [Amazon](https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2024-letter-to-shareholders), [Intercom](https://www.intercom.com/blog/team-alignment-framework/), [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#foundational-requirements), [AWS/StudyPocket](https://aws.amazon.com/jp/blogs/startup/ml-enablement-workshop-studypocket-2026/) | This search found no primary comparative evidence that autonomous, role-labelled reviewers make better investment calls than a generic model, a checklist, or direct human expertise. | Run blinded comparisons; count relevant non-obvious findings, false positives, proposal changes, and decision changes attributable to each review mode. |
| **Decision-centric, layered comprehension may be more useful than a free-standing summary.** | Amazon pairs a short press release with a longer FAQ; Basecamp and Linear use concise pre-reads with sketches or deeper links; GitLab retains an evolving source of truth. [Amazon](https://www.aboutamazon.com/news/workplace/an-insider-look-at-amazons-culture-and-processes), [Basecamp](https://basecamp.com/shapeup/1.5-chapter-06), [Linear](https://linear.app/method/write-issues-not-user-stories), [GitLab](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/) | None of these sources shows that long-document comprehension is the primary pain for the intended user or that the proposed layers outperform ordinary navigation and search. | Compare comprehension, recall, time to a defensible call, and source-verification accuracy across full-document, generic-summary, and decision-view conditions. |
| **Repository context may improve review specificity if retrieval is selective and traceable.** | OpenAI reports that delivery agents need accessible in-repository product, architecture, quality, security, and plan context, and that one monolithic instruction file crowded out task context and decayed. [OpenAI](https://openai.com/index/harness-engineering/) | The evidence concerns delivery agents, not product-decision reviewers. Repository material may be stale, noisy, contradictory, or irrelevant. | Compare cited-claim correctness, generic-feedback rate, contradictions with prior decisions, and reviewer trust with document-only versus selectively retrieved repository context. |
| **Authority should remain explicit, while the one-owner model remains a chosen constraint.** | Basecamp's CEO has the last word and DACI uses exactly one approver; both separate contribution from commitment and record the decision context. [Basecamp](https://basecamp.com/shapeup/2.2-chapter-08), [Atlassian](https://www.atlassian.com/team-playbook/plays/daci) | PostHog selects features through a team vote before assigning one owner, while Amazon delegates reversible decisions to teams. The evidence supports authority clarity, not universal sole-person selection. [PostHog](https://newsletter.posthog.com/p/how-we-decide-what-to-build), [Amazon](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/) | Test the chosen one-owner workflow with the target user; observe whether real collaborators can contribute without ambiguity about who decides. |
| **Findings should expose epistemic status.** Separate sourced claims, customer signals, measurements, estimates, assumptions, contradictions, and unverifiable gaps. | GitLab evolves hypotheses, confidence, and lessons in its canvas; Intercom explicitly discounts priority scores when confidence lacks evidence. [GitLab](https://handbook.gitlab.com/handbook/product/product-processes/#opportunity-canvas), [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/) | More labels can create false precision or review burden, and neither source evaluates this exact taxonomy. | Test whether owners distinguish evidence from inference more accurately and whether the distinctions alter proposals or decisions without unacceptable time cost. |
| **The record should admit several next commitments, not only approve or reject.** Candidate states include build, bounded learning bet, revise, defer, and decline. | Basecamp describes production bets, R&D cycles, reshaping, timing decisions, and dropped ideas; GitLab treats invalidation as useful and may abandon an MVC that misses its outcome. [Basecamp](https://basecamp.com/shapeup/2.3-chapter-09), [GitLab opportunity canvas](https://handbook.gitlab.com/handbook/product/product-processes/#opportunity-canvas), [GitLab flow](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/) | The right vocabulary and number of states for Markwise users remain untested. | Observe how target owners naturally describe real outcomes and whether the recorded state predicts the next action without extra explanation. |
| **A decision record and clean handoff can be the boundary, but the exclusion of execution is strategic rather than research-proven.** | DACI records the outcome, rationale, and follow-up; RICE compares opportunities; Linear initiatives connect projects to goals. These are distinguishable jobs in the cited practices. [Atlassian](https://www.atlassian.com/team-playbook/plays/daci), [Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/), [Linear](https://linear.app/method/product-direction) | The sources do not show that target users want a separate system or that stopping before execution creates a clean rather than fragmented workflow. | Test whether downstream readers can reconstruct the call and act from the handoff, and whether users request execution features to complete the job. |

## Questions the first-wedge decision should still answer

1. **Where is the painful review moment?** Is the owner struggling primarily to read the artifact, detect unsupported reasoning, solicit expertise, reconcile disagreement, or remember why the call was made?
2. **Which artifact already exists in the target team's workflow?** A pitch, PRD, RFC, design doc, or planning issue offers lower adoption friction than requiring a new canonical template.
3. **Which bets warrant the tax?** Does Markwise create net value for medium/high-consequence product and feature commitments while staying out of low-risk two-way-door choices?
4. **Are automated lenses materially additive?** In blind comparison with a generic LLM review or a static checklist, do they surface non-obvious, relevant concerns that change the proposal or decision?
5. **Can the owner control noise?** What false-positive rate is acceptable when every automated output is only a candidate finding?
6. **Does repository context improve correctness?** Do citations to product principles, prior decisions, architecture, research, and constraints reduce generic or contradictory feedback?
7. **Does the workflow preserve speed?** Measure time to orient, time to a defendable call, number of material gaps found, and owner confidence—not number of findings generated.
8. **Does the record remain useful later?** After execution begins, can a teammate reconstruct the call, rationale, accepted trade-offs, dissent, conditions, and open risks without replaying the review?

## Resolution gist

The selected cases evaluate build bets through bounded, evidence-bearing proposals, distinct knowledge inputs, explicit but varied authority models, and commitments calibrated to uncertainty and reversibility. Direct evidence of AI-assisted evaluation includes one four-person startup case; the broader AI evidence mostly concerns delivery and reports context-dependent effects on throughput, attention, and stability. The evidence makes several Markwise concepts testable hypotheses, but it does not establish Markdown demand, universal sole-owner governance, or the superiority of automated role-based lenses.

## Primary sources

- [Basecamp: Principles of Shaping](https://basecamp.com/shapeup/1.1-chapter-02)
- [Basecamp: Risks and Rabbit Holes](https://basecamp.com/shapeup/1.4-chapter-05)
- [Basecamp: Write the Pitch](https://basecamp.com/shapeup/1.5-chapter-06)
- [Basecamp: The Betting Table](https://basecamp.com/shapeup/2.2-chapter-08)
- [Basecamp: Place Your Bets](https://basecamp.com/shapeup/2.3-chapter-09)
- [Linear Method: Principles and Practices](https://linear.app/method/introduction)
- [Linear Method: Build with Users](https://linear.app/method/build-with-users)
- [Linear Method: Write Issues, Not User Stories](https://linear.app/method/write-issues-not-user-stories)
- [PostHog: How We Decide What to Build](https://newsletter.posthog.com/p/how-we-decide-what-to-build)
- [PostHog: An Engineer's Guide to Talking to Users](https://newsletter.posthog.com/p/talk-to-users)
- [GitLab Handbook: Product Development Flow](https://handbook.gitlab.com/handbook/product-development/how-we-work/product-development-flow/)
- [GitLab Handbook: Product Processes](https://handbook.gitlab.com/handbook/product/product-processes/)
- [Atlassian Team Playbook: DACI](https://www.atlassian.com/team-playbook/plays/daci)
- [Intercom: RICE](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/)
- [Intercom: Team Alignment Framework](https://www.intercom.com/blog/team-alignment-framework/)
- [Amazon: 2024 Shareholder Letter](https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2024-letter-to-shareholders)
- [Amazon: Working Backwards and the PR/FAQ](https://www.aboutamazon.com/news/workplace/an-insider-look-at-amazons-culture-and-processes)
- [AWS: Elements of Amazon's Day 1 Culture](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/)
- [AWS Startup: StudyPocket ML Enablement Workshop](https://aws.amazon.com/jp/blogs/startup/ml-enablement-workshop-studypocket-2026/)
- [Anthropic: How Anthropic Teams Use Claude Code](https://claude.com/blog/how-anthropic-teams-use-claude-code)
- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/)
- [OpenAI: Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/)
- [DORA: 2025 State of AI-Assisted Software Development](https://dora.dev/research/2025/dora-report/)
- [Google Cloud: 2025 DORA report announcement and sample description](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report)
- [METR: Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf)

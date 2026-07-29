# Campaign questionnaire — admin UX spec

Wireframe-level spec for `/admin/campaigns/:campaignId#survey`. Read with [`campaign.md`](campaign.md) and [`state.md`](../state.md). Interactive prototype: [`../prototypes/admin-survey-panel.html`](../prototypes/admin-survey-panel.html).

**Pilot goal:** replace Google Forms for end-of-tournament player (51 Q) and coach (43 Q) questionnaires without losing completion tracking or CSV portability.

**Not in scope:** peer-rating `campaign_nps_*`, Telegram send, Word parsing, visual form builder.

---

## Admin core loop

```txt
Upload CSV → preview → commit drafts → publish both templates → open per audience
→ chase non-responders → monitor completion → export CSV → close
```

Google Forms parity requires **completion roster** and **response CSV export** in the same pilot — not a follow-up.

---

## Page placement

- Route: `/admin/campaigns/:campaignId#survey`
- Flag: `VITE_ENABLE_CAMPAIGN_QUESTIONNAIRE` → `campaignCapabilities().campaignQuestionnaire`
- Sits on campaign detail **below roster import**, **above** legacy peer NPS panel (`#nps`) if both flags on
- Dashboard next action when templates published but not open: _"Open end-of-campaign questionnaire when ready"_ → `#survey`

---

## Panel structure (six blocks, top to bottom)

| #   | Block                 | Purpose                                   |
| --- | --------------------- | ----------------------------------------- |
| 1   | **Definition**        | CSV upload, template status, publish      |
| 2   | **Player survey**     | Open/close, completion, chase             |
| 3   | **Coach survey**      | Same, independent lifecycle               |
| 4   | **Completion roster** | Who has / hasn't submitted (Forms parity) |
| 5   | **Summary**           | Section aggregates, withhold rules        |
| 6   | **Export**            | Raw responses + aggregates CSV            |

Blocks 2–3 are a **two-column grid** on desktop; stack on mobile.

---

## Block 1 — Definition

### Header

- **Title:** `End-of-campaign questionnaire`
- **Badge:** `Not set up` | `Draft` | `Published`
- **Subtitle (muted):** `Upload one CSV — player and coach forms are created automatically. Questions 1–8 are player-only.`

### Empty state (no templates)

- **Body:** `No questionnaire loaded for this campaign yet.`
- **Actions:**
  - `Download CSV template` — file `sufa-questionnaire-template.csv`
  - `Choose CSV` — accept `.csv,text/csv`
- **Helper:** `Maintain questions in Google Sheets if you like, then export as CSV. One row per question.`

### After file chosen — preview (before commit)

- **Summary line:** `Player template: 51 questions · Coach template: 43 questions`
- **Counts row:** Create 94 | Skip 0 | Errors 0 (same visual pattern as roster import)
- **Preview table columns:** Row · Section · Question · Type · Audience · Status
- **Primary:** `Commit questionnaire` (disabled if errors > 0)
- **Secondary:** `Clear preview`

### Post-commit (draft templates)

- **Player row:** `Player form · Draft · 51 questions` + `Publish player form`
- **Coach row:** `Coach form · Draft · 43 questions` + `Publish coach form`
- **Warn if re-upload:** `Uploading a new CSV creates new draft versions. Published forms are not changed until you publish again.`

### Published

- **Player:** `Player form · Published · 51 questions` + badge `ready`
- **Coach:** `Coach form · Published · 43 questions` + badge `ready`
- **Muted:** `Published forms are locked. Upload a new CSV to draft a new version.`

### Error states

| Condition                           | Copy                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Missing headers                     | `CSV is missing required columns: {list}. Download the template and try again.` |
| Row errors                          | `Fix {n} row errors before committing. Nothing has been written.`               |
| Duplicate question_order in section | `Row {n}: duplicate question_order {q} in section {s}.`                         |
| Invalid audience                    | `Row {n}: audience must be all, player_only, or coach_only.`                    |
| Invalid answer_type                 | `Row {n}: answer_type must be likert, nps, or text.`                            |
| Import while survey open            | `Close the open player or coach survey before uploading a new CSV.`             |
| Publish while instance open         | `Close the survey before publishing a new template version.`                    |

### Confirm — publish template

```txt
Publish the player questionnaire?

51 questions will be locked. Players can answer after you open the survey.

[Cancel] [Publish]
```

(Same pattern for coach with 43 questions.)

---

## Block 2 & 3 — Player / Coach survey controls

Each column is identical in structure; copy differs by audience.

### Header

- **Player title:** `Player survey`
- **Coach title:** `Coach survey`
- **Badge:** `Closed` (warn) | `Open` (ok)

### Readiness strip (always visible)

`Roster: {n} players · Coaches: {m}` (player column)  
`Coaches assigned: {m}` (coach column)

### Status line

| State             | Copy                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| Not published     | `Publish the {player\|coach} form before opening.`                                 |
| Published, closed | `Ready to open. {n} {players\|coaches} will receive a survey on their next login.` |
| Open              | `{submitted} of {total} submitted · {in_progress} in progress`                     |

### Actions

- **Primary:** `Open {player\|coach} survey` — disabled if not published, prerequisites missing, or already open
- **Secondary:** `Close {player\|coach} survey` — disabled if closed
- **Tertiary:** `Copy chase message` — always enabled when published; includes deep link

### Prerequisites warning

`Import roster players and assign coaches before opening surveys.`

(Player survey also requires roster > 0; coach survey requires coach count > 0.)

### Confirm — open player survey

```txt
Open the player questionnaire?

Opens the in-app survey for {n} players. They complete it after signing in at {appUrl}.

Send the chase message below if players do not use the CRM daily.

[Cancel] [Open survey]
```

### Confirm — open coach survey

```txt
Open the coach questionnaire?

Opens the in-app survey for {m} coaches. Coaches do not see questions 1–8 (coach leadership items).

[Cancel] [Open survey]
```

### Confirm — close

```txt
Close the player questionnaire?

{submitted} of {total} submitted. No further submissions after closing.

[Cancel] [Close survey]
```

### Chase message (clipboard) — player

```txt
Hi — please complete the U24 end-of-tournament questionnaire in the SUFA CRM (about 15 min).

1. Sign in with your player email: {appUrl}
2. Open campaign "{campaignName}"
3. Complete the questionnaire (save as you go)

Deadline: {deadlineOrTbc}

Reply here if you cannot access your account.
```

### Chase message — coach

```txt
Hi — please complete the coach end-of-tournament questionnaire in the SUFA CRM.

1. Sign in: {appUrl}
2. Open campaign "{campaignName}"
3. Complete the questionnaire ({questionCount} questions)

Deadline: {deadlineOrTbc}
```

**Toast after copy:** `Chase message copied. Paste into WhatsApp or Telegram.`

---

## Block 4 — Completion roster

Replaces Google Forms "Responses" tab for ops.

### Header

- **Title:** `Who has responded`
- **Filter chips:** `All` · `Not started` · `In progress` · `Submitted`

### Table columns

| Column    | Content                                                    |
| --------- | ---------------------------------------------------------- |
| Name      | Roster name or coach name                                  |
| Role      | `Player` / `Coach`                                         |
| Survey    | `Player` / `Coach`                                         |
| Status    | `Not started` / `In progress` / `Submitted`                |
| Submitted | datetime or `—`                                            |
| Progress  | `18/51` for in-progress; `—` when not started or submitted |

### Empty states

| Condition            | Copy                                                 |
| -------------------- | ---------------------------------------------------- |
| Nothing published    | `Publish questionnaires before tracking completion.` |
| Published, not open  | `Open a survey to start collecting responses.`       |
| Open, no submissions | `No responses yet. Copy the chase message above.`    |

### Row actions

None in v1 — read-only. (Future: copy single-person reminder.)

---

## Block 5 — Summary (aggregates)

### Header

- **Title:** `Summary`
- **Muted:** `Section averages only. Raw text answers are not shown here. Small groups are withheld.`

### Player / coach tabs or subsections

When both have submissions, show tabs: `Players` · `Coaches`

### Table columns

| Column    | Content                                     |
| --------- | ------------------------------------------- |
| Section   | e.g. Leadership                             |
| Questions | count                                       |
| Responses | submitted count for that section's instance |
| Average   | mean Likert or `Withheld`                   |
| Detail    | `min {n} responses required` when withheld  |

### Withheld badge

`Withheld — fewer than {min} responses`

### Empty

`Open a survey and wait for submissions to see summaries.`

---

## Block 6 — Export

### Header

- **Title:** `Export`

### Actions

- `Download all responses (CSV)` — wide format: one row per rater, columns per question
- `Download summary (CSV)` — section/item aggregates

### Disabled states

| Condition      | Copy                                                           |
| -------------- | -------------------------------------------------------------- |
| No submissions | `No responses to export yet.`                                  |
| Survey open    | allowed — export includes partials (label file with timestamp) |

### Filename pattern

`sufa-{campaignSlug}-questionnaire-responses-{YYYY-MM-DD}.csv`  
`sufa-{campaignSlug}-questionnaire-summary-{YYYY-MM-DD}.csv`

---

## Respondent experience (cross-reference)

Admin spec assumes player/coach UI elsewhere; minimum for admin loop to work:

| Screen         | Entry                       | Copy                                                                  |
| -------------- | --------------------------- | --------------------------------------------------------------------- |
| Campaign home  | Banner when assignment open | `End-of-tournament questionnaire open — {progress} answered`          |
| Survey section | `#survey` anchor            | Section headings from CSV; Likert as radio row 1–5; save on change    |
| Submit         | Bottom of last section      | `Submit questionnaire` — confirm: `You cannot edit after submitting.` |

Deep links for chase messages:

- Player: `{appUrl}/player/campaigns/{campaignId}#survey`
- Coach: `{appUrl}/coach/campaigns/{campaignId}#survey`

---

## State machine (admin-visible)

```txt
Templates:  (none) → draft → published
Instance:   (none) → open → closed
Assignment: pending → in_progress → submitted
```

Rules:

- Cannot open without published template for that audience
- Cannot import CSV while any instance for that campaign is `open`
- Cannot publish new version while instance `open` (same audience)
- Close is idempotent

---

## lib helpers (implementation target)

Mirror `adminCampaignOps.ts` + `rosterImport.ts`:

| Module                      | Functions                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `adminCampaignSurveyOps.ts` | `buildSurveyAdminReadiness`, `formatSurveyOpenConfirm`, `formatSurveyCloseConfirm`, `formatSurveyChaseMessage`, `surveyPrerequisitesMet` |
| `surveyExport.ts`           | `surveyResponsesToCsv`, `surveyAggregatesToCsv`                                                                                          |
| `questionnaireImport.ts`    | `parseQuestionnaireCsv`, `planQuestionnaireImport`, `splitTemplatesByAudience`                                                           |

---

## Google Forms parity checklist

| Forms capability            | This spec                                  |
| --------------------------- | ------------------------------------------ |
| Share link                  | Chase message + deep link (login required) |
| Response count              | Block 2/3 status + Block 4 roster          |
| Raw data export             | Block 6 responses CSV                      |
| Summary charts              | Block 5 aggregates                         |
| Separate player/coach forms | One CSV, two templates                     |
| Edit form after responses   | Blocked with clear error                   |

---

## Decision log

### 2026-07-29: Questionnaire admin panel spec (CSV, dual audience)

End-of-campaign questionnaire is a new `campaign_survey_*` domain, not an extension of peer `campaign_nps_*`. Admin uploads one CSV with `audience` column; import creates player (51 Q) and coach (43 Q) templates. Pilot requires completion roster and response CSV export on `#survey` to match Google Forms ops workflow. Prototype: `docs/prototypes/admin-survey-panel.html`.

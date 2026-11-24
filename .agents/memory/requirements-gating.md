---
name: Requirements gating
description: how new mandatory minimums are scoped
---
New minimums apply only when answers.requirementsVersion>=2 (stamped on new drafts) unless APPLY_NEW_REQUIREMENTS_TO_EXISTING, except Question 10.

**Why:** user spec: existing submissions/drafts must keep old rules.

**How to apply:** gate other new validation with usesNewRequirements(answers). Local-restore paths must also restore fillMode/activePartner or header shows Together.

Question 10 requires at least five named people per partner, with one photo and a relationship for each, including existing drafts.

**Why:** the user confirmed five people per partner after showing an existing draft accepting only one entry for the second partner.

**How to apply:** enforce this question's rule independently of requirementsVersion. Separate mode requires only the active partner's five people; Together mode requires both partners' five people.

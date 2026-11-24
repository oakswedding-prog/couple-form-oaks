---
name: Requirements gating
description: how new mandatory minimums are scoped
---
New minimums (config/questionnaireRequirements.ts) apply only when answers.requirementsVersion>=2 (stamped on new drafts) unless APPLY_NEW_REQUIREMENTS_TO_EXISTING.

**Why:** user spec: existing submissions/drafts must keep old rules.

**How to apply:** gate any new validation with usesNewRequirements(answers). Local-restore paths must also restore fillMode/activePartner or header shows Together.

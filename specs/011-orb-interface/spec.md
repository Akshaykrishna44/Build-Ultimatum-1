# Spec 011 — Orb interface

| | |
|---|---|
| **Status** | Implemented |
| **Owner** | AK |
| **Created** | 2026-11-18 |
| **Shipped in** | v0.7.0 (published page); ported into source in v0.8.0 |
| **Modes** | both |
| **Depends on** | 001 (router, End task FR-001-08) |

Approved by AK on 18 Nov 2026 ("create this project fully"), with the proposed answers in §8.

## 0. Mission fit
**Any request:** one box and one living orb invite the user to ask for anything, without first choosing a category.
**Every aspect:** the orb carries the user from the request into the existing expert interview and results.
**Smart solution:** the orb shows honestly when the engine is working, so the wait for an answer is understood. This spec does not change any calculation, rate or estimate.

## 1. Problem
The start screen looked like a form. Replace it with a large animated orb and a single text box, give the orb four states tied to what the engine is really doing, and apply the orb's colours across the app.

## 2. Goals / Non-goals
**Goals:** one clear place to type; a visible state (listening, working, asking); leave at any time without losing work; usable with reduced motion.
**Non-goals:** rates, market prices, estimate logic, new interview questions, routing rule changes.

## 3. User stories
- As a user, I see one clear place to type, so I can start without learning the app.
- As a user, I can see that the engine is listening, working or asking me something.
- As a user, I can leave at any time without losing my work.
- As a user who prefers less motion, I can use the app without the animation.

## 4. Functional requirements
| ID | Requirement |
|---|---|
| FR-011-01 | The start screen shows only the product name, the orb, the prompt "What do you want to manufacture, build, grow or sell?", one text box and one submit button. Resume links appear only when saved work exists; the no-AI notice only when no back end is available. No example chips. |
| FR-011-02 | The orb has exactly four states: resting, listening, thinking, asking. One function (`orbState`) derives the state from app state. |
| FR-011-03 | The orb is listening while the start box holds non-blank text, resting when blank. |
| FR-011-04 | The orb is thinking only while a real routing or AI request runs (no fixed timer). |
| FR-011-05 | Submitting blank text shows an inline error, makes no routing or AI request, and leaves the orb resting. |
| FR-011-06 | Submitting text calls the existing router from spec 001 with unchanged rules. |
| FR-011-07 | When the router finds the request ambiguous, the screen asks whether to build the factory or make the product, and continues in the chosen engine. |
| FR-011-08 | In the asking state the orb shrinks and the screen shows "Now asking" with the selected engine's name. |
| FR-011-09 | End task (FR-001-08) stays available while thinking and asking, with unchanged behaviour. |
| FR-011-10 | If a routing or AI request fails, the orb leaves thinking, an error with a retry action is shown, and the user's text is kept. |
| FR-011-11 | Orb and interface colours are defined once as `--ue-*` design tokens and used by the start, interview and results screens. |
| FR-011-12 | Every screen uses the light theme: light page, white panels, white top bar, dark text. |

## 5. Calculations & rules
None. Palette: steel `#8FA0AD`, graphite `#3E4A54`, gunmetal `#1F2830`, lime spark `#C6F135` (AK, v0.7.2).

## 6. Acceptance criteria
- AC-1: Fresh start page shows the orb (`data-orb-state=resting`), the prompt, `#ue-ask` and a Start button, and no chips.
- AC-2: Typing turns the orb to listening; clearing it returns to resting.
- AC-3: Submitting blank shows "Enter what you have in mind first." and nothing starts.
- AC-4: "garment factory in Tiruppur" shows "Build the factory" / "Make the product".
- AC-5: The building engine shows "Now asking" with the engine label.

## 7. Non-functional requirements
- **NFR-011-01 Reduced motion:** with reduced motion on, orb movement and rings stop.
- **NFR-011-02 Readability:** text ≥ 4.5:1, controls and their boundaries ≥ 3:1 (text box border `--ue-control` #7B8570).
- **NFR-011-03 Keyboard and screen readers:** visible focus mark; orb `aria-hidden`; state changes announced as text.
- **NFR-011-04 No new runtime dependency:** HTML and CSS only.
- **NFR-011-05 Small screens:** no horizontal scrolling at phone width.
- **NFR-011-06 Own identity:** forged-steel palette, no third-party assistant artwork.

## 8. Open questions / clarifications
| # | Question | Decision |
|---|---|---|
| C1 | Spec 001 §7 dark-host rule vs the orb design | Text in boxes must always meet 4.5:1 against its box. |
| C2 | New colours for the whole app or only the start screen? | Whole app (FR-011-11). |
| C3 | Version number? | v0.7.0 (v0.6.0 was the rolled-back archive). |
| C4 | Theme? | Light only (AK, v0.7.1). |

## 9. Out of scope / future
The Python API (spec 004) and testing with a real AI model. History: v0.7.x was built by patching the published page; in v0.8.0 it was ported into the React source (`components/Orb.jsx`, `StartView.jsx`, `styles.css` spec 011 section), verified pixel-equal to v0.7.2 at 1366×860.
